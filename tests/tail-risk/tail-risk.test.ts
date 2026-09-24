import { describe, it, expect } from 'vitest';
import { LocalDate, Percentage } from '@atlas/domain';
import {
  calculateDownsideDeviation,
  calculateSemideviation,
  calculateHistoricalVar,
  calculateHistoricalCvar,
  calculateTailRisk,
  assertValidTailConfidenceLevel,
  minimumTailSampleSize,
  TAIL_CONFIDENCE_LEVELS,
  RiskSubperiodReturn,
} from '@atlas/risk-engine';

const BASE_MS = Date.UTC(2026, 0, 1);
function sub(i: number, percent: string): RiskSubperiodReturn {
  const d = new Date(BASE_MS + i * 86400000);
  return {
    date: LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    returnPercentage: Percentage.from(percent),
  };
}

/** n returns with values -1, -2, ..., -n (worst = -n). */
function descendingNegative(n: number): RiskSubperiodReturn[] {
  return Array.from({ length: n }, (_, i) => sub(i, String(-(i + 1))));
}

function num(q: { toString(): string; value?: string } | null): number {
  if (!q) throw new Error('expected non-null quantity');
  return Number(q.value ?? q.toString());
}

// --- Confidence contract §21/§58 --------------------------------------------

describe('Tail confidence contract', () => {
  it('accepts only 95 and 99', () => {
    expect(assertValidTailConfidenceLevel('95')).toBe('95');
    expect(assertValidTailConfidenceLevel(99)).toBe('99');
    expect(TAIL_CONFIDENCE_LEVELS).toEqual(['95', '99']);
    expect(() => assertValidTailConfidenceLevel('90')).toThrow();
  });

  it('minimum sample sizes are 20 (95) and 100 (99)', () => {
    expect(minimumTailSampleSize('95')).toBe(20);
    expect(minimumTailSampleSize('99')).toBe(100);
  });
});

// --- Downside deviation §45/§90 ---------------------------------------------

describe('Downside deviation (ADR-154)', () => {
  it('basic fixture +1/−2/+3/−1 → sqrt(1.25) ≈ 1.1180', () => {
    const r = calculateDownsideDeviation({
      returns: [sub(0, '1'), sub(1, '-2'), sub(2, '3'), sub(3, '-1')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.observationCount).toBe(4);
    expect(r.negativeObservationCount).toBe(2);
    expect(num(r.dailyPercentage)).toBeCloseTo(1.118033988749895, 9);
  });

  it('all positive returns → exactly 0 (valid, not unavailable)', () => {
    const r = calculateDownsideDeviation({
      returns: [sub(0, '1'), sub(1, '2'), sub(2, '3')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.negativeObservationCount).toBe(0);
    expect(r.dailyPercentage?.value).toBe('0');
    expect(r.annualizedPercentage?.value).toBe('0');
  });

  it('all negative returns', () => {
    const r = calculateDownsideDeviation({
      returns: [sub(0, '-1'), sub(1, '-2'), sub(2, '-3')],
    });
    expect(r.negativeObservationCount).toBe(3);
    expect(num(r.dailyPercentage)).toBeGreaterThan(0);
  });

  it('minimum observations: n < 2 → UNAVAILABLE', () => {
    expect(calculateDownsideDeviation({ returns: [] }).status).toBe('UNAVAILABLE');
    expect(calculateDownsideDeviation({ returns: [sub(0, '-1')] }).status).toBe('UNAVAILABLE');
  });

  it('denominator is n (all observations)', () => {
    // downside [−2,−1] over n=4 → sqrt((4+1)/4) = sqrt(1.25)
    const r = calculateDownsideDeviation({
      returns: [sub(0, '1'), sub(1, '-2'), sub(2, '3'), sub(3, '-1')],
    });
    expect(num(r.dailyPercentage)).toBeCloseTo(Math.sqrt(1.25), 9);
  });

  it('annualization is daily × sqrt(252)', () => {
    const r = calculateDownsideDeviation({
      returns: [sub(0, '1'), sub(1, '-2'), sub(2, '3'), sub(3, '-1')],
    });
    const ratio = num(r.annualizedPercentage) / num(r.dailyPercentage);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
    expect(r.annualizationFactor).toBe('252');
  });

  it('long decimals, deterministic, frozen, no NaN/Infinity', () => {
    const input = [sub(0, '0.123456789'), sub(1, '-0.987654321'), sub(2, '2.5')];
    const a = calculateDownsideDeviation({ returns: input });
    const b = calculateDownsideDeviation({ returns: [...input].reverse() });
    expect(a.dailyPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(a.annualizedPercentage?.value).toBe(b.annualizedPercentage?.value);
    expect(Object.isFrozen(a)).toBe(true);
    expect(JSON.stringify(a)).not.toContain('Infinity');
    expect(JSON.stringify(a)).not.toContain('NaN');
  });

  it('partial source propagates', () => {
    const r = calculateDownsideDeviation({ returns: [sub(0, '-1'), sub(1, '2')], partial: true });
    expect(r.status).toBe('PARTIAL');
  });
});

// --- Semideviation §46/§91 --------------------------------------------------

describe('Semideviation (ADR-155)', () => {
  it('known mean fixture: [1,2,3,4] mean 2.5 → deviations [−1.5,−0.5]', () => {
    const r = calculateSemideviation({
      returns: [sub(0, '1'), sub(1, '2'), sub(2, '3'), sub(3, '4')],
    });
    // sqrt((2.25 + 0.25)/4) = sqrt(0.625)
    expect(r.status).toBe('AVAILABLE');
    expect(num(r.dailyPercentage)).toBeCloseTo(Math.sqrt(0.625), 9);
  });

  it('mixed returns differ from downside deviation (different target)', () => {
    // mean = 1/3 (≠ 0), so the mean-target and zero-target differ.
    const input = [sub(0, '-2'), sub(1, '-1'), sub(2, '4')];
    const semi = calculateSemideviation({ returns: input });
    const downside = calculateDownsideDeviation({ returns: input });
    expect(semi.dailyPercentage?.value).not.toBe(downside.dailyPercentage?.value);
  });

  it('constant returns → 0', () => {
    const r = calculateSemideviation({ returns: [sub(0, '2'), sub(1, '2'), sub(2, '2')] });
    expect(r.dailyPercentage?.value).toBe('0');
    expect(r.annualizedPercentage?.value).toBe('0');
  });

  it('all positive varying → below-mean dispersion > 0', () => {
    const r = calculateSemideviation({
      returns: [sub(0, '1'), sub(1, '2'), sub(2, '3'), sub(3, '4')],
    });
    expect(num(r.dailyPercentage)).toBeGreaterThan(0);
  });

  it('all negative varying', () => {
    const r = calculateSemideviation({
      returns: [sub(0, '-1'), sub(1, '-2'), sub(2, '-3')],
    });
    expect(num(r.dailyPercentage)).toBeGreaterThan(0);
  });

  it('denominator n and sqrt(252) annualization', () => {
    const r = calculateSemideviation({
      returns: [sub(0, '1'), sub(1, '2'), sub(2, '3'), sub(3, '4')],
    });
    expect(num(r.dailyPercentage)).toBeCloseTo(Math.sqrt(0.625), 9);
    const ratio = num(r.annualizedPercentage) / num(r.dailyPercentage);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
  });

  it('minimum observations and no NaN/Infinity', () => {
    expect(calculateSemideviation({ returns: [sub(0, '1')] }).status).toBe('UNAVAILABLE');
    const r = calculateSemideviation({ returns: [sub(0, '-0.123456789'), sub(1, '2.5')] });
    expect(Number.isFinite(num(r.dailyPercentage))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// --- Historical VaR §47–§50/§92 ---------------------------------------------

describe('Historical VaR (ADR-156, nearest-rank)', () => {
  it('n=20, 95 → rank 1, worst return', () => {
    const r = calculateHistoricalVar({ returns: descendingNegative(20), confidenceLevel: '95' });
    expect(r.status).toBe('AVAILABLE');
    expect(r.tailObservationCount).toBe(1);
    expect(r.quantileReturnPercentage?.value).toBe('-20');
    expect(r.lossPercentage?.value).toBe('20');
  });

  it('n=100, 99 → rank 1, worst return', () => {
    const r = calculateHistoricalVar({ returns: descendingNegative(100), confidenceLevel: '99' });
    expect(r.tailObservationCount).toBe(1);
    expect(r.quantileReturnPercentage?.value).toBe('-100');
    expect(r.lossPercentage?.value).toBe('100');
  });

  it('n below minimum → UNAVAILABLE (95 needs 20, 99 needs 100)', () => {
    expect(
      calculateHistoricalVar({ returns: descendingNegative(19), confidenceLevel: '95' }).status,
    ).toBe('UNAVAILABLE');
    expect(
      calculateHistoricalVar({ returns: descendingNegative(99), confidenceLevel: '99' }).status,
    ).toBe('UNAVAILABLE');
  });

  it('n=200 ranks: 95 → 10, 99 → 2', () => {
    const r95 = calculateHistoricalVar({ returns: descendingNegative(200), confidenceLevel: '95' });
    const r99 = calculateHistoricalVar({ returns: descendingNegative(200), confidenceLevel: '99' });
    expect(r95.tailObservationCount).toBe(10);
    expect(r95.quantileReturnPercentage?.value).toBe('-191');
    expect(r99.tailObservationCount).toBe(2);
    expect(r99.quantileReturnPercentage?.value).toBe('-199');
  });

  it('n=101 non-integer rank: 95 → 6, 99 → 2', () => {
    const r95 = calculateHistoricalVar({ returns: descendingNegative(101), confidenceLevel: '95' });
    const r99 = calculateHistoricalVar({ returns: descendingNegative(101), confidenceLevel: '99' });
    expect(r95.tailObservationCount).toBe(6);
    expect(r95.quantileReturnPercentage?.value).toBe('-96');
    expect(r99.tailObservationCount).toBe(2);
    expect(r99.quantileReturnPercentage?.value).toBe('-100');
  });

  it('positive-only series → loss 0 (never negative VaR)', () => {
    const returns = Array.from({ length: 20 }, (_, i) => sub(i, String(1 + i)));
    const r = calculateHistoricalVar({ returns, confidenceLevel: '95' });
    expect(r.quantileReturnPercentage?.value).toBe('1');
    expect(r.lossPercentage?.value).toBe('0');
  });

  it('does not mutate the input array order', () => {
    const input = [sub(0, '3'), sub(1, '-5'), sub(2, '1')];
    const snapshot = input.map((r) => r.returnPercentage.value);
    calculateHistoricalVar({ returns: input, confidenceLevel: '95' });
    expect(input.map((r) => r.returnPercentage.value)).toEqual(snapshot);
  });

  it('deterministic regardless of input order; frozen; long decimals', () => {
    const input = descendingNegative(20);
    const a = calculateHistoricalVar({ returns: input, confidenceLevel: '95' });
    const b = calculateHistoricalVar({ returns: [...input].reverse(), confidenceLevel: '95' });
    expect(a.quantileReturnPercentage?.value).toBe(b.quantileReturnPercentage?.value);
    expect(Object.isFrozen(a)).toBe(true);
    const long = calculateHistoricalVar({
      returns: Array.from({ length: 20 }, (_, i) => sub(i, `-0.123456789${i}`)),
      confidenceLevel: '95',
    });
    expect(long.quantileReturnPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it('partial source propagates when sample is sufficient', () => {
    const r = calculateHistoricalVar({
      returns: descendingNegative(20),
      confidenceLevel: '95',
      partial: true,
    });
    expect(r.status).toBe('PARTIAL');
  });
});

// --- Historical CVaR §51–§53/§93 --------------------------------------------

describe('Historical CVaR (ADR-157)', () => {
  it('basic tail mean: [-5,-4,-3] → mean −4, loss 4', () => {
    // n=60, 95 → rank 3; the 3 worst are -5,-4,-3.
    const returns = [
      sub(0, '-5'),
      sub(1, '-4'),
      sub(2, '-3'),
      ...Array.from({ length: 57 }, (_, i) => sub(i + 3, String(1 + (i % 5)))),
    ];
    const r = calculateHistoricalCvar({ returns, confidenceLevel: '95' });
    expect(r.status).toBe('AVAILABLE');
    expect(r.tailObservationCount).toBe(3);
    expect(r.meanTailReturnPercentage?.value).toBe('-4');
    expect(r.lossPercentage?.value).toBe('4');
  });

  it('exact tail count with duplicate threshold does not expand the tail', () => {
    // n=40, 95 → rank 2. Worst values: -5,-4,-4,-4.
    const returns = [
      sub(0, '-5'),
      sub(1, '-4'),
      sub(2, '-4'),
      sub(3, '-4'),
      ...Array.from({ length: 36 }, (_, i) => sub(i + 4, String(1 + (i % 5)))),
    ];
    const r = calculateHistoricalCvar({ returns, confidenceLevel: '95' });
    expect(r.tailObservationCount).toBe(2);
    // mean of exactly [-5, -4] = -4.5 (NOT mean of all four -4s = -4.25)
    expect(r.meanTailReturnPercentage?.value).toBe('-4.5');
    expect(r.lossPercentage?.value).toBe('4.5');
  });

  it('CVaR loss >= VaR loss in the ordered sample', () => {
    const returns = [
      sub(0, '-5'),
      sub(1, '-4'),
      sub(2, '-3'),
      ...Array.from({ length: 57 }, (_, i) => sub(i + 3, String(1 + (i % 5)))),
    ];
    const varR = calculateHistoricalVar({ returns, confidenceLevel: '95' });
    const cvarR = calculateHistoricalCvar({ returns, confidenceLevel: '95' });
    expect(num(cvarR.lossPercentage)).toBeGreaterThanOrEqual(num(varR.lossPercentage));
  });

  it('positive-only series → loss 0', () => {
    const returns = Array.from({ length: 20 }, (_, i) => sub(i, String(1 + i)));
    const r = calculateHistoricalCvar({ returns, confidenceLevel: '95' });
    expect(r.lossPercentage?.value).toBe('0');
  });

  it('insufficient sample → UNAVAILABLE', () => {
    expect(
      calculateHistoricalCvar({ returns: descendingNegative(99), confidenceLevel: '99' }).status,
    ).toBe('UNAVAILABLE');
  });

  it('long decimal, frozen, no NaN/Infinity, deterministic', () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      sub(i, i < 3 ? `-0.123456789${i}` : `0.5${i}`),
    );
    const a = calculateHistoricalCvar({ returns: input, confidenceLevel: '95' });
    const b = calculateHistoricalCvar({ returns: [...input].reverse(), confidenceLevel: '95' });
    expect(a.lossPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(a.lossPercentage?.value).toBe(b.lossPercentage?.value);
    expect(Object.isFrozen(a)).toBe(true);
    expect(JSON.stringify(a)).not.toContain('Infinity');
    expect(JSON.stringify(a)).not.toContain('NaN');
  });
});

// --- Combined / metric-specific §33/§66 -------------------------------------

describe('Combined tail risk — metric-specific availability', () => {
  it('n=50, confidence 99 → downside/semideviation available, VaR/CVaR unavailable, PARTIAL', () => {
    const returns = Array.from({ length: 50 }, (_, i) => sub(i, i % 3 === 0 ? '-2' : '1'));
    const r = calculateTailRisk({
      currency: 'BRL' as never,
      returns,
      confidenceLevel: '99',
    });
    expect(r.downsideDeviation.status).toBe('AVAILABLE');
    expect(r.semideviation.status).toBe('AVAILABLE');
    expect(r.historicalVar.status).toBe('UNAVAILABLE');
    expect(r.historicalCvar.status).toBe('UNAVAILABLE');
    expect(r.status).toBe('PARTIAL');
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('n=120, confidence 99 → all available', () => {
    const returns = Array.from({ length: 120 }, (_, i) => sub(i, i % 3 === 0 ? '-2' : '1'));
    const r = calculateTailRisk({ currency: 'BRL' as never, returns, confidenceLevel: '99' });
    expect(r.status).toBe('AVAILABLE');
    expect(r.historicalVar.tailObservationCount).toBe(2);
  });
});

// --- Closure proofs: nearest-rank execution, minimums, sort-once, immutability

describe('Nearest-rank execution proof (ADR-156)', () => {
  it('n=101 / 95: rank 6 → sorted[5] (NOT sorted[4], NOT interpolation)', () => {
    // descendingNegative(101) → sorted ASC = [-101, -100, ..., -1]; sorted[i] = -(101 - i)
    const returns = descendingNegative(101);
    const r = calculateHistoricalVar({ returns, confidenceLevel: '95' });
    expect(r.observationCount).toBe(101);
    expect(r.tailObservationCount).toBe(6);
    expect(r.quantileReturnPercentage?.value).toBe('-96'); // sorted[5]
    expect(r.quantileReturnPercentage?.value).not.toBe('-97'); // sorted[4]
    expect(r.quantileReturnPercentage?.value).not.toBe('-96.5'); // interpolation
  });

  it('n=101 / 99: rank 2 → sorted[1]', () => {
    const returns = descendingNegative(101);
    const r = calculateHistoricalVar({ returns, confidenceLevel: '99' });
    expect(r.tailObservationCount).toBe(2);
    expect(r.quantileReturnPercentage?.value).toBe('-100'); // sorted[1]
  });

  it('n=200: 95 → rank 10 (sorted[9]); 99 → rank 2 (sorted[1])', () => {
    const returns = descendingNegative(200);
    const r95 = calculateHistoricalVar({ returns, confidenceLevel: '95' });
    const r99 = calculateHistoricalVar({ returns, confidenceLevel: '99' });
    expect(r95.tailObservationCount).toBe(10);
    expect(r95.quantileReturnPercentage?.value).toBe('-191'); // sorted[9]
    expect(r99.tailObservationCount).toBe(2);
    expect(r99.quantileReturnPercentage?.value).toBe('-199'); // sorted[1]
  });

  it('minimum-sample boundaries: 95 n19 UNAVAILABLE / n20 rank1; 99 n99 UNAVAILABLE / n100 rank1', () => {
    const n19 = calculateHistoricalVar({ returns: descendingNegative(19), confidenceLevel: '95' });
    expect(n19.status).toBe('UNAVAILABLE');
    expect(
      calculateHistoricalCvar({ returns: descendingNegative(19), confidenceLevel: '95' }).status,
    ).toBe('UNAVAILABLE');

    const n20 = calculateHistoricalVar({ returns: descendingNegative(20), confidenceLevel: '95' });
    expect(n20.status).toBe('AVAILABLE');
    expect(n20.tailObservationCount).toBe(1);
    expect(n20.quantileReturnPercentage?.value).toBe('-20');

    expect(
      calculateHistoricalVar({ returns: descendingNegative(99), confidenceLevel: '99' }).status,
    ).toBe('UNAVAILABLE');
    expect(
      calculateHistoricalCvar({ returns: descendingNegative(99), confidenceLevel: '99' }).status,
    ).toBe('UNAVAILABLE');

    const n100 = calculateHistoricalVar({
      returns: descendingNegative(100),
      confidenceLevel: '99',
    });
    expect(n100.status).toBe('AVAILABLE');
    expect(n100.tailObservationCount).toBe(1);
    expect(n100.quantileReturnPercentage?.value).toBe('-100');
  });
});

describe('CVaR duplicate-threshold gate (ADR-157)', () => {
  it('rank 3 with duplicates at the threshold uses EXACTLY the first 3 sorted observations', () => {
    // n=60, 95 → rank 3. Sorted tail: [-10, -8, -5, -5, -5, ...].
    const returns = [
      sub(0, '-10'),
      sub(1, '-8'),
      sub(2, '-5'),
      sub(3, '-5'),
      sub(4, '-5'),
      ...Array.from({ length: 55 }, (_, i) => sub(i + 5, String(1 + (i % 5)))),
    ];
    const varR = calculateHistoricalVar({ returns, confidenceLevel: '95' });
    const cvarR = calculateHistoricalCvar({ returns, confidenceLevel: '95' });

    expect(varR.tailObservationCount).toBe(3);
    expect(varR.quantileReturnPercentage?.value).toBe('-5'); // threshold = sorted[2]
    expect(cvarR.tailObservationCount).toBe(3); // exactly rank, NOT all values == -5
    // mean of [-10, -8, -5] = -23/3 ≈ -7.6667 (NOT mean of all five = -6.6)
    expect(Number(cvarR.meanTailReturnPercentage?.value)).toBeCloseTo(-7.666666666666667, 9);
    expect(Number(cvarR.meanTailReturnPercentage?.value)).not.toBeCloseTo(-6.6, 6);
    expect(Number(cvarR.lossPercentage?.value)).toBeCloseTo(7.666666666666667, 9);
  });
});

describe('Sort-once and immutability proof', () => {
  it('calculateTailRisk value-sorts once and reuses it for VaR and CVaR', () => {
    const returns = Array.from({ length: 60 }, (_, i) => sub(i, i < 3 ? `-${10 - i * 2}` : '1'));
    const originalSort = Array.prototype.sort;
    let count = 0;
    (Array.prototype as unknown as { sort: (cmp?: unknown) => unknown }).sort = function (
      this: unknown,
      cmp?: unknown,
    ) {
      count++;
      return (originalSort as (this: unknown, cmp?: unknown) => unknown).call(this, cmp);
    };
    try {
      calculateTailRisk({ currency: 'BRL' as never, returns, confidenceLevel: '95' });
      // 2 date-order sorts (downside + semideviation) + 1 return-value sort shared by VaR/CVaR.
      // A second value sort for CVaR would make this 4.
      expect(count).toBe(3);

      count = 0;
      calculateHistoricalVar({ returns, confidenceLevel: '95' });
      calculateHistoricalCvar({ returns, confidenceLevel: '95' });
      // Separate calls sort independently (2 value sorts).
      expect(count).toBe(2);
    } finally {
      Array.prototype.sort = originalSort;
    }
  });

  it('calculateTailRisk does not mutate the input return order', () => {
    const input = Array.from({ length: 21 }, (_, i) => sub(i, i % 2 === 0 ? '3' : '-5'));
    const snapshot = input.map((r) => r.returnPercentage.value);
    calculateTailRisk({ currency: 'BRL' as never, returns: input, confidenceLevel: '95' });
    expect(input.map((r) => r.returnPercentage.value)).toEqual(snapshot);
  });
});
