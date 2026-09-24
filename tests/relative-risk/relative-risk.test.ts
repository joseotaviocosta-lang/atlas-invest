import { describe, it, expect } from 'vitest';
import { LocalDate, Percentage, Quantity } from '@atlas/domain';
import {
  alignBenchmarkRelativeReturns,
  buildPortfolioIntervals,
  buildBenchmarkIntervals,
  calculateBeta,
  calculateCorrelation,
  calculateTrackingError,
  calculateBenchmarkRelativeRisk,
  relativeRiskPairKey,
  RelativeRiskInterval,
  RelativeRiskBenchmarkLevel,
  BenchmarkRelativeReturnObservation,
  RiskSubperiodReturn,
} from '@atlas/risk-engine';

// --- fixtures ----------------------------------------------------------------

function interval(start: string, end: string, ret: string): RelativeRiskInterval {
  return {
    startDate: LocalDate.from(start),
    endDate: LocalDate.from(end),
    returnPercentage: Percentage.from(ret),
  };
}

function level(date: string, value: string): RelativeRiskBenchmarkLevel {
  return { date: LocalDate.from(date), level: Quantity.from(value) };
}

function obs(
  start: string,
  end: string,
  portfolio: string,
  benchmark: string,
): BenchmarkRelativeReturnObservation {
  return {
    startDate: LocalDate.from(start),
    endDate: LocalDate.from(end),
    portfolioReturn: Percentage.from(portfolio),
    benchmarkReturn: Percentage.from(benchmark),
  };
}

function num(q: { toString(): string } | null): number {
  if (!q) throw new Error('expected non-null quantity');
  return Number(q.toString());
}

/** Reference Pearson (test-only, float) for pinning expected values. */
function referencePearson(ps: number[], bs: number[]): number {
  const n = ps.length;
  const mp = ps.reduce((a, b) => a + b, 0) / n;
  const mb = bs.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vp = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ps[i]! - mp) * (bs[i]! - mb);
    vp += (ps[i]! - mp) ** 2;
    vb += (bs[i]! - mb) ** 2;
  }
  return cov / Math.sqrt(vp * vb);
}

const D = (i: number): string => `2026-01-${String(i).padStart(2, '0')}`;

// --- Alignment §93/§94/§95 ---------------------------------------------------

describe('Interval alignment — strict (startDate, endDate) identity (ADR-139)', () => {
  it('exact same interval forms one valid pair', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
    });
    expect(r.pairedObservationCount).toBe(1);
    expect(r.status).toBe('AVAILABLE');
    expect(r.observations[0]!.portfolioReturn.value).toBe('2');
    expect(r.observations[0]!.benchmarkReturn.value).toBe('1');
  });

  it('CRITICAL: same end date / different start date is rejected (§94)', () => {
    const r = alignBenchmarkRelativeReturns({
      // Portfolio Fri→Tue, benchmark Mon→Tue: both end Tuesday, NOT a pair.
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-05', '2026-01-06', '1')],
    });
    expect(r.pairedObservationCount).toBe(0);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.droppedPortfolioIntervalCount).toBe(1);
    expect(r.droppedBenchmarkIntervalCount).toBe(1);
  });

  it('same start date / different end date is rejected', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-07', '1')],
    });
    expect(r.pairedObservationCount).toBe(0);
  });

  it('valid pair spans the weekend on both legs (§95)', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
    });
    expect(r.pairedObservationCount).toBe(1);
  });

  it('portfolio interval without benchmark is dropped (PARTIAL)', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [],
    });
    expect(r.pairedObservationCount).toBe(0);
    expect(r.droppedPortfolioIntervalCount).toBe(1);
    expect(r.droppedBenchmarkIntervalCount).toBe(0);
  });

  it('benchmark interval without portfolio is dropped (PARTIAL)', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [
        interval('2026-01-02', '2026-01-06', '2'),
        interval('2026-01-06', '2026-01-07', '1'),
      ],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
    });
    expect(r.pairedObservationCount).toBe(1);
    expect(r.droppedBenchmarkIntervalCount).toBe(0);
    expect(r.droppedPortfolioIntervalCount).toBe(1);
    expect(r.status).toBe('PARTIAL');
  });

  it('weekend-only interval is never paired with a weekday interval', () => {
    // Portfolio boundary Saturday→Monday (flow weekend) vs benchmark Fri→Mon.
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-03', '2026-01-05', '0')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-05', '1')],
    });
    expect(r.pairedObservationCount).toBe(0);
  });

  it('holiday fallback interval does not create a statistical pair', () => {
    // Portfolio has no economic boundary on the holiday; only the real
    // economic interval pairs. A holiday boundary must not invent a 0% leg.
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-07', '3')],
      benchmarkIntervals: [
        interval('2026-01-02', '2026-01-06', '1'),
        interval('2026-01-06', '2026-01-07', '2'),
      ],
    });
    expect(r.pairedObservationCount).toBe(0);
    expect(r.droppedPortfolioIntervalCount).toBe(1);
    expect(r.droppedBenchmarkIntervalCount).toBe(2);
  });

  it('partial overlap keeps only exact matches', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [
        interval('2026-01-02', '2026-01-06', '2'),
        interval('2026-01-06', '2026-01-08', '1'),
      ],
      benchmarkIntervals: [
        interval('2026-01-02', '2026-01-06', '1'),
        interval('2026-01-06', '2026-01-07', '1'),
      ],
    });
    expect(r.observations.map((o) => relativeRiskPairKey(o))).toEqual(['2026-01-02::2026-01-06']);
    expect(r.status).toBe('PARTIAL');
  });

  it('zero overlap yields an empty UNAVAILABLE alignment', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-02-02', '2026-02-06', '1')],
    });
    expect(r.pairedObservationCount).toBe(0);
    expect(r.observations).toHaveLength(0);
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('deterministic ordering regardless of input order', () => {
    const p = [
      interval('2026-01-06', '2026-01-07', '1'),
      interval('2026-01-02', '2026-01-06', '2'),
    ];
    const b = [
      interval('2026-01-06', '2026-01-07', '1'),
      interval('2026-01-02', '2026-01-06', '1'),
    ];
    const a1 = alignBenchmarkRelativeReturns({ portfolioIntervals: p, benchmarkIntervals: b });
    const a2 = alignBenchmarkRelativeReturns({
      portfolioIntervals: [...p].reverse(),
      benchmarkIntervals: [...b].reverse(),
    });
    expect(a1.observations.map(relativeRiskPairKey)).toEqual(
      a2.observations.map(relativeRiskPairKey),
    );
  });

  it('duplicate interval keys are deduplicated deterministically', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [
        interval('2026-01-02', '2026-01-06', '2'),
        interval('2026-01-02', '2026-01-06', '9'),
      ],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
    });
    expect(r.portfolioIntervalCount).toBe(1);
    expect(r.pairedObservationCount).toBe(1);
    expect(r.observations[0]!.portfolioReturn.value).toBe('2');
  });

  it('alignment result and observations are frozen', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
    });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.observations)).toBe(true);
    expect(Object.isFrozen(r.observations[0])).toBe(true);
  });

  it('missing intermediate benchmark session prevents aggregation (no false DAILY pair)', () => {
    // Portfolio observes Mon, Tue, Wed, Thu; benchmark is missing Tue.
    // A paired interval must be a consecutive benchmark interval (single
    // economic step). Mon→Wed (aggregating Mon+Tue sessions) must NOT pair.
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [
        interval('2026-01-05', '2026-01-06', '1'), // Mon->Tue
        interval('2026-01-06', '2026-01-07', '1'), // Tue->Wed
        interval('2026-01-07', '2026-01-08', '1'), // Wed->Thu
      ],
      benchmarkIntervals: [
        interval('2026-01-05', '2026-01-07', '2'), // Mon->Wed (aggregated)
        interval('2026-01-07', '2026-01-08', '1'), // Wed->Thu
      ],
    });
    expect(r.pairedObservationCount).toBe(1);
    expect(r.observations.map(relativeRiskPairKey)).toEqual(['2026-01-07::2026-01-08']);
    expect(r.droppedPortfolioIntervalCount).toBe(2);
    expect(r.droppedBenchmarkIntervalCount).toBe(1);
    expect(r.status).toBe('PARTIAL');
  });

  it('missing intermediate portfolio session prevents aggregation (no false DAILY pair)', () => {
    // Benchmark observes Mon, Tue, Wed; portfolio is missing Tue.
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [
        interval('2026-01-05', '2026-01-07', '2'), // Mon->Wed (aggregated)
        interval('2026-01-07', '2026-01-08', '1'), // Wed->Thu
      ],
      benchmarkIntervals: [
        interval('2026-01-05', '2026-01-06', '1'), // Mon->Tue
        interval('2026-01-06', '2026-01-07', '1'), // Tue->Wed
        interval('2026-01-07', '2026-01-08', '1'), // Wed->Thu
      ],
    });
    expect(r.pairedObservationCount).toBe(1);
    expect(r.observations.map(relativeRiskPairKey)).toEqual(['2026-01-07::2026-01-08']);
    expect(r.droppedPortfolioIntervalCount).toBe(1);
    expect(r.droppedBenchmarkIntervalCount).toBe(2);
    expect(r.status).toBe('PARTIAL');
  });

  it('a weekend-only gap between two sessions is a single valid economic step', () => {
    // Friday->Monday on both sides is one market transition (weekend inside).
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-05', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-05', '1')],
    });
    expect(r.pairedObservationCount).toBe(1);
    expect(r.status).toBe('AVAILABLE');
  });

  it('PARTIAL status is propagated when requested', () => {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-02', '2026-01-06', '1')],
      partial: true,
    });
    expect(r.status).toBe('PARTIAL');
  });
});

// --- Interval builders -------------------------------------------------------

describe('Portfolio and benchmark interval builders', () => {
  it('chains daily TWR subperiods between consecutive economic boundaries', () => {
    const subperiods: RiskSubperiodReturn[] = [
      { date: LocalDate.from('2026-01-02'), returnPercentage: Percentage.from('1') },
      { date: LocalDate.from('2026-01-03'), returnPercentage: Percentage.from('2') },
      { date: LocalDate.from('2026-01-04'), returnPercentage: Percentage.from('3') },
    ];
    const intervals = buildPortfolioIntervals({
      boundaries: [LocalDate.from('2026-01-02'), LocalDate.from('2026-01-04')],
      subperiodReturns: subperiods,
    });
    expect(intervals).toHaveLength(1);
    // (1.02 × 1.03 − 1) × 100 = 5.06
    expect(intervals[0]!.returnPercentage.value).toBe('5.06');
  });

  it('skips intervals with no subperiod (never fabricates 0%)', () => {
    const intervals = buildPortfolioIntervals({
      boundaries: [LocalDate.from('2026-01-02'), LocalDate.from('2026-01-06')],
      subperiodReturns: [],
    });
    expect(intervals).toHaveLength(0);
  });

  it('builds benchmark interval from exact index levels', () => {
    const intervals = buildBenchmarkIntervals({
      boundaries: [LocalDate.from('2026-01-02'), LocalDate.from('2026-01-04')],
      levels: [level('2026-01-02', '100'), level('2026-01-04', '105')],
    });
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.returnPercentage.value).toBe('5');
  });

  it('skips benchmark boundaries with a missing level', () => {
    const intervals = buildBenchmarkIntervals({
      boundaries: [LocalDate.from('2026-01-02'), LocalDate.from('2026-01-04')],
      levels: [level('2026-01-02', '100')],
    });
    expect(intervals).toHaveLength(0);
  });
});

// --- Beta §50–§53/§98 --------------------------------------------------------

describe('Beta (ADR-140)', () => {
  it('beta = 2 (portfolio returns are 2× benchmark)', () => {
    const r = calculateBeta({
      observations: [
        obs(D(2), D(3), '2', '1'),
        obs(D(3), D(4), '4', '2'),
        obs(D(4), D(5), '6', '3'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.beta?.toString()).toBe('2');
  });

  it('beta = 1 for identical returns', () => {
    const r = calculateBeta({
      observations: [
        obs(D(2), D(3), '1', '1'),
        obs(D(3), D(4), '2', '2'),
        obs(D(4), D(5), '3', '3'),
      ],
    });
    expect(r.beta?.toString()).toBe('1');
  });

  it('beta = 0 when covariance is exactly zero', () => {
    const r = calculateBeta({
      observations: [
        obs(D(2), D(3), '1', '1'),
        obs(D(3), D(4), '-1', '2'),
        obs(D(4), D(5), '-1', '3'),
        obs(D(5), D(6), '1', '4'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.beta?.toString()).toBe('0');
  });

  it('beta = -1 for perfectly inverse returns', () => {
    const r = calculateBeta({
      observations: [
        obs(D(2), D(3), '-1', '1'),
        obs(D(3), D(4), '-2', '2'),
        obs(D(4), D(5), '-3', '3'),
      ],
    });
    expect(r.beta?.toString()).toBe('-1');
  });

  it('zero benchmark variance → null (never Infinity)', () => {
    const r = calculateBeta({
      observations: [obs(D(2), D(3), '1', '2'), obs(D(3), D(4), '3', '2')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.beta).toBeNull();
  });

  it('insufficient observations → null', () => {
    expect(calculateBeta({ observations: [] }).beta).toBeNull();
    expect(calculateBeta({ observations: [obs(D(2), D(3), '1', '1')] }).beta).toBeNull();
  });

  it('long decimals are exact and finite; frozen output', () => {
    const r = calculateBeta({
      observations: [
        obs(D(2), D(3), '0.123456789', '0.050000001'),
        obs(D(3), D(4), '-0.987654321', '0.049999999'),
        obs(D(4), D(5), '2.5', '0.05'),
      ],
    });
    expect(r.beta?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(num(r.beta))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('deterministic regardless of input order', () => {
    const input = [obs(D(2), D(3), '1', '1'), obs(D(3), D(4), '2', '2'), obs(D(4), D(5), '4', '3')];
    const a = calculateBeta({ observations: input });
    const b = calculateBeta({ observations: [...input].reverse() });
    expect(a.beta?.toString()).toBe(b.beta?.toString());
  });

  it('duplicate pair keys fail closed', () => {
    const r = calculateBeta({
      observations: [obs(D(2), D(3), '1', '1'), obs(D(2), D(3), '2', '2')],
    });
    expect(r.status).toBe('UNAVAILABLE');
  });
});

// --- Correlation §54/§55/§99 -------------------------------------------------

describe('Correlation (ADR-141)', () => {
  it('+1 for perfectly correlated returns', () => {
    const r = calculateCorrelation({
      observations: [
        obs(D(2), D(3), '2', '1'),
        obs(D(3), D(4), '4', '2'),
        obs(D(4), D(5), '6', '3'),
      ],
    });
    expect(r.correlation?.toString()).toBe('1');
  });

  it('-1 for perfectly inverse returns', () => {
    const r = calculateCorrelation({
      observations: [
        obs(D(2), D(3), '-1', '1'),
        obs(D(3), D(4), '-2', '2'),
        obs(D(4), D(5), '-3', '3'),
      ],
    });
    expect(r.correlation?.toString()).toBe('-1');
  });

  it('near-zero correlation when returns are orthogonal', () => {
    const r = calculateCorrelation({
      observations: [
        obs(D(2), D(3), '1', '1'),
        obs(D(3), D(4), '-1', '2'),
        obs(D(4), D(5), '-1', '3'),
        obs(D(5), D(6), '1', '4'),
      ],
    });
    expect(num(r.correlation)).toBeCloseTo(0, 12);
  });

  it('non-perfect positive correlation pinned against reference', () => {
    const ps = [1, 3, 2, 5];
    const bs = [1, 2, 3, 4];
    const r = calculateCorrelation({
      observations: ps.map((p, i) => obs(D(i + 2), D(i + 3), String(p), String(bs[i]!))),
    });
    expect(num(r.correlation)).toBeCloseTo(referencePearson(ps, bs), 9);
  });

  it('non-perfect negative correlation pinned against reference', () => {
    const ps = [5, 2, 3, 1];
    const bs = [1, 2, 3, 4];
    const r = calculateCorrelation({
      observations: ps.map((p, i) => obs(D(i + 2), D(i + 3), String(p), String(bs[i]!))),
    });
    expect(num(r.correlation)).toBeCloseTo(referencePearson(ps, bs), 9);
    expect(num(r.correlation)).toBeLessThan(0);
  });

  it('zero portfolio variance → null', () => {
    const r = calculateCorrelation({
      observations: [obs(D(2), D(3), '1', '1'), obs(D(3), D(4), '1', '2')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.correlation).toBeNull();
  });

  it('zero benchmark variance → null', () => {
    const r = calculateCorrelation({
      observations: [obs(D(2), D(3), '1', '1'), obs(D(3), D(4), '2', '1')],
    });
    expect(r.correlation).toBeNull();
  });

  it('insufficient observations → null', () => {
    expect(calculateCorrelation({ observations: [] }).correlation).toBeNull();
  });

  it('stays within [-1, 1] and clamps only within tolerance', () => {
    const r = calculateCorrelation({
      observations: [
        obs(D(2), D(3), '0.1', '0.2'),
        obs(D(3), D(4), '0.2', '0.4'),
        obs(D(4), D(5), '0.3', '0.6'),
      ],
    });
    const c = num(r.correlation);
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(-1);
    expect(c).toBe(1);
  });

  it('long decimals are finite, frozen and deterministic', () => {
    const input = [
      obs(D(2), D(3), '0.123456789', '0.050000001'),
      obs(D(3), D(4), '-0.987654321', '0.049999999'),
      obs(D(4), D(5), '2.5', '0.05'),
    ];
    const a = calculateCorrelation({ observations: input });
    const b = calculateCorrelation({ observations: [...input].reverse() });
    expect(Number.isFinite(num(a.correlation))).toBe(true);
    expect(a.correlation?.toString()).toBe(b.correlation?.toString());
    expect(Object.isFrozen(a)).toBe(true);
  });
});

// --- Tracking error §56/§57/§100 --------------------------------------------

describe('Tracking error (ADR-142)', () => {
  it('identical returns → exactly 0 (known, not missing)', () => {
    const r = calculateTrackingError({
      observations: [
        obs(D(2), D(3), '1', '1'),
        obs(D(3), D(4), '2', '2'),
        obs(D(4), D(5), '3', '3'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.samplePercentage?.value).toBe('0');
    expect(r.annualizedPercentage?.value).toBe('0');
  });

  it('variable active returns → > 0 and pinned', () => {
    // active = +1, -1, +1 → mean 1/3, sample var = ((2/3)²+(-4/3)²+(2/3)²)/2
    const r = calculateTrackingError({
      observations: [
        obs(D(2), D(3), '2', '1'),
        obs(D(3), D(4), '1', '2'),
        obs(D(4), D(5), '4', '3'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(Number(r.samplePercentage?.value)).toBeGreaterThan(0);
    expect(Number(r.samplePercentage?.value)).toBeCloseTo(1.1547005383792515, 9);
    expect(r.annualizationFactor).toBe('252');
  });

  it('annualization is daily × sqrt(252)', () => {
    const r = calculateTrackingError({
      observations: [
        obs(D(2), D(3), '2', '1'),
        obs(D(3), D(4), '1', '2'),
        obs(D(4), D(5), '4', '3'),
      ],
    });
    const ratio = Number(r.annualizedPercentage?.value) / Number(r.samplePercentage?.value);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
  });

  it('insufficient observations → null (never 0)', () => {
    const r = calculateTrackingError({
      observations: [obs(D(2), D(3), '1', '1')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.samplePercentage).toBeNull();
    expect(r.annualizedPercentage).toBeNull();
  });

  it('long decimals, frozen, deterministic, no NaN/Infinity', () => {
    const input = [
      obs(D(2), D(3), '0.123456789', '0.050000001'),
      obs(D(3), D(4), '-0.987654321', '0.049999999'),
      obs(D(4), D(5), '2.5', '0.05'),
    ];
    const a = calculateTrackingError({ observations: input });
    const b = calculateTrackingError({ observations: [...input].reverse() });
    expect(a.annualizedPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(Number(a.annualizedPercentage?.value))).toBe(true);
    expect(a.annualizedPercentage?.value).toBe(b.annualizedPercentage?.value);
    expect(Object.isFrozen(a)).toBe(true);
  });
});

// --- Partial §101 and combined ----------------------------------------------

describe('Partial alignment and combined result', () => {
  it('10 portfolio / 8 benchmark / 7 pairs → PARTIAL with coherent counts', () => {
    const portfolio: RelativeRiskInterval[] = [];
    for (let i = 1; i <= 10; i++) portfolio.push(interval(D(i), D(i + 1), '1'));
    const benchmark: RelativeRiskInterval[] = [];
    for (let i = 2; i <= 8; i++) benchmark.push(interval(D(i), D(i + 1), '1'));
    benchmark.push(interval('2026-01-20', '2026-01-21', '1'));
    const alignment = alignBenchmarkRelativeReturns({
      portfolioIntervals: portfolio,
      benchmarkIntervals: benchmark,
    });
    expect(alignment.portfolioIntervalCount).toBe(10);
    expect(alignment.benchmarkIntervalCount).toBe(8);
    expect(alignment.pairedObservationCount).toBe(7);
    expect(alignment.droppedPortfolioIntervalCount).toBe(3);
    expect(alignment.droppedBenchmarkIntervalCount).toBe(1);
    expect(alignment.status).toBe('PARTIAL');
  });

  it('combined benchmark-relative risk returns beta, correlation and tracking error', () => {
    const r = calculateBenchmarkRelativeRisk({
      currency: 'BRL' as never,
      observations: [
        obs(D(2), D(3), '2', '1'),
        obs(D(3), D(4), '4', '2'),
        obs(D(4), D(5), '6', '3'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.beta?.toString()).toBe('2');
    expect(r.correlation?.toString()).toBe('1');
    // Active returns are [1,2,3] here, so tracking error is strictly positive.
    expect(Number(r.trackingError.samplePercentage?.value)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(r.trackingError.annualizedPercentage?.value))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.trackingError)).toBe(true);
  });
});
