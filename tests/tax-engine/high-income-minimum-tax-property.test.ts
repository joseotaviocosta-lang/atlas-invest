import { describe, it, expect } from 'vitest';
import { Money } from '@atlas/domain';
import {
  assessHighIncomeMinimumTaxApplicability,
  buildHighIncomeTaxDataSnapshot,
  classifyHighIncomeIncomeItem,
  resolveHighIncomeMinimumTaxRuleSet,
  HIGH_INCOME_MINIMUM_TAX_FIRST_CALENDAR_YEAR,
  type HighIncomeIncomeCategory,
  type HighIncomeIncomeItemInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.1 — High-Income Minimum Tax property & fuzz suite.
 *
 * Proves determinism, snapshot fingerprint stability, unknown != zero,
 * cross-year/cross-user isolation, payer identity preservation and the
 * never-silently-include/exclude rule for unsupported categories.
 *
 * Zero-I/O, deterministic, offline.
 */

class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)]!;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  amount(min: number, max: number): string {
    return (min + this.next() * (max - min)).toFixed(2);
  }
}

const CATEGORIES: readonly HighIncomeIncomeCategory[] = [
  'DIVIDEND',
  'DIVIDEND_TRANSITION',
  'JCP',
  'FII_INCOME',
  'EQUITY_CAPITAL_GAIN',
  'EQUITY_DAY_TRADE_GAIN',
  'FII_CAPITAL_GAIN',
  'EXCLUSIVE_WITHHOLDING_INCOME',
  'SAVINGS_INCOME',
  'EXEMPT_SECURITIES_INCOME',
  'FOREIGN_INCOME',
  'RURAL_ACTIVITY',
  'DONATION_INHERITANCE',
  'INDEMNITY',
  'UNKNOWN',
];

const UNSUPPORTED_CATEGORIES = new Set<HighIncomeIncomeCategory>([
  'FOREIGN_INCOME',
  'RURAL_ACTIVITY',
  'UNKNOWN',
]);

function randomItem(rng: DeterministicRandom, index: number): HighIncomeIncomeItemInput {
  const category = rng.pick(CATEGORIES);
  const item: HighIncomeIncomeItemInput = {
    itemId: `item-${index}`,
    category,
    amount: rng.chance(0.03) ? rng.amount(-1000, 0) : rng.amount(0, 300000),
    currency: rng.chance(0.05) ? 'USD' : 'BRL',
    payerId: rng.chance(0.8) ? `payer-${rng.int(1, 3)}` : null,
    paymentDate: `2026-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
  };
  if (category === 'DIVIDEND_TRANSITION') {
    (item as { transitionEligibility?: string }).transitionEligibility = rng.pick([
      'ELIGIBLE',
      'INELIGIBLE',
      'REQUIRES_CONFIRMATION',
    ]);
  }
  if (category === 'FII_INCOME') {
    (item as { fiiEligibility?: string }).fiiEligibility = rng.pick([
      'ELIGIBLE',
      'INELIGIBLE',
      'REQUIRES_CONFIRMATION',
    ]);
  }
  if (category === 'EXEMPT_SECURITIES_INCOME') {
    (item as { securitiesIsCorporateParticipation?: boolean }).securitiesIsCorporateParticipation =
      rng.chance(0.5);
  }
  return item;
}

interface FuzzCase {
  calendarYear: number;
  taxSubjectId: string;
  items: HighIncomeIncomeItemInput[];
  authoritativeTotalAnnualIncome: string | null;
  evidenceStates: Array<{ requirement: string; status: string; subjectId?: string }>;
}

function randomCase(rng: DeterministicRandom, index: number): FuzzCase {
  const calendarYear = rng.pick([2024, 2025, 2026, 2027, 2028]);
  const itemCount = rng.int(0, 5);
  const items: HighIncomeIncomeItemInput[] = [];
  for (let i = 0; i < itemCount; i++) {
    items.push(randomItem(rng, index * 10 + i));
  }
  const evidenceStates: Array<{ requirement: string; status: string; subjectId?: string }> = [];
  if (rng.chance(0.3)) {
    evidenceStates.push({ requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE', status: 'SATISFIED' });
  }
  if (rng.chance(0.3)) {
    evidenceStates.push({ requirement: 'ANNUAL_ADJUSTMENT_TAX_DUE', status: 'SATISFIED' });
  }
  return {
    calendarYear,
    taxSubjectId: `fuzz-subject-${index % 50}`,
    items,
    authoritativeTotalAnnualIncome: rng.chance(0.5) ? rng.amount(0, 3000000) : null,
    evidenceStates,
  };
}

const ALLOWED_STATUSES = new Set([
  'APPLICABLE',
  'NOT_APPLICABLE',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'UNSUPPORTED_YEAR',
]);

describe('Phase 4I.1 — High-Income Minimum Tax property tests', () => {
  it('same inputs -> same classification and same snapshot fingerprint', () => {
    const input = {
      calendarYear: 2026,
      taxSubjectId: 'subject-prop-1',
      authoritativeTotalAnnualIncome: '900000',
      items: [
        { itemId: 'p1', category: 'DIVIDEND' as const, amount: '700000', payerId: 'payer-1' },
        { itemId: 'p2', category: 'SAVINGS_INCOME' as const, amount: '200000' },
      ],
    };
    const first = assessHighIncomeMinimumTaxApplicability(input);
    const second = assessHighIncomeMinimumTaxApplicability(input);
    expect(first.applicability).toBe(second.applicability);
    expect(first.snapshotFingerprint).toBe(second.snapshotFingerprint);
    expect(first.incomeClassifications).toEqual(second.incomeClassifications);
  });

  it('changed authoritative source -> changed fingerprint', () => {
    const base = {
      calendarYear: 2026,
      taxSubjectId: 'subject-prop-2',
      items: [{ itemId: 'p1', category: 'EQUITY_CAPITAL_GAIN' as const, amount: '700000' }],
    };
    const a = buildHighIncomeTaxDataSnapshot(base);
    const b = buildHighIncomeTaxDataSnapshot({
      ...base,
      items: [{ itemId: 'p1', category: 'EQUITY_CAPITAL_GAIN', amount: '700001' }],
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('unknown != zero: unresolved classifications never yield a known base', () => {
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2026,
      taxSubjectId: 'subject-prop-3',
      items: [{ itemId: 'u1', category: 'UNKNOWN', amount: '100000' }],
    });
    expect(assessment.minimumTaxBase).toBeNull();
    expect(assessment.finalTaxAmount).toBeNull();
  });

  it('cross-year isolation: 2026 vs 2027 fingerprints differ and 2025 is unsupported', () => {
    const items = [{ itemId: 'y1', category: 'EQUITY_CAPITAL_GAIN' as const, amount: '700000' }];
    const y2026 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2026, taxSubjectId: 's', items });
    const y2027 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2027, taxSubjectId: 's', items });
    const y2025 = buildHighIncomeTaxDataSnapshot({ calendarYear: 2025, taxSubjectId: 's', items });
    expect(y2026.fingerprint).not.toBe(y2027.fingerprint);
    expect(y2025.ruleVersion).toBe('UNSUPPORTED_YEAR');
  });

  it('cross-user isolation: different subjects never share a fingerprint', () => {
    const items = [{ itemId: 'z1', category: 'EQUITY_CAPITAL_GAIN' as const, amount: '700000' }];
    const a = buildHighIncomeTaxDataSnapshot({ calendarYear: 2026, taxSubjectId: 'user-a', items });
    const b = buildHighIncomeTaxDataSnapshot({ calendarYear: 2026, taxSubjectId: 'user-b', items });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('payer identity is preserved and never collapsed', () => {
    const snapshot = buildHighIncomeTaxDataSnapshot({
      calendarYear: 2026,
      taxSubjectId: 'subject-prop-4',
      items: [
        { itemId: 'p1', category: 'DIVIDEND', amount: '1000', payerId: 'payer-A' },
        { itemId: 'p2', category: 'DIVIDEND', amount: '1000', payerId: 'payer-B' },
        { itemId: 'p3', category: 'DIVIDEND', amount: '1000', payerId: 'payer-A' },
      ],
    });
    expect(snapshot.payerIdentities).toEqual(['payer-A', 'payer-B']);
  });

  it('unsupported categories are never silently included or excluded', () => {
    for (const category of ['FOREIGN_INCOME', 'RURAL_ACTIVITY', 'UNKNOWN'] as const) {
      const classified = classifyHighIncomeIncomeItem({
        itemId: `u-${category}`,
        category,
        amount: '1000',
      });
      expect(classified.classification).toBe('UNSUPPORTED');
      expect(classified.classification).not.toBe('INCLUDED');
      expect(classified.classification).not.toBe('EXCLUDED');
    }
  });

  it('rule set is selected only for supported calendar years', () => {
    expect(resolveHighIncomeMinimumTaxRuleSet(2025)).toBeNull();
    expect(
      resolveHighIncomeMinimumTaxRuleSet(HIGH_INCOME_MINIMUM_TAX_FIRST_CALENDAR_YEAR),
    ).not.toBeNull();
  });
});

describe('Phase 4I.1 — High-Income Minimum Tax deterministic 10,000-case fuzz', () => {
  it('runs 10,000 deterministic classification cases with zero invariant violations', () => {
    const seed = 20261004;
    const rng = new DeterministicRandom(seed);
    const iterations = 10000;
    const failures: string[] = [];
    const startedAt = Date.now();

    for (let i = 0; i < iterations; i++) {
      const fuzzCase = randomCase(rng, i);
      const input = {
        calendarYear: fuzzCase.calendarYear,
        taxSubjectId: fuzzCase.taxSubjectId,
        authoritativeTotalAnnualIncome: fuzzCase.authoritativeTotalAnnualIncome,
        items: fuzzCase.items,
        evidenceStates: fuzzCase.evidenceStates as never,
      };

      const assessment = assessHighIncomeMinimumTaxApplicability(input);
      const second = assessHighIncomeMinimumTaxApplicability(input);

      // 1. Determinism.
      if (assessment.snapshotFingerprint !== second.snapshotFingerprint) {
        failures.push(`case ${i}: non-deterministic fingerprint`);
      }
      if (assessment.applicability !== second.applicability) {
        failures.push(`case ${i}: non-deterministic applicability`);
      }

      // 2. No final tax is ever computed.
      if (
        assessment.finalTaxAmount !== null ||
        assessment.minimumEffectiveRatePercentage !== null
      ) {
        failures.push(`case ${i}: final tax computed (boundary violated)`);
      }
      if (assessment.calculationBoundary !== 'NO_FINAL_TAX_CALCULATION') {
        failures.push(`case ${i}: calculation boundary marker missing`);
      }

      // 3. Status is in the closed set.
      if (!ALLOWED_STATUSES.has(assessment.applicability)) {
        failures.push(`case ${i}: invalid applicability ${assessment.applicability}`);
      }

      // 4. Pre-effective years fail closed.
      if (
        fuzzCase.calendarYear < HIGH_INCOME_MINIMUM_TAX_FIRST_CALENDAR_YEAR &&
        assessment.applicability !== 'UNSUPPORTED_YEAR'
      ) {
        failures.push(`case ${i}: pre-effective year not UNSUPPORTED_YEAR`);
      }

      // 5. Unknown != zero: unresolved classifications never produce a base.
      const hasUnresolved = assessment.incomeClassifications.some(
        (item) => item.classification !== 'INCLUDED' && item.classification !== 'EXCLUDED',
      );
      if (hasUnresolved && assessment.minimumTaxBase !== null) {
        failures.push(`case ${i}: unresolved classification fabricated a base`);
      }

      // 6. Unsupported categories are never silently included/excluded.
      for (const item of assessment.incomeClassifications) {
        if (UNSUPPORTED_CATEGORIES.has(item.category) && item.classification !== 'UNSUPPORTED') {
          failures.push(`case ${i}: unsupported category ${item.category} was classified`);
        }
      }

      // 7. Rule version consistency (only modeled years carry a version).
      const hasRuleSet = resolveHighIncomeMinimumTaxRuleSet(fuzzCase.calendarYear) !== null;
      if (hasRuleSet) {
        if (assessment.ruleVersion === 'UNSUPPORTED_YEAR') {
          failures.push(`case ${i}: supported year missing rule version`);
        }
      } else if (assessment.ruleVersion !== 'UNSUPPORTED_YEAR') {
        failures.push(`case ${i}: unsupported year resolved a rule version`);
      }

      // 8. Negative authoritative amounts block (when a rule set is modeled).
      const hasNegative = assessment.incomeClassifications.some((item) => item.amount.isNegative());
      if (hasNegative && hasRuleSet && assessment.applicability !== 'BLOCKED') {
        failures.push(`case ${i}: negative amount did not block`);
      }

      // 9. Threshold follows the canonical TOTAL_ANNUAL_INCOME metric (OQ-1 resolved).
      if (hasRuleSet) {
        if (assessment.eligibilityThresholdMetric !== 'TOTAL_ANNUAL_INCOME') {
          failures.push(`case ${i}: threshold metric not canonical`);
        }
        if (assessment.totalAnnualIncome !== null && assessment.threshold !== null) {
          const thresholdMoney = Money.from(assessment.threshold.amount, assessment.currency);
          const expectedAbove = assessment.totalAnnualIncome.compare(thresholdMoney) > 0;
          if (assessment.isAboveThreshold !== expectedAbove) {
            failures.push(`case ${i}: threshold not computed on total income`);
          }
        }
        if (
          assessment.minimumTaxBaseAboveThreshold !== null &&
          assessment.isAboveThreshold !== null &&
          assessment.thresholdDivergenceDetected !==
            (assessment.isAboveThreshold !== assessment.minimumTaxBaseAboveThreshold)
        ) {
          failures.push(`case ${i}: divergence flag inconsistent`);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    // Fuzz report (informational).
    // eslint-disable-next-line no-console
    console.log(
      `[4I.1 fuzz] cases=${iterations} seed=${seed} failures=${failures.length} durationMs=${durationMs}`,
    );

    expect(failures.slice(0, 10)).toEqual([]);
    expect(failures.length).toBe(0);
  }, 120000);
});
