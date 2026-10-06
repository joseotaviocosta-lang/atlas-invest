import { describe, expect, it } from 'vitest';
import {
  buildHighIncomeAnnualReviewPackage,
  type HighIncomeReviewAssessmentInput,
  type HighIncomeReviewPayerInput,
  type HighIncomeReviewBreakdownInput,
} from '../../packages/tax-engine/src/annual-irpf';

function readModel(
  overrides: Partial<HighIncomeReviewAssessmentInput> = {},
): HighIncomeReviewAssessmentInput {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    ruleVersion: 'irpfm-2026.1',
    status: 'CALCULABLE',
    applicability: 'APPLICABLE',
    totalAnnualIncome: '1200000.00',
    applicabilityThreshold: '600000',
    minimumTaxBase: '1200000.00',
    rateBand: 'BAND_10',
    minimumRatePercentage: '10',
    grossMinimumTax: '120000.00',
    credits: [],
    supportedCreditsTotal: '0.00',
    reductions: [],
    supportedReductionsTotal: '0.00',
    corporateRedutor: {
      aggregateVersion: 'v1',
      payerCount: 2,
      computedPayerCount: 2,
      status: 'COMPUTED',
      totalEligibleDividends: '80000.00',
      totalReductionExact: '5000.00',
      totalSupportedReduction: '5000.00',
      payers: [
        {
          payerId: 'PAYER-A',
          payerType: 'CORPORATE',
          status: 'COMPUTED',
          referenceRatePercentage: '34',
          corporateEffectiveRatePercentage: '22',
          pfEffectiveRatePercentage: '10',
          eligibleDividends: '30000.00',
          reductionExact: '2000.00',
          evidenceStatus: 'AUTHORITATIVE',
          blockingReasons: [],
          sourceFingerprint: 'fp-a',
        },
        {
          payerId: 'PAYER-B',
          payerType: 'CORPORATE',
          status: 'COMPUTED',
          referenceRatePercentage: '34',
          corporateEffectiveRatePercentage: '20',
          pfEffectiveRatePercentage: '10',
          eligibleDividends: '50000.00',
          reductionExact: '3000.00',
          evidenceStatus: 'AUTHORITATIVE',
          blockingReasons: [],
          sourceFingerprint: 'fp-b',
        },
      ],
      blockingPayers: [],
      blockingReasons: [],
      sourceFingerprint: 'redutor-src',
      calculationFingerprint: 'redutor-calc',
    },
    netMinimumTax: '85000.00',
    creditExcess: '0.00',
    incomeBreakdown: [
      {
        category: 'DIVIDENDS',
        classification: 'INCLUDED',
        grossAmount: '800000.00',
        includedAmount: '800000.00',
        excludedAmount: '0.00',
        itemCount: 3,
        payerIds: ['PAYER-A'],
        reason: 'r',
        legalReference: 'L',
      },
      {
        category: 'JCP',
        classification: 'INCLUDED',
        grossAmount: '400000.00',
        includedAmount: '400000.00',
        excludedAmount: '0.00',
        itemCount: 2,
        payerIds: ['PAYER-A'],
        reason: 'r',
        legalReference: 'L',
      },
    ],
    evidenceRequirements: [],
    evidence: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        evidenceType: 'CORPORATE_RATE',
        payerId: 'PAYER-A',
        authority: 'TAXPAYER',
        evidenceSource: 'UPLOAD',
        conflictStatus: 'NONE',
        stale: false,
        revision: 1,
        supersedesId: null,
        sourceFingerprint: 'ev-src',
        fingerprint: 'ev-fp',
      },
    ],
    blockingReasons: [],
    limitations: [],
    upstreamIncomeStatus: 'READY',
    upstreamIncomeFingerprint: 'income-fp',
    upstreamCapitalMarketFingerprint: 'cm-fp',
    sourceFingerprint: 'source-fp',
    calculationFingerprint: 'calc-fp',
    ...overrides,
  };
}

describe('Phase 4I.6 — fingerprint determinism', () => {
  it('excludes generatedAt: two clock values -> same fingerprint', () => {
    const a = buildHighIncomeAnnualReviewPackage(readModel(), {
      generatedAt: '2027-01-01T00:00:00.000Z',
    });
    const b = buildHighIncomeAnnualReviewPackage(readModel(), {
      generatedAt: '2027-12-31T23:59:59.999Z',
    });
    expect(a.packageFingerprint).toBe(b.packageFingerprint);
    expect(a.generatedAt).not.toBe(b.generatedAt);
  });

  it('same state -> same fingerprint (idempotent)', () => {
    const a = buildHighIncomeAnnualReviewPackage(readModel(), { generatedAt: 'g' });
    const b = buildHighIncomeAnnualReviewPackage(readModel(), { generatedAt: 'g' });
    expect(a.packageFingerprint).toBe(b.packageFingerprint);
  });

  it('changed sourceFingerprint -> fingerprint changes', () => {
    const a = buildHighIncomeAnnualReviewPackage(readModel(), { generatedAt: 'g' });
    const b = buildHighIncomeAnnualReviewPackage(readModel({ sourceFingerprint: 'different' }), {
      generatedAt: 'g',
    });
    expect(a.packageFingerprint).not.toBe(b.packageFingerprint);
  });

  it('changed evidence revision -> fingerprint changes', () => {
    const base = readModel();
    const changed = readModel({
      evidence: [{ ...base.evidence[0], revision: 99, fingerprint: 'ev-fp-2' }],
    });
    const a = buildHighIncomeAnnualReviewPackage(base, { generatedAt: 'g' });
    const b = buildHighIncomeAnnualReviewPackage(changed, { generatedAt: 'g' });
    expect(a.packageFingerprint).not.toBe(b.packageFingerprint);
  });

  it('shuffle invariance: reordering upstream payers/breakdown -> same fingerprint', () => {
    const base = readModel();
    const shuffledPayers: readonly HighIncomeReviewPayerInput[] = [
      base.corporateRedutor!.payers[1],
      base.corporateRedutor!.payers[0],
    ];
    const shuffledBreakdown: readonly HighIncomeReviewBreakdownInput[] = [
      base.incomeBreakdown[1],
      base.incomeBreakdown[0],
    ];
    const shuffled = readModel({
      corporateRedutor: { ...base.corporateRedutor!, payers: shuffledPayers },
      incomeBreakdown: shuffledBreakdown,
    });
    const a = buildHighIncomeAnnualReviewPackage(base, { generatedAt: 'g' });
    const b = buildHighIncomeAnnualReviewPackage(shuffled, { generatedAt: 'g' });
    expect(a.packageFingerprint).toBe(b.packageFingerprint);
  });

  it('does not mutate the input arrays (immutability of input)', () => {
    const base = readModel();
    const originalOrder = base.corporateRedutor!.payers.map((p) => p.payerId);
    buildHighIncomeAnnualReviewPackage(base, { generatedAt: 'g' });
    expect(base.corporateRedutor!.payers.map((p) => p.payerId)).toEqual(originalOrder);
  });
});
