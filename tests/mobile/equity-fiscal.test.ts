import { describe, it, expect } from 'vitest';
import {
  mapToEquityFiscalViewModel,
  equityElectionStatusLabel,
  type RawEquityMonthlyFiscal,
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

describe('Mobile: equity monthly fiscal read-only view-model (Phase 4G.2A.1c)', () => {
  it('A. renders server-computed exempt-profit values', () => {
    const vm = mapToEquityFiscalViewModel(equity())!;
    expect(vm.blocked).toBe(false);
    expect(vm.normal.exemptionLabel).toBe('Isento pelo limite mensal');
    expect(vm.normal.grossSalesFormatted).toContain('18.000,00');
    expect(vm.normal.openingLossFormatted).toContain('5.000,00');
    expect(vm.normal.closingLossFormatted).toContain('5.000,00');
  });

  it('B. election required shows decision-needed status and no value', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
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
  });

  it('C. declared shows recognized loss', () => {
    const vm = mapToEquityFiscalViewModel(
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
    expect(vm.election.statusLabel).toBe('Prejuízo reconhecido');
  });

  it('D. not declared shows unrecognized loss', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        compensationElection: {
          required: false,
          status: 'NOT_DECLARED',
          currentValue: 'DO_NOT_DECLARE',
          version: 1,
          fingerprint: 'fp',
        },
      }),
    )!;
    expect(vm.election.statusLabel).toBe('Prejuízo não reconhecido');
  });

  it('E. blocked renders the server reason without local calculation', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        status: 'BLOCKED',
        reasonCode: 'MISSING_CANONICAL_COST_BASIS',
        normal: { ...equity().normal, exemptionStatus: 'NOT_APPLICABLE' },
      }),
    )!;
    expect(vm.blocked).toBe(true);
    expect(vm.blockedReasonLabel).toContain('custo');
    expect(vm.normal.exemptionLabel).toBe('Não aplicável');
  });

  it('F. empty month is a stable no-activity state', () => {
    const vm = mapToEquityFiscalViewModel(
      equity({
        normal: { ...equity().normal, grossSales: '0', currentResult: '0' },
        dayTrade: { ...equity().normal, grossSales: '0', matchedQuantity: '0', currentResult: '0' },
      }),
    )!;
    expect(vm.hasActivity).toBe(false);
    expect(equityElectionStatusLabel('NOT_REQUIRED')).toBe('Não aplicável');
  });
});
