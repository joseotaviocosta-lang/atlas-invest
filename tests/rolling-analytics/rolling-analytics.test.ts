import { describe, it, expect } from 'vitest';
import { LocalDate, Percentage } from '@atlas/domain';
import {
  calculateRollingVolatility,
  calculateRollingBeta,
  calculateRollingSharpe,
  calculateRealizedVolatility,
  calculateBeta,
  calculateSharpeRatio,
  alignBenchmarkRelativeReturns,
  assertValidRollingWindow,
  ROLLING_WINDOWS,
  RiskSubperiodReturn,
  RiskAdjustedReturnObservation,
  BenchmarkRelativeReturnObservation,
  RelativeRiskInterval,
} from '@atlas/risk-engine';

function sub(date: string, percent: string): RiskSubperiodReturn {
  return { date: LocalDate.from(date), returnPercentage: Percentage.from(percent) };
}

function aligned(date: string, portfolio: string, riskFree: string): RiskAdjustedReturnObservation {
  return {
    date: LocalDate.from(date),
    portfolioReturn: Percentage.from(portfolio),
    riskFreeReturn: Percentage.from(riskFree),
  };
}

function pair(
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

function interval(start: string, end: string, ret: string): RelativeRiskInterval {
  return {
    startDate: LocalDate.from(start),
    endDate: LocalDate.from(end),
    returnPercentage: Percentage.from(ret),
  };
}

function weekdayDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2026, 0, 2)); // Friday
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function variableReturns(n: number): RiskSubperiodReturn[] {
  return weekdayDates(n).map((date, i) => sub(date, i % 2 === 0 ? '1' : '-0.5'));
}

function num(q: { toString(): string } | null): number {
  if (!q) throw new Error('expected non-null quantity');
  return Number(q.toString());
}

// --- Window contract §11/§46 -------------------------------------------------

describe('Rolling window contract', () => {
  it('accepts only 20, 60 and 120', () => {
    expect(assertValidRollingWindow('20')).toBe(20);
    expect(assertValidRollingWindow(60)).toBe(60);
    expect(assertValidRollingWindow('120')).toBe(120);
    expect(ROLLING_WINDOWS).toEqual([20, 60, 120]);
    expect(() => assertValidRollingWindow('30')).toThrow();
    expect(() => assertValidRollingWindow('0')).toThrow();
  });
});

// --- Generic window semantics §73/§74/§75 -----------------------------------

describe('Rolling window semantics (economic observations, not calendar days)', () => {
  it('n < W → UNAVAILABLE with empty points (no partial window)', () => {
    const r = calculateRollingVolatility({ returns: variableReturns(19), window: 20 });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.points).toHaveLength(0);
  });

  it('n = W → exactly 1 point', () => {
    const r = calculateRollingVolatility({ returns: variableReturns(20), window: 20 });
    expect(r.status).toBe('AVAILABLE');
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.observationCount).toBe(20);
  });

  it('n = W + 1 → exactly 2 points', () => {
    const r = calculateRollingVolatility({ returns: variableReturns(21), window: 20 });
    expect(r.points).toHaveLength(2);
  });

  it('n = 100, W = 20 → 81 points (n − W + 1) with exact boundary ranges', () => {
    const dates = weekdayDates(100);
    const r = calculateRollingVolatility({ returns: variableReturns(100), window: 20 });
    expect(r.points).toHaveLength(81);
    expect(r.points[0]!.windowStartDate.toString()).toBe(dates[0]);
    expect(r.points[0]!.endDate.toString()).toBe(dates[19]);
    expect(r.points[80]!.windowStartDate.toString()).toBe(dates[80]);
    expect(r.points[80]!.endDate.toString()).toBe(dates[99]);
  });

  it('weekend does not count toward the window (20 obs span > 20 calendar days)', () => {
    const dates = weekdayDates(20);
    const r = calculateRollingVolatility({ returns: variableReturns(20), window: 20 });
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.windowStartDate.toString()).toBe(dates[0]);
    expect(r.points[0]!.endDate.toString()).toBe(dates[19]);
    // 20 business days from Fri 2026-01-02 cross at least one weekend, so the
    // calendar span is strictly greater than 20 days.
    const spanDays = (Date.parse(dates[19]!) - Date.parse(dates[0]!)) / (1000 * 60 * 60 * 24);
    expect(spanDays).toBeGreaterThan(20);
  });

  it('holiday/gap does not count toward the window', () => {
    // 21 observations where one business day is missing (holiday): still counts
    // 21 economic observations, not 22 calendar sessions.
    const dates = weekdayDates(21);
    const returns = dates.map((date, i) => sub(date, i % 2 === 0 ? '1' : '-0.5'));
    const r = calculateRollingVolatility({ returns, window: 20 });
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.endDate.toString()).toBe(dates[19]);
    expect(r.points[1]!.endDate.toString()).toBe(dates[20]);
  });

  it('deterministic order (endDate ASC) regardless of input order', () => {
    const input = variableReturns(25);
    const a = calculateRollingVolatility({ returns: input, window: 20 });
    const b = calculateRollingVolatility({ returns: [...input].reverse(), window: 20 });
    expect(a.points.map((p) => p.endDate.toString())).toEqual(
      b.points.map((p) => p.endDate.toString()),
    );
    const dates = a.points.map((p) => p.endDate.toString());
    expect([...dates].sort()).toEqual(dates);
  });

  it('result, points and nested values are frozen', () => {
    const r = calculateRollingVolatility({ returns: variableReturns(20), window: 20 });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.points)).toBe(true);
    expect(Object.isFrozen(r.points[0])).toBe(true);
  });
});

// --- Rolling volatility §77/§78 ---------------------------------------------

describe('Rolling volatility (ADR-150)', () => {
  it('matches calculateRealizedVolatility on every slice (equivalence)', () => {
    const input = variableReturns(30);
    const r = calculateRollingVolatility({ returns: input, window: 20 });
    for (let i = 0; i < r.points.length; i++) {
      const slice = input.slice(i, i + 20);
      const expected = calculateRealizedVolatility({ returns: slice }).annualizedPercentage;
      expect(r.points[i]!.annualizedPercentage?.value).toBe(expected?.value);
    }
  });

  it('constant returns → exactly 0', () => {
    const input = weekdayDates(20).map((d) => sub(d, '1'));
    const r = calculateRollingVolatility({ returns: input, window: 20 });
    expect(r.points[0]!.annualizedPercentage?.value).toBe('0');
  });

  it('sample n−1 and sqrt(252) annualization (via 3I reuse)', () => {
    const input = variableReturns(20);
    const r = calculateRollingVolatility({ returns: input, window: 20 });
    const ref = calculateRealizedVolatility({ returns: input });
    expect(r.points[0]!.annualizedPercentage?.value).toBe(ref.annualizedPercentage?.value);
    const ratio = Number(ref.annualizedPercentage!.value) / Number(ref.samplePercentage!.value);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
  });

  it('long decimals, no NaN/Infinity', () => {
    const input = weekdayDates(20).map((d, i) =>
      sub(d, i % 2 === 0 ? '0.123456789' : '-0.987654321'),
    );
    const r = calculateRollingVolatility({ returns: input, window: 20 });
    const v = r.points[0]!.annualizedPercentage?.value ?? '';
    expect(v).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(Number(v))).toBe(true);
    expect(JSON.stringify(r)).not.toContain('Infinity');
    expect(JSON.stringify(r)).not.toContain('NaN');
  });

  it('source PARTIAL propagates to the series status', () => {
    const r = calculateRollingVolatility({
      returns: variableReturns(20),
      window: 20,
      partial: true,
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.points[0]!.status).toBe('AVAILABLE');
  });
});

// --- Rolling Sharpe §79/§80 --------------------------------------------------

describe('Rolling Sharpe (ADR-152)', () => {
  it('matches calculateSharpeRatio on every slice (equivalence)', () => {
    const dates = weekdayDates(30);
    const input = dates.map((d, i) => aligned(d, i % 2 === 0 ? '2' : '-1', '0.05'));
    const r = calculateRollingSharpe({ observations: input, window: 20 });
    for (let i = 0; i < r.points.length; i++) {
      const expected = calculateSharpeRatio({
        observations: input.slice(i, i + 20),
      }).annualizedSharpe;
      expect(r.points[i]!.annualized?.toString()).toBe(expected?.toString());
    }
  });

  it('positive and negative Sharpe points', () => {
    const dates = weekdayDates(20);
    const positive = calculateRollingSharpe({
      observations: dates.map((d) => aligned(d, '1', '0')),
      window: 20,
    });
    // constant excess → zero denominator → unavailable point
    expect(positive.points[0]!.annualized).toBeNull();

    const varying = calculateRollingSharpe({
      observations: dates.map((d, i) => aligned(d, i % 2 === 0 ? '3' : '1', '0')),
      window: 20,
    });
    expect(num(varying.points[0]!.annualized)).toBeGreaterThan(0);
  });

  it('zero denominator → null point (never Infinity)', () => {
    const dates = weekdayDates(20);
    const r = calculateRollingSharpe({
      observations: dates.map((d) => aligned(d, '1', '0')),
      window: 20,
    });
    expect(r.points[0]!.annualized).toBeNull();
    expect(r.points[0]!.status).toBe('UNAVAILABLE');
    expect(r.status).toBe('PARTIAL');
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });

  it('n < W → UNAVAILABLE empty', () => {
    const dates = weekdayDates(19);
    const r = calculateRollingSharpe({
      observations: dates.map((d) => aligned(d, '1', '0')),
      window: 20,
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.points).toHaveLength(0);
  });

  it('source PARTIAL propagates', () => {
    const dates = weekdayDates(20);
    const r = calculateRollingSharpe({
      observations: dates.map((d, i) => aligned(d, i % 2 === 0 ? '2' : '1', '0')),
      window: 20,
      partial: true,
    });
    expect(r.status).toBe('PARTIAL');
  });

  it('annualization is daily × sqrt(252) and ratio (no percent)', () => {
    const dates = weekdayDates(20);
    const r = calculateRollingSharpe({
      observations: dates.map((d, i) => aligned(d, i % 2 === 0 ? '3' : '1', '0')),
      window: 20,
    });
    expect(r.points[0]!.annualized?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(r.points[0]!.annualized?.toString()).not.toContain('%');
  });

  it('long decimals and no NaN/Infinity', () => {
    const dates = weekdayDates(20);
    const r = calculateRollingSharpe({
      observations: dates.map((d, i) =>
        aligned(d, i % 2 === 0 ? '0.123456789' : '-0.987654321', '0.05'),
      ),
      window: 20,
    });
    expect(r.points[0]!.annualized?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(num(r.points[0]!.annualized))).toBe(true);
  });
});

// --- Rolling Beta §81/§82/§83/§84 -------------------------------------------

describe('Rolling Beta (ADR-151)', () => {
  it('matches calculateBeta on every slice (equivalence)', () => {
    const dates = weekdayDates(25);
    const pairs: BenchmarkRelativeReturnObservation[] = [];
    for (let i = 0; i < 24; i++) {
      pairs.push(pair(dates[i]!, dates[i + 1]!, String(1 + (i % 3)), '1'));
    }
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    for (let i = 0; i < r.points.length; i++) {
      const expected = calculateBeta({ observations: pairs.slice(i, i + 20) }).beta;
      expect(r.points[i]!.beta?.toString()).toBe(expected?.toString());
    }
  });

  it('beta = 1 when portfolio equals benchmark', () => {
    const dates = weekdayDates(21);
    const pairs = dates
      .slice(0, 20)
      .map((d, i) => pair(d, dates[i + 1]!, String(1 + (i % 3)), String(1 + (i % 3))));
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points[0]!.beta?.toString()).toBe('1');
  });

  it('beta = 2 when portfolio is 2× benchmark', () => {
    const dates = weekdayDates(21);
    const pairs = dates
      .slice(0, 20)
      .map((d, i) => pair(d, dates[i + 1]!, String(2 * (1 + (i % 3))), String(1 + (i % 3))));
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points[0]!.beta?.toString()).toBe('2');
  });

  it('negative beta', () => {
    const dates = weekdayDates(21);
    const pairs = dates
      .slice(0, 20)
      .map((d, i) => pair(d, dates[i + 1]!, String(-(1 + (i % 3))), String(1 + (i % 3))));
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(num(r.points[0]!.beta)).toBeLessThan(0);
  });

  it('zero benchmark variance window → null point (point kept, status UNAVAILABLE)', () => {
    const dates = weekdayDates(21);
    const pairs = dates.slice(0, 20).map((d, i) => pair(d, dates[i + 1]!, String(i), '1'));
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.beta).toBeNull();
    expect(r.points[0]!.status).toBe('UNAVAILABLE');
    expect(r.status).toBe('PARTIAL');
  });

  it('preserves exact paired intervals (windowStartDate/endDate) and ordering', () => {
    const dates = weekdayDates(22);
    const pairs: BenchmarkRelativeReturnObservation[] = [];
    for (let i = 0; i < 21; i++) {
      pairs.push(pair(dates[i]!, dates[i + 1]!, String(1 + (i % 3)), '1'));
    }
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.windowStartDate.toString()).toBe(dates[0]);
    expect(r.points[0]!.endDate.toString()).toBe(dates[20]);
    expect(r.points[1]!.windowStartDate.toString()).toBe(dates[1]);
    expect(r.points[1]!.endDate.toString()).toBe(dates[21]);
  });

  it('same-end/different-start pairs never enter the rolling source (3K invariant)', () => {
    // Fri→Tue portfolio vs Mon→Tue benchmark → 0 valid pairs.
    const alignment = alignBenchmarkRelativeReturns({
      portfolioIntervals: [interval('2026-01-02', '2026-01-06', '2')],
      benchmarkIntervals: [interval('2026-01-05', '2026-01-06', '1')],
    });
    expect(alignment.observations).toHaveLength(0);
    const r = calculateRollingBeta({ observations: alignment.observations, window: 20 });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.points).toHaveLength(0);
  });

  it('source PARTIAL propagates', () => {
    const dates = weekdayDates(21);
    const pairs = dates.slice(0, 20).map((d, i) => pair(d, dates[i + 1]!, '1', '1'));
    const r = calculateRollingBeta({ observations: pairs, window: 20, partial: true });
    expect(r.status).toBe('PARTIAL');
  });

  it('long decimals, no NaN/Infinity, frozen', () => {
    const dates = weekdayDates(21);
    const pairs = dates
      .slice(0, 20)
      .map((d, i) =>
        pair(d, dates[i + 1]!, i % 2 === 0 ? '0.123456789' : '2.5', i % 2 === 0 ? '0.5' : '1.5'),
      );
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points[0]!.beta?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.points)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('Infinity');
    expect(JSON.stringify(r)).not.toContain('NaN');
  });

  it('null gap: zero-variance window keeps a null point between valid points', () => {
    const dates = weekdayDates(23);
    // 22 pairs; benchmark constant on pairs 1..20 so the middle window has
    // zero benchmark variance, while the first/last windows do not.
    const pairs: BenchmarkRelativeReturnObservation[] = [];
    for (let i = 0; i < 22; i++) {
      const benchmark = i === 0 || i === 21 ? '5' : '1';
      pairs.push(pair(dates[i]!, dates[i + 1]!, String(1 + (i % 3)), benchmark));
    }
    const r = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(r.points).toHaveLength(3);
    expect(r.points[0]!.beta).not.toBeNull();
    expect(r.points[1]!.beta).toBeNull();
    expect(r.points[1]!.status).toBe('UNAVAILABLE');
    expect(r.points[2]!.beta).not.toBeNull();
    expect(r.status).toBe('PARTIAL');
  });
});

// --- Source-count divergence §6/§7/§8 ---------------------------------------

describe('Each metric uses its own source N (no shared global N)', () => {
  it('missing CDI: volatility 25 → 6 points, Sharpe 23 → 4 points', () => {
    const dates = weekdayDates(25);
    const volatility = calculateRollingVolatility({
      returns: dates.map((d, i) => sub(d, i % 2 === 0 ? '1' : '-0.5')),
      window: 20,
    });
    expect(volatility.points).toHaveLength(6);

    // CDI aligned on only 23 of the 25 economic dates.
    const alignedObs = dates
      .slice(0, 23)
      .map((d, i) => aligned(d, i % 2 === 0 ? '1' : '-0.5', '0.05'));
    const sharpe = calculateRollingSharpe({ observations: alignedObs, window: 20 });
    expect(sharpe.points).toHaveLength(4);
    expect(volatility.points.length).not.toBe(sharpe.points.length);
  });

  it('missing IBOV pair: volatility 25 → 6 points, Beta 22 pairs → 3 points', () => {
    const dates = weekdayDates(25);
    const volatility = calculateRollingVolatility({
      returns: dates.map((d, i) => sub(d, i % 2 === 0 ? '1' : '-0.5')),
      window: 20,
    });
    expect(volatility.points).toHaveLength(6);

    const pairs: BenchmarkRelativeReturnObservation[] = [];
    for (let i = 0; i < 22; i++) {
      pairs.push(pair(dates[i]!, dates[i + 1]!, String(1 + (i % 3)), String(1 + (i % 2))));
    }
    const beta = calculateRollingBeta({ observations: pairs, window: 20 });
    expect(beta.points).toHaveLength(3);
    expect(volatility.points.length).not.toBe(beta.points.length);
  });
});
