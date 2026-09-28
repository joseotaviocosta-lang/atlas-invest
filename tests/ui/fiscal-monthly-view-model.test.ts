import { describe, it, expect } from 'vitest';
import {
  mapToFiscalMonthlyViewModel,
  fiscalCategoryLabel,
  fiscalEventTypeLabel,
  fiscalQualityIssueLabel,
  type RawFiscalMonthlyState,
} from '@atlas/ui';

function base(over: Partial<RawFiscalMonthlyState> = {}): RawFiscalMonthlyState {
  return {
    competence: '2026-09',
    status: 'COMPLETE',
    eventCount: 0,
    currencies: ['BRL'],
    categories: [],
    events: [],
    dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
    ruleSetVersion: 'BR_TEST_2026_V1',
    ruleSetStatus: 'TEST_ONLY',
    capabilities: {
      foundationOnly: true,
      productionRuleVerified: false,
      withholdingSupported: false,
      taxLiabilitySupported: false,
    },
    projectionVersion: 'fiscal-projection-v1',
    engineVersion: '0.1.0',
    ...over,
  };
}

describe('UI: Fiscal Monthly view-model (Phase 4A)', () => {
  it('returns null for null input', () => {
    expect(mapToFiscalMonthlyViewModel(null)).toBeNull();
  });

  it('maps an EMPTY month without inventing values', () => {
    const vm = mapToFiscalMonthlyViewModel(
      base({
        status: 'EMPTY',
        eventCount: 0,
        dataQuality: { status: 'EMPTY', issues: [], issueCount: 0 },
      }),
    )!;
    expect(vm.isEmpty).toBe(true);
    expect(vm.competenceLabel).toBe('09/2026');
    expect(vm.statusLabel).toMatch(/Sem eventos fiscais/);
    expect(vm.categories).toHaveLength(0);
    expect(vm.dataQuality.hasIssues).toBe(false);
  });

  it('maps COMPLETE categories and formats decimals via formatters', () => {
    const vm = mapToFiscalMonthlyViewModel(
      base({
        eventCount: 2,
        categories: [
          {
            category: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            capability: 'CALCULABLE',
            eventCount: 2,
            salesProceeds: { amount: '300', currency: 'BRL' },
            realizedGain: { amount: '50', currency: 'BRL' },
            realizedLoss: null,
            income: null,
            withholding: null,
            qualityIssues: [],
          },
        ],
        events: [
          {
            id: 'e1',
            sourceTransactionId: 't1',
            economicDate: '2026-09-10',
            competence: '2026-09',
            sourceTransactionType: 'BUY',
            eventType: 'PURCHASE',
            relevance: 'INFORMATIONAL',
            taxAssetCategory: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            quantity: '10',
            qualityIssues: [],
          },
          {
            id: 'e2',
            sourceTransactionId: 't2',
            economicDate: '2026-09-20',
            competence: '2026-09',
            sourceTransactionType: 'SELL',
            eventType: 'SALE',
            relevance: 'TAXABLE',
            taxAssetCategory: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            quantity: '10',
            qualityIssues: [],
          },
        ],
      }),
    )!;
    expect(vm.isComplete).toBe(true);
    expect(vm.categories[0]!.categoryLabel).toBe('Ações brasileiras');
    expect(vm.categories[0]!.salesProceedsFormatted).toBe('R$ 300,00');
    expect(vm.categories[0]!.realizedGainFormatted).toBe('R$ 50,00');
    expect(vm.categories[0]!.realizedLossFormatted).toBe('—');
    expect(vm.eventsSummary.map((e) => e.label).sort()).toEqual(['Compra', 'Venda']);
  });

  it('maps PARTIAL months with human-readable quality issues', () => {
    const vm = mapToFiscalMonthlyViewModel(
      base({
        status: 'PARTIAL',
        categories: [
          {
            category: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            capability: 'PARTIAL',
            eventCount: 1,
            salesProceeds: { amount: '300', currency: 'BRL' },
            realizedGain: null,
            realizedLoss: null,
            income: null,
            withholding: null,
            qualityIssues: ['UNKNOWN_COST_BASIS'],
          },
        ],
        dataQuality: { status: 'PARTIAL', issues: ['UNKNOWN_COST_BASIS'], issueCount: 1 },
      }),
    )!;
    expect(vm.isPartial).toBe(true);
    expect(vm.dataQuality.hasIssues).toBe(true);
    expect(vm.dataQuality.issueLabels).toContain('Custo de aquisição incompleto');
    // A partial sale never yields a fabricated realized gain.
    expect(vm.categories[0]!.realizedGainFormatted).toBe('—');
  });

  it('maps BLOCKED months (missing rule set)', () => {
    const vm = mapToFiscalMonthlyViewModel(
      base({
        status: 'BLOCKED',
        ruleSetVersion: null,
        ruleSetStatus: null,
        dataQuality: { status: 'BLOCKED', issues: ['MISSING_RULE_SET'], issueCount: 1 },
      }),
    )!;
    expect(vm.isBlocked).toBe(true);
    expect(vm.statusLabel).toMatch(/bloqueada/);
    expect(vm.ruleSetLabel).toMatch(/Sem conjunto de regras/);
  });

  it('never exposes a taxDue field (foundation only)', () => {
    const vm = mapToFiscalMonthlyViewModel(base())!;
    expect(vm).not.toHaveProperty('taxDue');
    expect(JSON.stringify(vm)).not.toMatch(/taxDue|impostoDevido/);
    expect(vm.foundationNotice).toMatch(/Nenhum imposto a pagar/);
  });

  it('exposes stable human labels', () => {
    expect(fiscalCategoryLabel('FII')).toBe('Fundos imobiliários (FII)');
    expect(fiscalCategoryLabel('UNKNOWN')).toBe('Não classificado');
    expect(fiscalEventTypeLabel('TRANSFER_IN')).toBe('Transferência (entrada)');
    expect(fiscalQualityIssueLabel('UNSUPPORTED_CURRENCY')).toMatch(/Moeda/);
  });
});
