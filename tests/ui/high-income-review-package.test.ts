import { describe, it, expect } from 'vitest';
import {
  formatHighIncomeReviewPackageViewModel,
  highIncomeReviewPackageQueryKey,
  highIncomeReviewPackageStatusLabel,
  highIncomeApplicableLabel,
  highIncomeFilingMappingStatusLabel,
  type RawHighIncomeReviewPackage,
} from '@atlas/ui';

function basePackage(
  overrides: Partial<RawHighIncomeReviewPackage> = {},
): RawHighIncomeReviewPackage {
  return {
    packageVersion: 'high-income-annual-review-package-v1',
    status: 'READY_FOR_REVIEW',
    generatedAt: '2027-03-15T00:00:00.000Z',
    packageFingerprint: 'fp-a',
    disclaimer: 'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL.',
    section1Identity: {
      calendarYear: 2026,
      declarationExercise: 2027,
      ruleVersion: 'high-income-v1',
      generatedAt: '2027-03-15T00:00:00.000Z',
      packageVersion: 'high-income-annual-review-package-v1',
    },
    section2Applicability: {
      status: 'APPLICABLE',
      totalAnnualIncome: '1000000.00',
      eligibilityThreshold: '600000.00',
      thresholdMetric: 'TOTAL_ANNUAL_INCOME',
      applicable: true,
      blockingReasons: [],
    },
    section3IncomeComposition: { rows: [] },
    section4Calculation: {
      minimumTaxBase: '1000000.00',
      rateBand: 'MAXIMUM',
      minimumRatePercentage: '10',
      grossMinimumTax: '100000.00',
      supportedCreditsTotal: '0.00',
      supportedReductionsTotal: '0.00',
      corporateRedutorSupportedTotal: null,
      netMinimumTax: '100000.00',
      creditExcess: null,
      netIsAuthoritative: true,
    },
    section5Credits: {
      credits: [],
      reductions: [],
      supportedCreditsTotal: '0.00',
      supportedReductionsTotal: '0.00',
    },
    section6CorporateRedutorByPayer: {
      present: false,
      aggregateVersion: null,
      status: null,
      payerCount: 0,
      computedPayerCount: 0,
      totalEligibleDividends: null,
      totalReductionExact: null,
      totalSupportedReduction: null,
      payers: [],
      blockingPayers: [],
      blockingReasons: [],
    },
    section7Readiness: {
      counts: { total: 0, ready: 0, missing: 0, stale: 0, conflicting: 0, unsupported: 0 },
      requirements: [],
      evidence: [],
    },
    section8Provenance: {
      upstreamCapitalMarketFingerprint: 'cm',
      upstreamIncomeFingerprint: 'inc',
      upstreamIncomeStatus: 'COMPLETE',
      sourceFingerprint: 'src',
      calculationFingerprint: 'calc',
      corporateRedutorSourceFingerprint: null,
      corporateRedutorCalculationFingerprint: null,
      packageFingerprint: 'fp-a',
    },
    section9FilingSupportNotes: {
      notes: [
        {
          mappingStatus: 'GENERAL_SUPPORT',
          legalReference: 'Lei 15.270/2025',
          text: 'Nota de apoio geral.',
        },
      ],
      exerciseLabel: 'Exercício 2027 (ano-calendário 2026)',
    },
    ...overrides,
  };
}

describe('Phase 4I.6 — high-income review package view-model (UI)', () => {
  it('query key is namespaced per calendar year', () => {
    expect(highIncomeReviewPackageQueryKey(2026)).toEqual([
      'fiscal',
      'annual',
      '2026',
      'high-income',
      'review',
    ]);
  });

  it('returns null for malformed/missing input (fail-safe)', () => {
    expect(formatHighIncomeReviewPackageViewModel(null)).toBeNull();
    expect(formatHighIncomeReviewPackageViewModel(undefined)).toBeNull();
    expect(
      formatHighIncomeReviewPackageViewModel({} as unknown as RawHighIncomeReviewPackage),
    ).toBeNull();
    expect(
      formatHighIncomeReviewPackageViewModel([] as unknown as RawHighIncomeReviewPackage),
    ).toBeNull();
  });

  it('formats money (0 -> R$ 0,00) and null -> Não disponível (never 0)', () => {
    const vm = formatHighIncomeReviewPackageViewModel(
      basePackage({
        section4Calculation: {
          minimumTaxBase: '0.00',
          rateBand: null,
          minimumRatePercentage: null,
          grossMinimumTax: null,
          supportedCreditsTotal: null,
          supportedReductionsTotal: null,
          corporateRedutorSupportedTotal: null,
          netMinimumTax: null,
          creditExcess: null,
          netIsAuthoritative: false,
        },
      }),
    );
    expect(vm).not.toBeNull();
    expect(vm!.calculation.formattedMinimumTaxBase).toBe('R$ 0,00');
    expect(vm!.calculation.formattedGrossMinimumTax).toBe('Não disponível');
    expect(vm!.calculation.formattedNetMinimumTax).toBe('Não disponível');
    expect(vm!.calculation.formattedMinimumRate).toBe('Não disponível');
  });

  it('detects staleness via counts.stale > 0', () => {
    const vm = formatHighIncomeReviewPackageViewModel(
      basePackage({
        section7Readiness: {
          counts: { total: 1, ready: 0, missing: 0, stale: 1, conflicting: 0, unsupported: 0 },
          requirements: [],
          evidence: [],
        },
      }),
    );
    expect(vm!.isStale).toBe(true);
  });

  it('detects staleness via any evidence row stale flag', () => {
    const vm = formatHighIncomeReviewPackageViewModel(
      basePackage({
        section7Readiness: {
          counts: { total: 1, ready: 1, missing: 0, stale: 0, conflicting: 0, unsupported: 0 },
          requirements: [],
          evidence: [
            {
              rowKey: 'CORPORATE_TAX:PETR4:1',
              evidenceType: 'CORPORATE_TAX',
              payerId: 'PETR4',
              authority: 'AUTHORITATIVE',
              evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
              conflictStatus: 'NONE',
              stale: true,
              revision: 1,
              sourceFingerprint: 'sf',
              fingerprint: 'f',
            },
          ],
        },
      }),
    );
    expect(vm!.isStale).toBe(true);
  });

  it('is not stale when no counts and no stale rows', () => {
    const vm = formatHighIncomeReviewPackageViewModel(basePackage());
    expect(vm!.isStale).toBe(false);
  });

  it('maps status, applicable and mapping labels', () => {
    expect(highIncomeReviewPackageStatusLabel('UNSUPPORTED')).toBe('Não suportado');
    expect(highIncomeReviewPackageStatusLabel('NOT_APPLICABLE')).toBe('Não aplicável');
    expect(highIncomeReviewPackageStatusLabel('BLOCKED')).toBe('Bloqueado');
    expect(highIncomeApplicableLabel(null)).toBe('Não disponível');
    expect(highIncomeApplicableLabel(true)).toBe('Sim');
    expect(highIncomeApplicableLabel(false)).toBe('Não');
    expect(highIncomeFilingMappingStatusLabel('GENERAL_SUPPORT')).toBe('Apoio geral');
  });

  it('carries exercise label and copies year/exercise verbatim', () => {
    const vm = formatHighIncomeReviewPackageViewModel(basePackage());
    expect(vm!.calendarYear).toBe(2026);
    expect(vm!.declarationExercise).toBe(2027);
    expect(vm!.exerciseLabel).toBe('Exercício 2027 (ano-calendário 2026)');
  });
});
