import { describe, it, expect } from 'vitest';
import { mapToMonthlyTaxLiabilityViewModel, type RawMonthlyTaxLiability } from '@atlas/ui';

function base(over: Partial<RawMonthlyTaxLiability> = {}): RawMonthlyTaxLiability {
  return {
    competence: '2026-09',
    status: 'COMPLETE',
    ruleVersions: ['verified-1'],
    categories: [],
    totalTaxBeforeCredits: null,
    creditsApplied: null,
    taxDue: { amount: '15', currency: 'BRL' },
    openingLossBalances: [],
    closingLossBalances: [],
    dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
    capabilities: {
      foundationOnly: true,
      productionRuleVerified: true,
      withholdingSupported: false,
      taxLiabilitySupported: true,
    },
    calculationVersion: 'tax-calculation-v1',
    engineVersion: '0.1.0',
    limitations: [],
    traceSummary: [],
    ...over,
  };
}

const category = {
  category: 'BRAZILIAN_EQUITY',
  currency: 'BRL',
  status: 'COMPLETE',
  ruleVersion: 'verified-1',
  ruleSetStatus: 'VERIFIED',
  grossSales: { amount: '300', currency: 'BRL' },
  realizedResult: { amount: '100', currency: 'BRL' },
  taxableBaseBeforeLosses: { amount: '100', currency: 'BRL' },
  openingLossBalance: { amount: '0', currency: 'BRL' },
  lossApplied: { amount: '0', currency: 'BRL' },
  lossGenerated: { amount: '0', currency: 'BRL' },
  closingLossBalance: { amount: '0', currency: 'BRL' },
  taxableBaseAfterLosses: { amount: '100', currency: 'BRL' },
  ratePercentage: '15',
  taxBeforeWithholding: { amount: '15', currency: 'BRL' },
  withholdingAvailable: { amount: '0', currency: 'BRL' },
  withholdingApplied: { amount: '0', currency: 'BRL' },
  taxDue: { amount: '15', currency: 'BRL' },
  qualityIssues: [] as string[],
  trace: [
    {
      stage: 'RATE',
      operation: 'apply-statutory-rate',
      status: 'OK',
      ruleVersion: 'verified-1',
      exactOutput: '15',
    },
  ],
};

describe('UI: Monthly Tax Liability view-model (Phase 4B)', () => {
  it('returns null for null input', () => {
    expect(mapToMonthlyTaxLiabilityViewModel(null)).toBeNull();
  });

  it('formats a COMPLETE liability with tax due', () => {
    const vm = mapToMonthlyTaxLiabilityViewModel(base({ categories: [category] }))!;
    expect(vm.isComplete).toBe(true);
    expect(vm.hasTaxDue).toBe(true);
    expect(vm.taxDueFormatted).toBe('R$ 15,00');
    expect(vm.categories[0]!.categoryLabel).toBe('Ações brasileiras');
    expect(vm.categories[0]!.taxDueFormatted).toBe('R$ 15,00');
    expect(vm.categories[0]!.rateFormatted).toBe('15%');
  });

  it('never shows a fabricated tax due for BLOCKED', () => {
    const vm = mapToMonthlyTaxLiabilityViewModel(
      base({
        status: 'BLOCKED',
        taxDue: null,
        dataQuality: { status: 'BLOCKED', issues: ['MISSING_RULE_SET'], issueCount: 1 },
      }),
    )!;
    expect(vm.isBlocked).toBe(true);
    expect(vm.hasTaxDue).toBe(false);
    expect(vm.taxDueFormatted).toBe('—');
    expect(vm.qualityLabels).toContain('Sem conjunto de regras vigente');
  });

  it('marks PARTIAL and NO_ACTIVITY distinctly', () => {
    const partial = mapToMonthlyTaxLiabilityViewModel(base({ status: 'PARTIAL', taxDue: null }))!;
    expect(partial.isPartial).toBe(true);
    expect(partial.taxDueFormatted).toBe('—');

    const none = mapToMonthlyTaxLiabilityViewModel(
      base({ status: 'NO_ACTIVITY', taxDue: { amount: '0', currency: 'BRL' } }),
    )!;
    expect(none.isNoActivity).toBe(true);
    expect(none.taxDueFormatted).toBe('R$ 0,00');
  });

  it('exposes losses, withholding and trace for the UI', () => {
    const vm = mapToMonthlyTaxLiabilityViewModel(
      base({
        categories: [
          {
            ...category,
            openingLossBalance: { amount: '100', currency: 'BRL' },
            lossApplied: { amount: '100', currency: 'BRL' },
            closingLossBalance: { amount: '0', currency: 'BRL' },
          },
        ],
        closingLossBalances: [
          {
            category: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            amount: { amount: '0', currency: 'BRL' },
            provenance: 'REPLAY',
          },
        ],
        traceSummary: [
          {
            stage: 'RATE',
            operation: 'apply-statutory-rate',
            status: 'OK',
            ruleVersion: 'verified-1',
            exactOutput: '15',
          },
        ],
      }),
    )!;
    expect(vm.categories[0]!.openingLossFormatted).toBe('R$ 100,00');
    expect(vm.closingLosses[0]!.amountFormatted).toBe('R$ 0,00');
    expect(vm.trace.length).toBeGreaterThan(0);
    expect(vm.trace[0]!.ruleVersion).toBe('verified-1');
  });

  it('contains no tax arithmetic (presentation only)', () => {
    const vm = mapToMonthlyTaxLiabilityViewModel(base({ categories: [category] }))!;
    expect(JSON.stringify(vm)).not.toMatch(/parseFloat|Math\./);
  });
});
