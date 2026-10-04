import { describe, it, expect } from 'vitest';
import {
  calculateHighIncomeMinimumTax,
  resolveHighIncomeMinimumTaxRuleSet,
  type HighIncomeIncomeCategory,
  type HighIncomeIncomeItemInput,
  type HighIncomeTaxPaidFactInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.2 — property, fuzz (25,000 deterministic cases) and differential tests
 * for the high-income minimum-tax calculation core.
 *
 * The differential reference below is implemented independently with BigInt
 * rational arithmetic and shares NO production helper code (section 90).
 */

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
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
  chance(p: number): boolean {
    return this.next() < p;
  }
  amount(min: number, max: number, decimals: number): string {
    const value = min + this.next() * (max - min);
    return value.toFixed(decimals);
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
  'SAVINGS_INCOME',
  'EXEMPT_SECURITIES_INCOME',
  'DONATION_INHERITANCE',
  'INDEMNITY',
];

const ALLOWED_STATUSES = new Set([
  'NOT_APPLICABLE',
  'CALCULABLE',
  'INCOMPLETE_CREDITS',
  'INCOMPLETE_REDUCTION_DATA',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'UNSUPPORTED_YEAR',
  'UNSUPPORTED_INPUT',
]);

// ---------------------------------------------------------------------------
// Independent BigInt rational reference (no production helper reuse)
// ---------------------------------------------------------------------------
const REF_SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(REF_SCALE);
const REF_THRESHOLD = 600000n * SCALE_FACTOR;
const REF_UPPER = 1200000n * SCALE_FACTOR;

function parseScaledTo(value: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`reference: invalid decimal '${value}'`);
  const sign = match[1] === '-' ? -1n : 1n;
  let frac = match[3] ?? '';
  if (frac.length > scale) frac = frac.slice(0, scale);
  frac = frac.padEnd(scale, '0');
  return sign * BigInt(match[2] + frac);
}

function divRoundHalfUp(num: bigint, den: bigint): bigint {
  const q = num / den;
  const r = num % den;
  return 2n * r >= den ? q + 1n : q;
}

function referenceRateScaled10(baseAmount: string): bigint {
  const b = parseScaledTo(baseAmount, REF_SCALE);
  if (b <= REF_THRESHOLD) return 0n;
  if (b >= REF_UPPER) return 10n * 10n ** 10n;
  // rate = (base - 600000) / 60000 ; scaled by 1e10
  return divRoundHalfUp((b - REF_THRESHOLD) * 10n ** 10n, 60000n * SCALE_FACTOR);
}

function referenceGrossCents(baseAmount: string): bigint {
  const b = parseScaledTo(baseAmount, REF_SCALE);
  if (b <= REF_THRESHOLD) return 0n;
  if (b >= REF_UPPER) {
    // gross = base / 10 ; cents = base(scale 6) / 1e5
    return divRoundHalfUp(b, 100000n);
  }
  const numerator = b * (b - REF_THRESHOLD);
  const denominator = 6000000n * 10n ** BigInt(2 * REF_SCALE);
  return divRoundHalfUp(numerator * 100n, denominator);
}

function formatScaled10(scaled: bigint): string {
  const intPart = scaled / 10n ** 10n;
  const frac = (scaled % 10n ** 10n).toString().padStart(10, '0');
  return `${intPart}.${frac}`;
}

function moneyToCents(amount: string): bigint {
  return parseScaledTo(amount, 2);
}

function moneyScaled(amount: string): bigint {
  return parseScaledTo(amount, 10);
}

function rateToScaled10(rate: string): bigint {
  return parseScaledTo(rate, 10);
}

const MAX_RATE_SCALED10 = 10n * 10n ** 10n;

// ---------------------------------------------------------------------------
// Random case generation
// ---------------------------------------------------------------------------
interface FuzzCase {
  calendarYear: number;
  taxSubjectId: string;
  items: HighIncomeIncomeItemInput[];
  taxPaidFacts: HighIncomeTaxPaidFactInput[];
}

function randomItem(rng: DeterministicRandom, index: number): HighIncomeIncomeItemInput {
  const category = rng.pick(CATEGORIES);
  const item: HighIncomeIncomeItemInput = {
    itemId: `item-${index}`,
    category,
    amount: rng.amount(0, 900000, rng.int(0, 4)),
    currency: 'BRL',
    payerId: rng.chance(0.8) ? `payer-${rng.int(1, 5)}` : null,
    paymentDate: `2026-${String(rng.int(1, 12)).padStart(2, '0')}-01`,
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

function randomCase(rng: DeterministicRandom, index: number): FuzzCase {
  const calendarYear = rng.pick([2026, 2026, 2026, 2027, 2025, 2028]);
  const itemCount = rng.int(0, 5);
  const items: HighIncomeIncomeItemInput[] = [];
  for (let i = 0; i < itemCount; i++) {
    items.push(randomItem(rng, index * 10 + i));
  }
  const taxPaidFacts: HighIncomeTaxPaidFactInput[] = [
    { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0', currency: 'BRL' },
  ];
  if (rng.chance(0.5)) {
    taxPaidFacts.push({
      factId: 'wh',
      kind: 'EXCLUSIVE_SOURCE_WITHHOLDING',
      amount: rng.amount(0, 50000, 2),
      currency: 'BRL',
    });
  }
  if (rng.chance(0.2)) {
    taxPaidFacts.push({
      factId: 'def',
      kind: 'DEFINITIVE_IRPF_PAID',
      amount: rng.amount(0, 5000, 2),
      currency: 'BRL',
    });
  }
  return { calendarYear, taxSubjectId: `subject-${index % 40}`, items, taxPaidFacts };
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------
describe('Phase 4I.2 — calculation properties', () => {
  it('rate is monotonic non-decreasing and capped at 10%', () => {
    const ruleSet = resolveHighIncomeMinimumTaxRuleSet(2026)!;
    const bases = [
      '600000',
      '600000.01',
      '620000',
      '660000',
      '700000',
      '900000',
      '1000000',
      '1140000',
      '1199999.99',
      '1200000',
      '2000000',
    ];
    let previous = -1n;
    for (const base of bases) {
      const result = calculateHighIncomeMinimumTax({
        calendarYear: 2026,
        taxSubjectId: 'mono',
        currency: 'BRL',
        ruleSet,
        items: [{ itemId: `m-${base}`, category: 'EQUITY_CAPITAL_GAIN', amount: base }],
        taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      });
      if (result.minimumRatePercentage === null) {
        continue;
      }
      const rate = rateToScaled10(result.minimumRatePercentage);
      expect(rate).toBeGreaterThanOrEqual(previous);
      expect(rate).toBeLessThanOrEqual(MAX_RATE_SCALED10);
      previous = rate;
    }
    expect(previous).toBe(MAX_RATE_SCALED10);
  });

  it('threshold uses total annual income while base uses post-exclusion amount', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 'metric',
      currency: 'BRL',
      items: [
        { itemId: 't1', category: 'EQUITY_CAPITAL_GAIN', amount: '500000' },
        { itemId: 't2', category: 'SAVINGS_INCOME', amount: '400000' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    });
    expect(result.totalAnnualIncome?.amount).toBe('900000');
    expect(result.minimumTaxBase?.amount).toBe('500000');
  });

  it('unknown != zero: unresolved classification yields null base and null net', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 'unknown',
      currency: 'BRL',
      items: [{ itemId: 'u1', category: 'UNKNOWN', amount: '700000' }],
    });
    expect(result.minimumTaxBase).toBeNull();
    expect(result.netMinimumTax).toBeNull();
    expect(result.status).toBe('UNSUPPORTED_INPUT');
  });

  it('unsupported categories are never silently included or excluded', () => {
    for (const category of ['FOREIGN_INCOME', 'RURAL_ACTIVITY', 'UNKNOWN'] as const) {
      const result = calculateHighIncomeMinimumTax({
        calendarYear: 2026,
        taxSubjectId: 'unsup',
        currency: 'BRL',
        items: [{ itemId: `u-${category}`, category, amount: '700000' }],
      });
      const entry = result.incomeBreakdown.find((e) => e.category === category);
      expect(entry?.classification).toBe('UNSUPPORTED');
      expect(result.status).toBe('UNSUPPORTED_INPUT');
    }
  });

  it('same input -> same result and fingerprint', () => {
    const input = {
      calendarYear: 2026,
      taxSubjectId: 'stable',
      currency: 'BRL' as const,
      items: [{ itemId: 's1', category: 'EQUITY_CAPITAL_GAIN' as const, amount: '900000' }],
      taxPaidFacts: [
        { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE' as const, amount: '10000' },
      ],
    };
    const a = calculateHighIncomeMinimumTax(input);
    const b = calculateHighIncomeMinimumTax(input);
    expect(a.calculationFingerprint).toBe(b.calculationFingerprint);
    expect(a.netMinimumTax?.amount).toBe(b.netMinimumTax?.amount);
  });

  it('order independence: shuffled items yield identical result', () => {
    const items = [
      { itemId: 'o1', category: 'EQUITY_CAPITAL_GAIN' as const, amount: '400000' },
      { itemId: 'o2', category: 'SAVINGS_INCOME' as const, amount: '200000' },
      { itemId: 'o3', category: 'EQUITY_DAY_TRADE_GAIN' as const, amount: '300000' },
    ];
    const facts = [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE' as const, amount: '0' }];
    const forward = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 'order',
      items,
      taxPaidFacts: facts,
    });
    const reversed = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 'order',
      items: [...items].reverse(),
      taxPaidFacts: facts,
    });
    expect(reversed.calculationFingerprint).toBe(forward.calculationFingerprint);
  });

  it('no double counting: breakdown included amounts reconcile to the base', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 'reconcile',
      currency: 'BRL',
      items: [
        { itemId: 'r1', category: 'EQUITY_CAPITAL_GAIN', amount: '300000' },
        { itemId: 'r2', category: 'JCP', amount: '250000', payerId: 'p1' },
        { itemId: 'r3', category: 'SAVINGS_INCOME', amount: '150000' },
      ],
      taxPaidFacts: [
        { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' },
        { factId: 'wh', kind: 'EXCLUSIVE_SOURCE_WITHHOLDING', amount: '0' },
      ],
    });
    const includedTotal = result.incomeBreakdown.reduce(
      (acc, entry) => acc + moneyScaled(entry.includedAmount.amount),
      0n,
    );
    expect(includedTotal).toBe(moneyScaled(result.minimumTaxBase!.amount));
  });
});

// ---------------------------------------------------------------------------
// Fuzz + differential
// ---------------------------------------------------------------------------
describe('Phase 4I.2 — deterministic 25,000-case fuzz + differential', () => {
  it('runs 25,000 cases with zero invariant violations and matches the reference', () => {
    const seed = 20261004;
    const rng = new DeterministicRandom(seed);
    const iterations = 25000;
    const failures: string[] = [];
    let differentialCases = 0;
    let differentialMismatches = 0;
    const startedAt = Date.now();

    for (let i = 0; i < iterations; i++) {
      const fuzzCase = randomCase(rng, i);
      const input = {
        calendarYear: fuzzCase.calendarYear,
        taxSubjectId: fuzzCase.taxSubjectId,
        currency: 'BRL' as const,
        items: fuzzCase.items,
        taxPaidFacts: fuzzCase.taxPaidFacts,
      };

      const result = calculateHighIncomeMinimumTax(input);
      const second = calculateHighIncomeMinimumTax(input);

      // determinism
      if (result.calculationFingerprint !== second.calculationFingerprint) {
        failures.push(`case ${i}: non-deterministic fingerprint`);
      }

      // closed status set
      if (!ALLOWED_STATUSES.has(result.status)) {
        failures.push(`case ${i}: invalid status ${result.status}`);
      }

      // money serialization is exact decimal (no NaN/Infinity/float artifacts)
      for (const money of [result.minimumTaxBase, result.grossMinimumTax, result.netMinimumTax]) {
        if (money && !/^-?\d+(\.\d+)?$/.test(money.amount)) {
          failures.push(`case ${i}: non-decimal money '${money.amount}'`);
        }
      }
      if (result.minimumRatePercentage && !/^-?\d+(\.\d+)?$/.test(result.minimumRatePercentage)) {
        failures.push(`case ${i}: non-decimal rate '${result.minimumRatePercentage}'`);
      }

      // rate bounds
      if (result.minimumRatePercentage !== null) {
        const rate = rateToScaled10(result.minimumRatePercentage);
        if (rate < 0n || rate > MAX_RATE_SCALED10) {
          failures.push(`case ${i}: rate out of bounds`);
        }
      }

      // net never negative
      if (result.netMinimumTax !== null && result.netMinimumTax.isNegative()) {
        failures.push(`case ${i}: negative net tax`);
      }

      // unknown != zero / unsupported fail closed
      const hasUnresolved = result.incomeBreakdown.some(
        (entry) => entry.classification !== 'INCLUDED' && entry.classification !== 'EXCLUDED',
      );
      const hasUnsupported = result.incomeBreakdown.some(
        (entry) => entry.classification === 'UNSUPPORTED',
      );
      if (hasUnresolved && result.minimumTaxBase !== null && !hasUnsupported) {
        failures.push(`case ${i}: unresolved classification fabricated a base`);
      }
      if (
        hasUnsupported &&
        result.status !== 'UNSUPPORTED_INPUT' &&
        result.status !== 'UNSUPPORTED_YEAR'
      ) {
        failures.push(`case ${i}: unsupported input not failed closed`);
      }
      if (result.status !== 'CALCULABLE' && result.netMinimumTax !== null) {
        failures.push(`case ${i}: net emitted for non-calculable status`);
      }
      if (result.status === 'CALCULABLE' && result.netMinimumTax === null) {
        failures.push(`case ${i}: calculable status without net`);
      }

      // category reconciliation
      if (result.minimumTaxBase !== null) {
        const includedTotal = result.incomeBreakdown.reduce(
          (acc, entry) => acc + moneyScaled(entry.includedAmount.amount),
          0n,
        );
        if (includedTotal !== moneyScaled(result.minimumTaxBase.amount)) {
          failures.push(`case ${i}: base reconciliation mismatch`);
        }
      }

      // differential (independent reference) for supported single-included-item cases
      const includedItems = result.incomeBreakdown.filter((e) => e.classification === 'INCLUDED');
      const noConditional = !result.incomeBreakdown.some(
        (e) => e.classification === 'CONDITIONAL' || e.classification === 'REQUIRES_CONFIRMATION',
      );
      if (
        result.grossMinimumTax !== null &&
        result.minimumTaxBase !== null &&
        includedItems.length === 1 &&
        noConditional &&
        fuzzCase.calendarYear === 2026
      ) {
        differentialCases += 1;
        const engineCents = moneyToCents(result.grossMinimumTax.amount);
        const expectedCents = referenceGrossCents(result.minimumTaxBase.amount);
        if (engineCents !== expectedCents) {
          differentialMismatches += 1;
          failures.push(`case ${i}: gross differential mismatch`);
        }
        const expectedRate = formatScaled10(referenceRateScaled10(result.minimumTaxBase.amount));
        if (result.minimumRatePercentage !== expectedRate) {
          differentialMismatches += 1;
          failures.push(`case ${i}: rate differential mismatch`);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[4I.2 fuzz] cases=${iterations} seed=${seed} failures=${failures.length} differential=${differentialCases} mismatches=${differentialMismatches} durationMs=${durationMs}`,
    );

    expect(failures.slice(0, 10)).toEqual([]);
    expect(failures.length).toBe(0);
    expect(differentialMismatches).toBe(0);
  }, 180000);

  it('differential credit clamping (independent reference)', () => {
    const cases: Array<{ gross: string; credit: string; net: string }> = [
      { gross: '900000', credit: '10000', net: '35000' },
      { gross: '900000', credit: '45000', net: '0' },
      { gross: '900000', credit: '60000', net: '0' },
      { gross: '660000', credit: '1', net: '6599' },
    ];
    for (const testCase of cases) {
      const result = calculateHighIncomeMinimumTax({
        calendarYear: 2026,
        taxSubjectId: 'clamp',
        currency: 'BRL',
        items: [{ itemId: 'c1', category: 'EQUITY_CAPITAL_GAIN', amount: testCase.gross }],
        taxPaidFacts: [
          { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: testCase.credit },
        ],
      });
      const grossCents = referenceGrossCents(testCase.gross);
      const referenceNet = grossCents - moneyToCents(testCase.credit);
      const clamped = referenceNet < 0n ? 0n : referenceNet;
      const engineNet = moneyToCents(result.netMinimumTax!.amount);
      expect(engineNet).toBe(clamped);
      expect(result.netMinimumTax!.amount).toBe(testCase.net);
    }
  });
});
