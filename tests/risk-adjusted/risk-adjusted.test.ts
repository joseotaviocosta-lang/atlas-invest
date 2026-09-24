import { describe, it, expect } from 'vitest';
import { LocalDate, Percentage } from '@atlas/domain';
import {
  calculateSharpeRatio,
  calculateSortinoRatio,
  alignRiskFreeObservations,
  RiskAdjustedReturnObservation,
  RiskSubperiodReturn,
  RiskFreeDailyObservation,
} from '@atlas/risk-engine';

function obs(date: string, portfolio: string, riskFree: string): RiskAdjustedReturnObservation {
  return {
    date: LocalDate.from(date),
    portfolioReturn: Percentage.from(portfolio),
    riskFreeReturn: Percentage.from(riskFree),
  };
}
function sub(date: string, percent: string): RiskSubperiodReturn {
  return { date: LocalDate.from(date), returnPercentage: Percentage.from(percent) };
}
function ref(date: string, daily: string): RiskFreeDailyObservation {
  return { date: LocalDate.from(date), dailyReturn: Percentage.from(daily) };
}
function num(q: { toString(): string } | null): number {
  if (!q) throw new Error('expected non-null quantity');
  return Number(q.toString());
}

// --- Sharpe §57/§58 ----------------------------------------------------------

describe('Sharpe — minimum observations', () => {
  it('0 and 1 observations → UNAVAILABLE with nulls', () => {
    const empty = calculateSharpeRatio({ observations: [] });
    expect(empty.status).toBe('UNAVAILABLE');
    expect(empty.dailySharpe).toBeNull();
    expect(empty.annualizedSharpe).toBeNull();
    expect(empty.meanDailyExcessPercentage).toBeNull();

    const one = calculateSharpeRatio({ observations: [obs('2026-01-02', '1', '0')] });
    expect(one.status).toBe('UNAVAILABLE');
    expect(one.dailySharpe).toBeNull();
  });

  it('two observations compute', () => {
    const r = calculateSharpeRatio({
      observations: [obs('2026-01-02', '1', '0'), obs('2026-01-03', '3', '0')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.observationCount).toBe(2);
    // excess 1,3 → mean 2, sample std = sqrt(((−1)²+1²)/1) = sqrt(2) ≈ 1.41421
    expect(Math.abs(num(r.dailySharpe) - 2 / 1.4142135623730951)).toBeLessThan(1e-9);
  });
});

describe('Sharpe — basic fixture (1%, 2%, 3% vs 0%)', () => {
  const r = calculateSharpeRatio({
    observations: [
      obs('2026-01-02', '1', '0'),
      obs('2026-01-03', '2', '0'),
      obs('2026-01-04', '3', '0'),
    ],
  });

  it('daily Sharpe is exactly 2', () => {
    expect(r.status).toBe('AVAILABLE');
    expect(r.dailySharpe?.toString()).toBe('2');
    expect(r.meanDailyExcessPercentage?.value).toBe('2');
  });

  it('annualized is 2 × sqrt(252)', () => {
    expect(Math.abs(num(r.annualizedSharpe) - 2 * 15.874507866387544)).toBeLessThan(1e-9);
  });
});

describe('Sharpe — sign cases', () => {
  it('negative Sharpe when mean excess is negative', () => {
    const r = calculateSharpeRatio({
      observations: [
        obs('2026-01-02', '-3', '0'),
        obs('2026-01-03', '-2', '0'),
        obs('2026-01-04', '-1', '0'),
      ],
    });
    expect(num(r.dailySharpe)).toBeLessThan(0);
    expect(num(r.dailySharpe)).toBeCloseTo(-2, 10);
  });

  it('zero mean excess → Sharpe 0 (known, not missing)', () => {
    const r = calculateSharpeRatio({
      observations: [
        obs('2026-01-02', '1', '0'),
        obs('2026-01-03', '-1', '0'),
        obs('2026-01-04', '1', '0'),
        obs('2026-01-05', '-1', '0'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.dailySharpe?.toString()).toBe('0');
    expect(r.annualizedSharpe?.toString()).toBe('0');
  });

  it('constant excess → zero denominator → null (never Infinity)', () => {
    const r = calculateSharpeRatio({
      observations: [
        obs('2026-01-02', '1', '0'),
        obs('2026-01-03', '1', '0'),
        obs('2026-01-04', '1', '0'),
      ],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.dailySharpe).toBeNull();
    expect(r.annualizedSharpe).toBeNull();
  });
});

describe('Sharpe — CDI excess fixture (§59)', () => {
  it('0.10/0.20/0.05 vs 0.05 → excess 0.05/0.15/0', () => {
    const r = calculateSharpeRatio({
      observations: [
        obs('2026-01-02', '0.10', '0.05'),
        obs('2026-01-03', '0.20', '0.05'),
        obs('2026-01-04', '0.05', '0.05'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.observationCount).toBe(3);
    // mean = (0.05+0.15+0)/3 = 0.0666…%
    expect(Math.abs(Number(r.meanDailyExcessPercentage?.value) - 0.0666666667)).toBeLessThan(1e-6);
    expect(Number.isFinite(num(r.annualizedSharpe))).toBe(true);
  });
});

describe('Sharpe — determinism, decimals, frozen, finite', () => {
  const input = [
    obs('2026-01-02', '0.123456789', '0.051111111'),
    obs('2026-01-03', '-0.987654321', '0.049999999'),
    obs('2026-01-04', '2.5', '0.05'),
  ];

  it('deterministic regardless of input order', () => {
    const a = calculateSharpeRatio({ observations: input });
    const b = calculateSharpeRatio({ observations: [...input].reverse() });
    expect(a.annualizedSharpe?.toString()).toBe(b.annualizedSharpe?.toString());
  });

  it('decimal strings, finite, frozen, no NaN/Infinity', () => {
    const r = calculateSharpeRatio({ observations: input });
    expect(r.annualizedSharpe?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    const v = num(r.annualizedSharpe);
    expect(Number.isFinite(v)).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('duplicate dates fail closed', () => {
    const r = calculateSharpeRatio({
      observations: [obs('2026-01-02', '1', '0'), obs('2026-01-02', '2', '0')],
    });
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('riskFreeProxy defaults to CDI and is exposed', () => {
    const r = calculateSharpeRatio({ observations: input });
    expect(r.riskFreeProxy).toBe('CDI');
    expect(r.annualizationFactor).toBe('252');
    expect(r.frequency).toBe('DAILY');
  });
});

// --- Sortino §60/§61 ---------------------------------------------------------

describe('Sortino — minimum observations', () => {
  it('0 and 1 observations → UNAVAILABLE', () => {
    expect(calculateSortinoRatio({ observations: [] }).status).toBe('UNAVAILABLE');
    const one = calculateSortinoRatio({ observations: [obs('2026-01-02', '1', '0')] });
    expect(one.status).toBe('UNAVAILABLE');
    expect(one.dailySortino).toBeNull();
  });
});

describe('Sortino — downside fixture (+1/−2/+3/−1)', () => {
  const r = calculateSortinoRatio({
    observations: [
      obs('2026-01-02', '1', '0'),
      obs('2026-01-03', '-2', '0'),
      obs('2026-01-04', '3', '0'),
      obs('2026-01-05', '-1', '0'),
    ],
  });

  it('only −2/−1 feed the downside numerator, count is exact', () => {
    expect(r.status).toBe('AVAILABLE');
    expect(r.downsideObservationCount).toBe(2);
    expect(r.observationCount).toBe(4);
    // downside var = (0.0004+0.0001)/4 = 0.000125 → dev ≈ 1.1180%
    expect(Math.abs(Number(r.downsideDeviationPercentage?.value) - 1.118033988749895)).toBeLessThan(
      1e-9,
    );
  });

  it('mean excess 0.25% over downside dev → positive Sortino, annualized × sqrt(252)', () => {
    // mean = (1−2+3−1)/4 = 0.25
    expect(num(r.dailySortino)).toBeGreaterThan(0);
    const ratio = num(r.annualizedSortino) / num(r.dailySortino);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
  });
});

describe('Sortino — edge cases', () => {
  it('all positive excess → zero downside → null (never Infinity)', () => {
    const r = calculateSortinoRatio({
      observations: [
        obs('2026-01-02', '1', '0'),
        obs('2026-01-03', '2', '0'),
        obs('2026-01-04', '3', '0'),
      ],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.dailySortino).toBeNull();
    expect(r.downsideObservationCount).toBe(0);
  });

  it('all negative excess computes (negative Sortino)', () => {
    const r = calculateSortinoRatio({
      observations: [
        obs('2026-01-02', '-1', '0'),
        obs('2026-01-03', '-2', '0'),
        obs('2026-01-04', '-3', '0'),
      ],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.downsideObservationCount).toBe(3);
    expect(num(r.dailySortino)).toBeLessThan(0);
  });

  it('frozen, finite, decimal strings', () => {
    const r = calculateSortinoRatio({
      observations: [
        obs('2026-01-02', '0.5', '0.05'),
        obs('2026-01-03', '-0.3', '0.05'),
        obs('2026-01-04', '1.25', '0.05'),
      ],
    });
    expect(r.annualizedSortino?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(num(r.annualizedSortino))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// --- Alignment §62 -----------------------------------------------------------

describe('Date alignment — intersection semantics', () => {
  it('exact same dates align fully', () => {
    const { aligned, portfolioDatesWithoutReference } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-02', '1'), sub('2026-01-03', '2')],
      referenceReturns: [ref('2026-01-02', '0.05'), ref('2026-01-03', '0.05')],
    });
    expect(aligned).toHaveLength(2);
    expect(portfolioDatesWithoutReference).toHaveLength(0);
  });

  it('portfolio date without CDI is reported, never zero-filled', () => {
    const { aligned, portfolioDatesWithoutReference } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-02', '1'), sub('2026-01-03', '2')],
      referenceReturns: [ref('2026-01-02', '0.05')],
    });
    expect(aligned).toHaveLength(1);
    expect(aligned[0]!.date.toString()).toBe('2026-01-02');
    expect(portfolioDatesWithoutReference.map((d) => d.toString())).toEqual(['2026-01-03']);
  });

  it('CDI date without portfolio is reported separately', () => {
    const { aligned, referenceDatesWithoutPortfolio } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-02', '1')],
      referenceReturns: [ref('2026-01-02', '0.05'), ref('2026-01-03', '0.05')],
    });
    expect(aligned).toHaveLength(1);
    expect(referenceDatesWithoutPortfolio.map((d) => d.toString())).toEqual(['2026-01-03']);
  });

  it('weekend portfolio dates without CDI do not enter the sample', () => {
    const { aligned } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-03', '0'), sub('2026-01-05', '2')],
      referenceReturns: [ref('2026-01-05', '0.05')],
    });
    expect(aligned.map((a) => a.date.toString())).toEqual(['2026-01-05']);
  });

  it('partial overlap keeps only the intersection', () => {
    const { aligned } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-02', '1'), sub('2026-01-04', '2')],
      referenceReturns: [ref('2026-01-03', '0.05'), ref('2026-01-04', '0.05')],
    });
    expect(aligned.map((a) => a.date.toString())).toEqual(['2026-01-04']);
  });

  it('zero overlap → empty alignment (caller maps to UNAVAILABLE)', () => {
    const { aligned } = alignRiskFreeObservations({
      portfolioReturns: [sub('2026-01-02', '1')],
      referenceReturns: [ref('2026-01-03', '0.05')],
    });
    expect(aligned).toHaveLength(0);
    expect(calculateSharpeRatio({ observations: aligned }).status).toBe('UNAVAILABLE');
  });
});

// --- Non-market flow §63 / wrong-calendar §64 ---------------------------------

describe('Non-market flow — Saturday stays out of the Sharpe sample', () => {
  it('flow-neutralized Monday only', () => {
    // Fri→Sat TWR 0% (flow boundary, no EXACT) excluded by Layer B upstream;
    // engine receives only the neutralized Monday return here.
    const r = calculateSharpeRatio({
      observations: [obs('2026-01-05', '10', '0.05'), obs('2026-01-06', '1', '0.05')],
    });
    expect(r.observationCount).toBe(2);
  });
});

describe('Wrong-calendar regression — no weekend zero dilution', () => {
  it('+2%/−2% sample differs from diluted 6-point calendar sample', () => {
    const correct = calculateSharpeRatio({
      observations: [obs('2026-01-05', '2', '0.05'), obs('2026-01-12', '-2', '0.05')],
    });
    const diluted = calculateSharpeRatio({
      observations: [
        obs('2026-01-03', '0', '0.05'),
        obs('2026-01-04', '0', '0.05'),
        obs('2026-01-05', '2', '0.05'),
        obs('2026-01-10', '0', '0.05'),
        obs('2026-01-11', '0', '0.05'),
        obs('2026-01-12', '-2', '0.05'),
      ],
    });
    expect(correct.observationCount).toBe(2);
    expect(diluted.observationCount).toBe(6);
    expect(num(correct.annualizedSharpe)).not.toBeCloseTo(num(diluted.annualizedSharpe), 6);
  });
});
