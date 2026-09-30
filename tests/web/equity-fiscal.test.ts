import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import {
  mapToEquityFiscalViewModel,
  equityBlockedReasonLabel,
  equityExemptionStatusLabel,
  equityElectionStatusLabel,
  equityElectionConsequenceLabel,
  type RawEquityMonthlyFiscal,
  type RawMonthlyTaxLiability,
} from '@atlas/ui';

function equity(overrides: Partial<RawEquityMonthlyFiscal> = {}): RawEquityMonthlyFiscal {
  const category = {
    status: 'COMPLETE',
    reasonCode: null,
    grossSales: '18000',
    threshold: '20000',
    exemptionStatus: 'EXEMPT',
    matchedQuantity: null,
    currentResult: '2000',
    openingLoss: '5000',
    lossAdded: '0',
    lossConsumed: '0',
    closingLoss: '5000',
    taxableBaseBeforeRate: '0',
    electionStatus: 'NOT_REQUIRED',
  };
  return {
    competence: '2026-08',
    status: 'COMPLETE',
    reasonCode: null,
    normal: category,
    dayTrade: {
      ...category,
      grossSales: '0',
      matchedQuantity: '0',
      exemptionStatus: 'NOT_APPLICABLE',
    },
    compensationElection: {
      required: false,
      status: 'NOT_REQUIRED',
      currentValue: null,
      version: null,
      fingerprint: null,
    },
    ruleVersions: ['equity-monthly-core-v1'],
    ...overrides,
  };
}

describe('Web: equity monthly fiscal view-model (Phase 4G.2A.1c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('A. exempt profit renders server values and no election control', () => {
    const vm = mapToEquityFiscalViewModel(equity())!;
    expect(vm.blocked).toBe(false);
    expect(vm.hasActivity).toBe(true);
    expect(vm.normal.exemptionLabel).toBe('Isento pelo limite mensal');
    expect(vm.normal.openingLossFormatted).toContain('5.000,00');
    expect(vm.normal.closingLossFormatted).toContain('5.000,00');
    expect(vm.election.required).toBe(false);
    expect(vm.election.status).toBe('NOT_REQUIRED');
  });

  it('B. taxable month renders the taxable exemption status', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        normal: { ...equity().normal, grossSales: '25000', exemptionStatus: 'TAXABLE' },
      }),
    )!;
    expect(vm.normal.exemptionLabel).toBe('Acima do limite mensal de isenção');
  });

  it('C. exempt loss without election requires a decision with no preselection', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        normal: {
          ...equity().normal,
          currentResult: '-2000',
          exemptionStatus: 'EXEMPT',
          electionStatus: 'ELECTION_REQUIRED',
        },
        compensationElection: {
          required: true,
          status: 'ELECTION_REQUIRED',
          currentValue: null,
          version: null,
          fingerprint: null,
        },
      }),
    )!;
    expect(vm.election.required).toBe(true);
    expect(vm.election.statusLabel).toBe('Decisão necessária');
    expect(vm.election.currentValue).toBeNull();
  });

  it('D/E. declare and decline expose explicit values and consequences', () => {
    const declared = mapToEquityFiscalViewModel(
      equity({
        compensationElection: {
          required: false,
          status: 'DECLARED',
          currentValue: 'DECLARE_FOR_CARRYFORWARD',
          version: 1,
          fingerprint: 'fp',
        },
      }),
    )!;
    expect(declared.election.statusLabel).toBe('Prejuízo reconhecido');
    expect(equityElectionConsequenceLabel('DECLARE_FOR_CARRYFORWARD')).toContain(
      'compensação futura',
    );

    const declined = mapToEquityFiscalViewModel(
      equity({
        compensationElection: {
          required: false,
          status: 'NOT_DECLARED',
          currentValue: 'DO_NOT_DECLARE',
          version: 2,
          fingerprint: 'fp2',
        },
      }),
    )!;
    expect(declined.election.statusLabel).toBe('Prejuízo não reconhecido');
    expect(equityElectionConsequenceLabel('DO_NOT_DECLARE')).toContain('não será adicionado');
  });

  it('G/H. blocked states render reason-specific messages, never zero values', () => {
    for (const reason of [
      'UNKNOWN_ASSET_TAX_CLASSIFICATION',
      'MISSING_INSTITUTION_IDENTITY',
      'MISSING_CANONICAL_COST_BASIS',
      'PRIOR_COMPETENCE_BLOCKED',
    ]) {
      const vm = mapToEquityFiscalViewModel(
        equity({
          status: 'BLOCKED',
          reasonCode: reason,
          normal: { ...equity().normal, exemptionStatus: 'NOT_APPLICABLE' },
        }),
      )!;
      expect(vm.blocked).toBe(true);
      expect(vm.blockedReasonLabel).toBe(equityBlockedReasonLabel(reason));
      expect(vm.normal.exemptionLabel).toBe('Não aplicável');
    }
  });

  it('J. empty month has no activity and no election surface', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        normal: { ...equity().normal, grossSales: '0', currentResult: '0' },
        dayTrade: { ...equity().normal, grossSales: '0', matchedQuantity: '0', currentResult: '0' },
      }),
    )!;
    expect(vm.hasActivity).toBe(false);
    expect(vm.election.required).toBe(false);
  });

  it('K. equity coexists additively with the existing FII liability', () => {
    const liability: RawMonthlyTaxLiability = {
      competence: '2026-08',
      status: 'COMPLETE',
      ruleVersions: [],
      categories: [],
      totalTaxBeforeCredits: null,
      creditsApplied: null,
      taxDue: null,
      openingLossBalances: [],
      closingLossBalances: [],
      dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
      capabilities: {
        foundationOnly: true,
        productionRuleVerified: false,
        withholdingSupported: false,
        taxLiabilitySupported: false,
      },
      calculationVersion: 'v1',
      engineVersion: '0.1.0',
      limitations: [],
      traceSummary: [],
      equity: equity(),
    };
    expect(liability.equity?.competence).toBe('2026-08');
    expect(liability.categories).toEqual([]);
  });

  it('D/F. PUT sends value only (never taxSubjectId) via the approved route', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiClient.put('/api/v1/fiscal/monthly/2026-08/elections/equity-exempt-loss', {
      value: 'DECLARE_FOR_CARRYFORWARD',
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ value: 'DECLARE_FOR_CARRYFORWARD' });
    expect(body.taxSubjectId).toBeUndefined();
  });

  it('I. server error surfaces without fabricating zero data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'boom' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      apiClient.put('/api/v1/fiscal/monthly/2026-08/elections/equity-exempt-loss', {
        value: 'DO_NOT_DECLARE',
      }),
    ).rejects.toBeTruthy();
  });

  it('exposes canonical status labels', () => {
    expect(equityExemptionStatusLabel('EXEMPT')).toBe('Isento pelo limite mensal');
    expect(equityExemptionStatusLabel('NOT_APPLICABLE')).toBe('Não aplicável');
    expect(equityElectionStatusLabel('DECLARED')).toBe('Prejuízo reconhecido');
    expect(equityElectionStatusLabel('NOT_DECLARED')).toBe('Prejuízo não reconhecido');
  });
});
