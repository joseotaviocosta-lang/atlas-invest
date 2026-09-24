import { describe, it, expect } from 'vitest';
import { LocalDate, Percentage, Quantity } from '@atlas/domain';
import {
  calculateJensenAlpha,
  calculateInformationRatio,
  calculateTreynorRatio,
  calculateActivePerformance,
  calculateTrackingError,
  BenchmarkRelativeReturnObservation,
} from '@atlas/risk-engine';

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

function pair(i: number, portfolio: string, benchmark: string): BenchmarkRelativeReturnObservation {
  const day = String(i).padStart(2, '0');
  const next = String(i + 1).padStart(2, '0');
  return obs(`2026-01-${day}`, `2026-01-${next}`, portfolio, benchmark);
}

function num(q: { toString(): string } | null): number {
  if (!q) throw new Error('expected non-null quantity');
  return Number(q.toString());
}

// --- Jensen Alpha §20–§22/§74 ------------------------------------------------

describe("Jensen's Alpha (ADR-144)", () => {
  it('basic: Rp 15, Rf 5, Rm 10, beta 1 → +5%', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.periodPercentage?.value).toBe('5');
  });

  it('zero alpha when the portfolio matches the CAPM expected return', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('10'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
    });
    expect(r.periodPercentage?.value).toBe('0');
  });

  it('negative alpha', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('3'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
    });
    expect(r.periodPercentage?.value).toBe('-7');
  });

  it('beta 0 → alpha is Rp − Rf', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('8'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('0'),
    });
    expect(r.periodPercentage?.value).toBe('3');
  });

  it('negative beta is supported mathematically', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('2'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('-1'),
    });
    // expected = 5 + (−1)(10−5) = 0 → alpha = 2
    expect(r.periodPercentage?.value).toBe('2');
  });

  it('missing beta → null (never a fabricated expected return)', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: null,
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.periodPercentage).toBeNull();
  });

  it('missing risk-free (CDI) → null', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: null,
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.periodPercentage).toBeNull();
  });

  it('missing market (IBOV) → null', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: null,
      beta: Quantity.from('1'),
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.periodPercentage).toBeNull();
  });

  it('partial dependency propagates PARTIAL', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
      partial: true,
    });
    expect(r.status).toBe('PARTIAL');
  });

  it('exact decimal, frozen, no NaN/Infinity', () => {
    const r = calculateJensenAlpha({
      portfolioReturn: Percentage.from('15.123456789'),
      riskFreeReturn: Percentage.from('5.000000001'),
      marketReturn: Percentage.from('10.999999999'),
      beta: Quantity.from('1.23456789'),
    });
    expect(r.periodPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(Number(r.periodPercentage?.value))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// --- Information Ratio §30–§32/§76 ------------------------------------------

describe('Information Ratio (ADR-145)', () => {
  it('positive IR: active +2/+1/+3 → mean 2, TE 1, daily 2', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '2', '0'), pair(3, '3', '2'), pair(4, '4', '1')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.meanDailyActivePercentage?.value).toBe('2');
    expect(r.daily?.toString()).toBe('2');
  });

  it('negative IR', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '0', '2'), pair(3, '2', '3'), pair(4, '1', '4')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(num(r.daily)).toBeLessThan(0);
    expect(r.daily?.toString()).toBe('-2');
  });

  it('zero mean active → IR exactly 0 (known, not missing)', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '1', '0'), pair(3, '0', '1'), pair(4, '1', '0'), pair(5, '0', '1')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.meanDailyActivePercentage?.value).toBe('0');
    expect(r.daily?.toString()).toBe('0');
  });

  it('zero tracking error → null (identical returns, never 0/0)', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '1', '1'), pair(3, '2', '2'), pair(4, '3', '3')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.daily).toBeNull();
    expect(r.annualized).toBeNull();
  });

  it('constant active return → zero tracking error → null (never Infinity)', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '1', '0'), pair(3, '2', '1'), pair(4, '3', '2')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.daily).toBeNull();
  });

  it('insufficient observations → null', () => {
    expect(calculateInformationRatio({ observations: [] }).daily).toBeNull();
    expect(calculateInformationRatio({ observations: [pair(2, '1', '0')] }).daily).toBeNull();
  });

  it('reuses the exact 3K n−1 tracking error as denominator', () => {
    const observations = [pair(2, '2', '0'), pair(3, '3', '2'), pair(4, '4', '1')];
    const ir = calculateInformationRatio({ observations });
    const te = calculateTrackingError({ observations });
    const expectedDaily =
      Number(ir.meanDailyActivePercentage?.value) / Number(te.samplePercentage?.value);
    expect(num(ir.daily)).toBeCloseTo(expectedDaily, 12);
  });

  it('annualization is daily × sqrt(252)', () => {
    const r = calculateInformationRatio({
      observations: [pair(2, '2', '0'), pair(3, '3', '2'), pair(4, '4', '1')],
    });
    const ratio = num(r.annualized) / num(r.daily);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
    expect(r.annualizationFactor).toBe('252');
  });

  it('exact decimal, deterministic, frozen, no NaN/Infinity', () => {
    const input = [
      pair(2, '0.123456789', '0.050000001'),
      pair(3, '-0.987654321', '0.049999999'),
      pair(4, '2.5', '0.05'),
    ];
    const a = calculateInformationRatio({ observations: input });
    const b = calculateInformationRatio({ observations: [...input].reverse() });
    expect(a.annualized?.toString()).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(num(a.annualized))).toBe(true);
    expect(a.annualized?.toString()).toBe(b.annualized?.toString());
    expect(Object.isFrozen(a)).toBe(true);
  });
});

// --- Treynor Ratio §38/§78 ---------------------------------------------------

describe('Treynor Ratio (ADR-146)', () => {
  it('positive: Rp 15, Rf 5, beta 2 → 5%', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('2'),
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.periodPercentagePerBeta?.value).toBe('5');
  });

  it('negative excess return', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('3'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('2'),
    });
    expect(r.periodPercentagePerBeta?.value).toBe('-1');
  });

  it('beta 1 → excess return', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('1'),
    });
    expect(r.periodPercentagePerBeta?.value).toBe('10');
  });

  it('beta 2 divides the excess return', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('2'),
    });
    expect(r.periodPercentagePerBeta?.value).toBe('5');
  });

  it('beta 0 → null (never Infinity)', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('0'),
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.periodPercentagePerBeta).toBeNull();
  });

  it('negative beta flips the sign', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('-2'),
    });
    expect(r.periodPercentagePerBeta?.value).toBe('-5');
  });

  it('zero excess return → exactly 0', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('5'),
      riskFreeReturn: Percentage.from('5'),
      beta: Quantity.from('2'),
    });
    expect(r.periodPercentagePerBeta?.value).toBe('0');
  });

  it('missing risk-free (CDI) → null', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: null,
      beta: Quantity.from('2'),
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.periodPercentagePerBeta).toBeNull();
  });

  it('exact decimal, frozen, no NaN/Infinity', () => {
    const r = calculateTreynorRatio({
      portfolioReturn: Percentage.from('15.123456789'),
      riskFreeReturn: Percentage.from('5.000000001'),
      beta: Quantity.from('1.23456789'),
    });
    expect(r.periodPercentagePerBeta?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(Number(r.periodPercentagePerBeta?.value))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// --- Combined / metric-specific availability §81 -----------------------------

describe('Active performance — combined and metric-specific availability', () => {
  const observations = [pair(2, '2', '0'), pair(3, '3', '2'), pair(4, '4', '1')];

  it('all dependencies present → AVAILABLE', () => {
    const r = calculateActivePerformance({
      currency: 'BRL' as never,
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: Quantity.from('1'),
      observations,
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.alpha.periodPercentage?.value).toBe('5');
    expect(r.informationRatio.daily?.toString()).toBe('2');
    expect(r.treynor.periodPercentagePerBeta?.value).toBe('10');
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('missing beta → alpha/treynor null but IR available → PARTIAL', () => {
    const r = calculateActivePerformance({
      currency: 'BRL' as never,
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: null,
      observations,
    });
    expect(r.alpha.periodPercentage).toBeNull();
    expect(r.treynor.periodPercentagePerBeta).toBeNull();
    expect(r.informationRatio.daily).not.toBeNull();
    expect(r.status).toBe('PARTIAL');
  });

  it('all dependencies missing → UNAVAILABLE', () => {
    const r = calculateActivePerformance({
      currency: 'BRL' as never,
      portfolioReturn: Percentage.from('15'),
      riskFreeReturn: Percentage.from('5'),
      marketReturn: Percentage.from('10'),
      beta: null,
      observations: [],
    });
    expect(r.status).toBe('UNAVAILABLE');
  });
});
