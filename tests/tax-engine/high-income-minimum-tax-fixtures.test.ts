import { describe, it, expect } from 'vitest';
import { Money } from '@atlas/domain';
import {
  assessHighIncomeMinimumTaxApplicability,
  buildHighIncomeTaxDataSnapshot,
  classifyHighIncomeIncomeItem,
  resolveHighIncomeMinimumTaxRuleSet,
  resolveHighIncomeRateBand,
  HIGH_INCOME_MINIMUM_TAX_RULE_SETS,
  HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC,
  type HighIncomeIncomeItemInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.1 — High-Income Minimum Tax legal & data foundation fixtures (A through Z).
 *
 * Statutes under test (primary source, retrieved 2026-10-04):
 *  - Lei nº 15.270/2025, art. 2º (art. 16-A e 16-B da Lei 9.250/1995).
 *  - Lei nº 15.270/2025, art. 8º (efeitos a partir de 01/01/2026).
 *
 * These fixtures never assert a payable minimum tax amount.
 */

const YEAR = 2026;

function item(
  overrides: Partial<HighIncomeIncomeItemInput> &
    Pick<HighIncomeIncomeItemInput, 'itemId' | 'category' | 'amount'>,
): HighIncomeIncomeItemInput {
  return { ...overrides };
}

describe('Phase 4I.1 — High-Income Minimum Tax fixtures (A through Z)', () => {
  it('Fixture A — pre-effective year -> UNSUPPORTED_YEAR', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2025,
      taxSubjectId: 'subject-A',
      authoritativeTotalAnnualIncome: '1000000',
      items: [],
    });
    expect(assessment.applicability).toBe('UNSUPPORTED_YEAR');
    expect(assessment.ruleSet).toBeNull();
    expect(assessment.finalTaxAmount).toBeNull();
  });

  it('Fixture B — below applicability threshold -> NOT_APPLICABLE', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-B',
      authoritativeTotalAnnualIncome: '500000',
      items: [item({ itemId: 'b1', category: 'EQUITY_CAPITAL_GAIN', amount: '500000' })],
    });
    expect(assessment.applicability).toBe('NOT_APPLICABLE');
    expect(assessment.isAboveThreshold).toBe(false);
  });

  it('Fixture C — exact statutory threshold boundary is strictly greater than R$ 600.000,00', () => {
    const atThreshold = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-C',
      authoritativeTotalAnnualIncome: '600000',
      items: [],
    });
    expect(atThreshold.applicability).toBe('NOT_APPLICABLE');
    expect(atThreshold.threshold?.comparison).toBe('STRICTLY_GREATER');

    const justAbove = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-C',
      authoritativeTotalAnnualIncome: '600000.01',
      items: [item({ itemId: 'c1', category: 'EQUITY_CAPITAL_GAIN', amount: '600000.01' })],
    });
    expect(justAbove.applicability).toBe('APPLICABLE');
    expect(justAbove.isAboveThreshold).toBe(true);
  });

  it('Fixture D — above threshold -> APPLICABLE, without computing a final tax amount', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-D',
      authoritativeTotalAnnualIncome: '800000',
      items: [item({ itemId: 'd1', category: 'EQUITY_CAPITAL_GAIN', amount: '800000' })],
    });
    expect(assessment.applicability).toBe('APPLICABLE');
    expect(assessment.finalTaxAmount).toBeNull();
    expect(assessment.minimumEffectiveRatePercentage).toBeNull();
    expect(assessment.calculationBoundary).toBe('NO_FINAL_TAX_CALCULATION');
  });

  it('Fixture E — transition band lower bound classification', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('600000', 'BRL'))).toBe('BELOW_THRESHOLD');
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('600000.01', 'BRL'))).toBe('TRANSITION');
  });

  it('Fixture F — transition band midpoint -> TRANSITION', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('900000', 'BRL'))).toBe('TRANSITION');
  });

  it('Fixture G — maximum rate boundary at R$ 1.200.000,00', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('1199999.99', 'BRL'))).toBe('TRANSITION');
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('1200000', 'BRL'))).toBe('MAXIMUM');
  });

  it('Fixture H — ordinary dividends are INCLUDED in the minimum-tax base', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'h1', category: 'DIVIDEND', amount: '10000', payerId: 'payer-h' }),
    );
    expect(classified.classification).toBe('INCLUDED');
    expect(classified.legalReference).toContain('16-A');
  });

  it('Fixture I — transition dividends preserve transition evidence and are EXCLUDED', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({
        itemId: 'i1',
        category: 'DIVIDEND_TRANSITION',
        amount: '10000',
        payerId: 'payer-i',
        transitionEligibility: 'ELIGIBLE',
      }),
    );
    expect(classified.classification).toBe('EXCLUDED');
    expect(classified.legalReference).toContain('XII');
  });

  it('Fixture J — transition dividend with unknown evidence -> REQUIRES_CONFIRMATION (fail closed)', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({
        itemId: 'j1',
        category: 'DIVIDEND_TRANSITION',
        amount: '10000',
        payerId: 'payer-j',
        transitionEligibility: 'REQUIRES_CONFIRMATION',
      }),
    );
    expect(classified.classification).toBe('REQUIRES_CONFIRMATION');

    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-J',
      authoritativeTotalAnnualIncome: '800000',
      items: [
        item({
          itemId: 'j1',
          category: 'DIVIDEND_TRANSITION',
          amount: '10000',
          payerId: 'payer-j',
        }),
      ],
    });
    expect(assessment.applicability).toBe('REQUIRES_CONFIRMATION');
  });

  it('Fixture K — JCP is INCLUDED in the base', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'k1', category: 'JCP', amount: '30000', payerId: 'payer-k' }),
    );
    expect(classified.classification).toBe('INCLUDED');
  });

  it('Fixture L — verified FII income is EXCLUDED; unverified fails closed', () => {
    const verified = classifyHighIncomeIncomeItem(
      item({
        itemId: 'l1',
        category: 'FII_INCOME',
        amount: '5000',
        payerId: 'payer-l',
        fiiEligibility: 'ELIGIBLE',
      }),
    );
    expect(verified.classification).toBe('EXCLUDED');

    const unverified = classifyHighIncomeIncomeItem(
      item({ itemId: 'l2', category: 'FII_INCOME', amount: '5000', payerId: 'payer-l' }),
    );
    expect(unverified.classification).toBe('REQUIRES_CONFIRMATION');
  });

  it('Fixture M — normal equity capital gains are INCLUDED', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'm1', category: 'EQUITY_CAPITAL_GAIN', amount: '120000' }),
    );
    expect(classified.classification).toBe('INCLUDED');
    expect(classified.legalReference).toContain('§ 1º, I');
  });

  it('Fixture N — day trade gains are classified independently and INCLUDED', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'n1', category: 'EQUITY_DAY_TRADE_GAIN', amount: '40000' }),
    );
    expect(classified.classification).toBe('INCLUDED');
    expect(classified.category).toBe('EQUITY_DAY_TRADE_GAIN');
  });

  it('Fixture O — FII capital gains are INCLUDED', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'o1', category: 'FII_CAPITAL_GAIN', amount: '25000' }),
    );
    expect(classified.classification).toBe('INCLUDED');
  });

  it('Fixture P — exclusive/definitive withholding income is INCLUDED and requires withholding evidence', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({
        itemId: 'p1',
        category: 'EXCLUSIVE_WITHHOLDING_INCOME',
        amount: '15000',
        payerId: 'payer-p',
      }),
    );
    expect(classified.classification).toBe('INCLUDED');
    expect(classified.requiredEvidence).toContain('WITHHOLDING_EVIDENCE');
  });

  it('Fixture Q — missing evidence fails closed (no fabricated zero)', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-Q',
      items: [item({ itemId: 'q1', category: 'EXEMPT_SECURITIES_INCOME', amount: '100000' })],
    });
    expect(assessment.applicability).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.minimumTaxBase).toBeNull();
    expect(assessment.finalTaxAmount).toBeNull();
  });

  it('Fixture R — corporate effective-tax data present -> evidence SATISFIED', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-R',
      authoritativeTotalAnnualIncome: '800000',
      items: [item({ itemId: 'r1', category: 'DIVIDEND', amount: '700000', payerId: 'payer-r' })],
      evidenceStates: [
        {
          requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
          status: 'SATISFIED',
          subjectId: 'payer-r',
        },
      ],
    });
    const requirement = assessment.evidenceRequirements.find(
      (req) => req.requirement === 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
    );
    expect(requirement?.status).toBe('SATISFIED');
    expect(assessment.applicability).toBe('APPLICABLE');
  });

  it('Fixture S — corporate effective-tax data missing -> REQUIRES_CONFIRMATION (fail closed)', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-S',
      authoritativeTotalAnnualIncome: '800000',
      items: [item({ itemId: 's1', category: 'DIVIDEND', amount: '700000', payerId: 'payer-s' })],
    });
    const requirement = assessment.evidenceRequirements.find(
      (req) => req.requirement === 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
    );
    expect(requirement?.status).toBe('PENDING');
    expect(assessment.applicability).toBe('REQUIRES_CONFIRMATION');
  });

  it('Fixture T — multiple payers are never collapsed', () => {
    const snapshot = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'subject-T',
      items: [
        item({ itemId: 't1', category: 'DIVIDEND', amount: '10000', payerId: 'payer-A' }),
        item({ itemId: 't2', category: 'DIVIDEND', amount: '20000', payerId: 'payer-B' }),
      ],
    });
    expect(snapshot.payerIdentities).toEqual(['payer-A', 'payer-B']);
  });

  it('Fixture U — no cross-year leakage', () => {
    const base = {
      taxSubjectId: 'subject-U',
      items: [item({ itemId: 'u1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })],
    };
    const y2026 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2026, ...base });
    const y2027 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2027, ...base });
    expect(y2026.fingerprint).not.toBe(y2027.fingerprint);
    expect(y2026.ruleVersion).not.toBe('UNSUPPORTED_YEAR');
    expect(y2027.ruleVersion).not.toBe('UNSUPPORTED_YEAR');

    const y2025 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2025, ...base });
    expect(y2025.ruleVersion).toBe('UNSUPPORTED_YEAR');
  });

  it('Fixture V — no cross-user leakage', () => {
    const items = [item({ itemId: 'v1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })];
    const user1 = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'user-1',
      items,
    });
    const user2 = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'user-2',
      items,
    });
    expect(user1.fingerprint).not.toBe(user2.fingerprint);
  });

  it('Fixture W — changed authoritative source changes the snapshot fingerprint', () => {
    const first = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'subject-W',
      items: [item({ itemId: 'w1', category: 'EQUITY_CAPITAL_GAIN', amount: '100000' })],
    });
    const second = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'subject-W',
      items: [item({ itemId: 'w1', category: 'EQUITY_CAPITAL_GAIN', amount: '100001' })],
    });
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('Fixture X — unknown income category is UNSUPPORTED, never silently included/excluded', () => {
    const classified = classifyHighIncomeIncomeItem(
      item({ itemId: 'x1', category: 'UNKNOWN', amount: '100000' }),
    );
    expect(classified.classification).toBe('UNSUPPORTED');
    expect(classified.classification).not.toBe('INCLUDED');
    expect(classified.classification).not.toBe('EXCLUDED');

    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-X',
      items: [item({ itemId: 'x1', category: 'UNKNOWN', amount: '100000' })],
    });
    expect(assessment.unsupportedCategories).toContain('UNKNOWN');
    expect(assessment.applicability).toBe('REQUIRES_CONFIRMATION');
  });

  it('Fixture Y — no activity -> NOT_APPLICABLE with NO_ACTIVITY completeness', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-Y',
      items: [],
    });
    expect(assessment.applicability).toBe('NOT_APPLICABLE');
    expect(assessment.dataCompleteness).toBe('NO_ACTIVITY');
    expect(assessment.finalTaxAmount).toBeNull();
  });

  it('Fixture Z — mixed included/excluded/unsupported yields deterministic status', () => {
    const input = {
      calendarYear: YEAR,
      taxSubjectId: 'subject-Z',
      authoritativeTotalAnnualIncome: '800000',
      items: [
        item({ itemId: 'z1', category: 'DIVIDEND', amount: '400000', payerId: 'payer-z' }),
        item({ itemId: 'z2', category: 'SAVINGS_INCOME', amount: '100000' }),
        item({ itemId: 'z3', category: 'UNKNOWN', amount: '300000' }),
      ],
    } as const;

    const first = assessHighIncomeMinimumTaxApplicability(input);
    const second = assessHighIncomeMinimumTaxApplicability(input);

    expect(first.applicability).toBe('REQUIRES_CONFIRMATION');
    expect(first.includedCategories).toContain('DIVIDEND');
    expect(first.excludedCategories).toContain('SAVINGS_INCOME');
    expect(first.unsupportedCategories).toContain('UNKNOWN');
    expect(first.snapshotFingerprint).toBe(second.snapshotFingerprint);
  });

  it('rule registry is versioned with official provenance and effective dates', () => {
    expect(HIGH_INCOME_MINIMUM_TAX_RULE_SETS.length).toBeGreaterThan(0);
    for (const ruleSet of HIGH_INCOME_MINIMUM_TAX_RULE_SETS) {
      expect(ruleSet.calendarYear).toBe(ruleSet.declarationExercise - 1);
      expect(ruleSet.effectiveFrom).toBe('2026-01-01');
      expect(ruleSet.officialSourceReferences.length).toBeGreaterThan(0);
      expect(ruleSet.ruleVersion).toContain('LEI-15270');
      expect(ruleSet.eligibilityThresholdMetric).toBe(HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC);
    }
  });
});

describe('Phase 4I.1A — Threshold legal reconciliation fixtures (AA–AJ)', () => {
  const YEAR = 2026;

  it('Fixture AA — exactly R$ 600.000,00 -> NOT_APPLICABLE (strictly greater)', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-AA',
      authoritativeTotalAnnualIncome: '600000',
      items: [],
    });
    expect(assessment.applicability).toBe('NOT_APPLICABLE');
    expect(assessment.isAboveThreshold).toBe(false);
    expect(assessment.eligibilityThresholdMetric).toBe(HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC);
  });

  it('Fixture AB — R$ 600.000,01 -> APPLICABLE via TOTAL_ANNUAL_INCOME', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-AB',
      items: [item({ itemId: 'ab1', category: 'EQUITY_CAPITAL_GAIN', amount: '600000.01' })],
    });
    expect(assessment.applicability).toBe('APPLICABLE');
    expect(assessment.totalAnnualIncome?.amount).toBe('600000.01');
  });

  it('Fixture AC — just below R$ 600.000,00 -> NOT_APPLICABLE', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-AC',
      authoritativeTotalAnnualIncome: '599999.99',
      items: [item({ itemId: 'ac1', category: 'EQUITY_CAPITAL_GAIN', amount: '599999.99' })],
    });
    expect(assessment.applicability).toBe('NOT_APPLICABLE');
  });

  it('Fixture AD — just below R$ 1.200.000,00 -> TRANSITION', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('1199999.99', 'BRL'))).toBe('TRANSITION');
  });

  it('Fixture AE — exactly R$ 1.200.000,00 -> MAXIMUM', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('1200000', 'BRL'))).toBe('MAXIMUM');
  });

  it('Fixture AF — just above R$ 1.200.000,00 -> MAXIMUM', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    expect(resolveHighIncomeRateBand(ruleSet, Money.from('1200000.01', 'BRL'))).toBe('MAXIMUM');
  });

  it('Fixture AG — divergent bases: total > 600k but reduced base <= 600k -> resolves to TOTAL income', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-AG',
      items: [
        item({ itemId: 'ag1', category: 'EQUITY_CAPITAL_GAIN', amount: '400000' }),
        item({ itemId: 'ag2', category: 'SAVINGS_INCOME', amount: '300000' }),
      ],
    });
    expect(assessment.totalAnnualIncome?.amount).toBe('700000');
    expect(assessment.minimumTaxBase?.amount).toBe('400000');
    expect(assessment.isAboveThreshold).toBe(true);
    expect(assessment.minimumTaxBaseAboveThreshold).toBe(false);
    expect(assessment.thresholdDivergenceDetected).toBe(true);
    expect(assessment.applicability).toBe('APPLICABLE');
  });

  it('Fixture AH — pre-effective year -> UNSUPPORTED_YEAR', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2025,
      taxSubjectId: 'subject-AH',
      items: [],
    });
    expect(assessment.applicability).toBe('UNSUPPORTED_YEAR');
  });

  it('Fixture AI — 2026 supported with frozen metric', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2026,
      taxSubjectId: 'subject-AI',
      items: [],
    });
    expect(assessment.ruleVersion).not.toBe('UNSUPPORTED_YEAR');
    expect(assessment.eligibilityThresholdMetric).toBe('TOTAL_ANNUAL_INCOME');
  });

  it('Fixture AJ — >= 2028 unsupported (no modeled rule set)', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2028,
      taxSubjectId: 'subject-AJ',
      items: [],
    });
    expect(assessment.applicability).toBe('UNSUPPORTED_YEAR');
    expect(assessment.ruleSet).toBeNull();
  });

  it('reduced base can never exceed total income (inverse divergence impossible)', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: YEAR,
      taxSubjectId: 'subject-inverse',
      items: [
        item({ itemId: 'i1', category: 'DIVIDEND', amount: '500000', payerId: 'payer-inverse' }),
        item({ itemId: 'i2', category: 'SAVINGS_INCOME', amount: '200000' }),
      ],
      evidenceStates: [
        {
          requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
          status: 'SATISFIED',
          subjectId: 'payer-inverse',
        },
      ],
    });
    expect(assessment.minimumTaxBase!.compare(assessment.totalAnnualIncome!)).toBeLessThanOrEqual(
      0,
    );
  });

  it('ruleVersion change is reflected in the snapshot fingerprint', () => {
    const baseRuleSet = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    const items = [item({ itemId: 'fp1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })];
    const a = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'subject-fp',
      items,
    });
    const b = buildHighIncomeTaxDataSnapshot({
      calendarYear: YEAR,
      taxSubjectId: 'subject-fp',
      items,
      ruleSet: { ...baseRuleSet, ruleVersion: '2099-01-01-LEI-TEST' },
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
