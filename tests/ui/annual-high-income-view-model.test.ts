import { describe, it, expect } from 'vitest';
import {
  annualHighIncomeQueryKey,
  formatAnnualHighIncomeViewModel,
  highIncomeStatusLabel,
  highIncomeClassificationLabel,
  highIncomeCategoryLabel,
  highIncomePayerTypeLabel,
  highIncomePayerStatusLabel,
  highIncomeEvidenceStatusLabel,
  highIncomeBlockerPriorityKey,
  type RawAnnualHighIncomeAssessment,
} from '@atlas/ui';

function raw(
  overrides: Partial<RawAnnualHighIncomeAssessment> = {},
): RawAnnualHighIncomeAssessment {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    ruleVersion: '2025-11-26-LEI-15270-ART-16A',
    status: 'CALCULABLE',
    applicability: 'APPLICABLE',
    totalAnnualIncome: '700000',
    applicabilityThreshold: '600000',
    minimumTaxBase: '700000',
    rateBand: 'TRANSITION',
    minimumRatePercentage: '1.6666666667',
    grossMinimumTax: '11666.67',
    credits: [],
    supportedCreditsTotal: '0',
    reductions: [],
    supportedReductionsTotal: '0',
    corporateRedutor: null,
    netMinimumTax: '3500',
    creditExcess: null,
    incomeBreakdown: [],
    evidenceRequirements: [],
    evidence: [],
    blockingReasons: [],
    limitations: [],
    upstreamIncomeStatus: 'COMPLETE',
    upstreamIncomeFingerprint: 'f'.repeat(64),
    upstreamCapitalMarketFingerprint: 'e'.repeat(64),
    sourceFingerprint: 'a'.repeat(64),
    calculationFingerprint: 'b'.repeat(64),
    ...overrides,
  };
}

describe('UI View Model: Annual High-Income Assessment', () => {
  it('query key is namespaced per year', () => {
    expect(annualHighIncomeQueryKey(2026)).toEqual(['fiscal', 'annual', '2026', 'high-income']);
  });

  it('null/undefined/array/missing fields fail safely without crash', () => {
    expect(formatAnnualHighIncomeViewModel(null)).toBeNull();
    expect(formatAnnualHighIncomeViewModel(undefined)).toBeNull();
    expect(
      formatAnnualHighIncomeViewModel([] as unknown as RawAnnualHighIncomeAssessment),
    ).toBeNull();
    expect(formatAnnualHighIncomeViewModel({} as RawAnnualHighIncomeAssessment)).toBeNull();
    expect(
      formatAnnualHighIncomeViewModel({ status: 'CALCULABLE' } as RawAnnualHighIncomeAssessment),
    ).toBeNull();
  });

  it('zero renders as R$ 0,00 while null renders as em-dash', () => {
    const vm = formatAnnualHighIncomeViewModel(
      raw({ netMinimumTax: '0', grossMinimumTax: '0', minimumTaxBase: '0', creditExcess: '0' }),
    )!;
    expect(vm.formattedNetMinimumTax).toContain('0,00');
    expect(vm.formattedGrossMinimumTax).toContain('0,00');

    const unknown = formatAnnualHighIncomeViewModel(
      raw({ netMinimumTax: null, grossMinimumTax: null, minimumTaxBase: null }),
    )!;
    expect(unknown.formattedNetMinimumTax).toBe('—');
    expect(unknown.formattedGrossMinimumTax).toBe('—');
    expect(unknown.formattedMinimumTaxBase).toBe('—');
    expect(unknown.isAuthoritativeNet).toBe(false);
  });

  it('blocked/unknown never display as zero or final', () => {
    const vm = formatAnnualHighIncomeViewModel(
      raw({ status: 'BLOCKED', netMinimumTax: null, blockingReasons: ['X'] }),
    )!;
    expect(vm.statusLabel).toBe('Bloqueado');
    expect(vm.formattedNetMinimumTax).toBe('—');
    expect(vm.isAuthoritativeNet).toBe(false);
  });

  it('status labels cover the frozen set', () => {
    expect(highIncomeStatusLabel('NOT_APPLICABLE')).toBe('Não aplicável');
    expect(highIncomeStatusLabel('CALCULABLE')).toBe('Apurado pelo Atlas');
    expect(highIncomeStatusLabel('INCOMPLETE_CREDITS')).toBe('Créditos pendentes');
    expect(highIncomeStatusLabel('INCOMPLETE_REDUCTION_DATA')).toBe(
      'Evidência corporativa pendente',
    );
    expect(highIncomeStatusLabel('REQUIRES_CONFIRMATION')).toBe('Requer confirmação');
    expect(highIncomeStatusLabel('BLOCKED')).toBe('Bloqueado');
    expect(highIncomeStatusLabel('UNSUPPORTED_YEAR')).toBe('Ano não suportado');
    expect(highIncomeStatusLabel('UNSUPPORTED_INPUT')).toBe('Dados não suportados');
    expect(highIncomeStatusLabel('SOMETHING_NEW')).toBe('Status desconhecido');
  });

  it('classification and category labels are human-readable', () => {
    expect(highIncomeClassificationLabel('INCLUDED')).toBe('Incluído na base');
    expect(highIncomeClassificationLabel('EXCLUDED')).toContain('Excluído');
    expect(highIncomeClassificationLabel('CONDITIONAL')).toContain('Condicional');
    expect(highIncomeClassificationLabel('REQUIRES_CONFIRMATION')).toBe('Requer confirmação');
    expect(highIncomeClassificationLabel('UNSUPPORTED')).toContain('Sem suporte');
    expect(highIncomeCategoryLabel('DIVIDEND')).toContain('Dividendos');
    expect(highIncomeCategoryLabel('DIVIDEND_TRANSITION')).toContain('transição');
    expect(highIncomeCategoryLabel('JCP')).toContain('JCP');
    expect(highIncomeCategoryLabel('FII_INCOME')).toContain('FII');
    expect(highIncomeCategoryLabel('EQUITY_DAY_TRADE_GAIN')).toContain('Day trade');
  });

  it('payer type and status labels distinguish zero from unknown', () => {
    expect(highIncomePayerTypeLabel('STANDARD_CORPORATE')).toContain('34%');
    expect(highIncomePayerTypeLabel('INSURANCE_CAPITALIZATION_REGULATED')).toContain('40%');
    expect(highIncomePayerTypeLabel('FINANCIAL_INSTITUTION')).toContain('45%');
    expect(highIncomePayerStatusLabel('APPLICABLE')).toBe('Redutor apurado');
    expect(highIncomePayerStatusLabel('REQUIRES_EVIDENCE')).toBe('Evidência necessária');
    expect(highIncomeEvidenceStatusLabel('AUTHORITATIVE')).toBe('Comprovação válida');
    expect(highIncomeEvidenceStatusLabel('REQUIRES_CONFIRMATION')).toBe('Aguardando comprovação');
  });

  it('blocker priority orders BLOCKED before MISSING before STALE', () => {
    expect(highIncomeBlockerPriorityKey('SOMETHING_BLOCKED_HERE')).toBeLessThan(
      highIncomeBlockerPriorityKey('EVIDENCE_MISSING_X'),
    );
    expect(highIncomeBlockerPriorityKey('EVIDENCE_MISSING_X')).toBeLessThan(
      highIncomeBlockerPriorityKey('EVIDENCE_STALE_X'),
    );
    expect(highIncomeBlockerPriorityKey('EVIDENCE_STALE_X')).toBeLessThan(
      highIncomeBlockerPriorityKey('REQUIRES_CONFIRMATION_X'),
    );
  });

  it('readiness progress derives from server requirements only', () => {
    const vm = formatAnnualHighIncomeViewModel(
      raw({
        evidenceRequirements: [
          {
            requirementId: 'a',
            requirement: 'ANNUAL_INCOME_TOTAL',
            subjectId: 's',
            title: 't',
            status: 'SATISFIED',
            legalReference: 'r',
            blockingReason: null,
          },
          {
            requirementId: 'b',
            requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            subjectId: 's',
            title: 't',
            status: 'PENDING',
            legalReference: 'r',
            blockingReason: 'X',
          },
        ],
      }),
    )!;
    expect(vm.readinessProgress).toEqual({ completed: 1, total: 2 });
  });

  it('rate band labels and currency formatting use exact server strings', () => {
    const vm = formatAnnualHighIncomeViewModel(raw({ rateBand: 'TRANSITION' }))!;
    expect(vm.rateBandLabel).toContain('transição');
    expect(vm.formattedTotalAnnualIncome).toContain('700.000,00');
    expect(vm.formattedMinimumRate).toContain('1,');
    expect(vm.formattedMinimumRate).toContain('%');
  });
});
