import { describe, expect, it } from 'vitest';
import {
  deriveGapHistory,
  deriveIncomeHistory,
  deriveRunsHistory,
  directionOf,
  monthsInRange,
  subtractDecimalStrings,
  REVIEW_HISTORY_LIMITS,
} from '@atlas/portfolio-review';
import { resolveReviewPeriod, subtractCivilDays } from '@atlas/portfolio-review';

/**
 * Phase 5Q-B — history derivation contract (pure).
 *
 * Trends are neutral direction facts. firstSeen is only ever observed
 * inside the analyzed window. No history is invented: gaps become
 * INSUFFICIENT_DATA or explicit UNAVAILABLE, never synthetic points.
 */
describe('Phase 5Q-B: decimal subtraction without floats', () => {
  it('subtracts decimal strings exactly', () => {
    expect(subtractDecimalStrings('5.25', '9.45')).toBe('-4.2');
    expect(subtractDecimalStrings('1.5', '0.5')).toBe('1');
    expect(subtractDecimalStrings('-4.20', '0')).toBe('-4.2');
    expect(subtractDecimalStrings('10', '3')).toBe('7');
    expect(subtractDecimalStrings('0.1', '0.2')).toBe('-0.1');
    expect(subtractDecimalStrings('100.00', '100')).toBe('0');
  });

  it('returns null for unparseable sides', () => {
    expect(subtractDecimalStrings('N/A', '1')).toBeNull();
    expect(subtractDecimalStrings('1', '')).toBeNull();
  });
});

describe('Phase 5Q-B: direction is neutral and gap-aware', () => {
  it('compares first vs last observed only', () => {
    expect(directionOf([1, 2, 3])).toBe('INCREASED');
    expect(directionOf([3, 2, 1])).toBe('DECREASED');
    expect(directionOf([2, 2])).toBe('STABLE');
    expect(directionOf([null, null])).toBe('INSUFFICIENT_DATA');
    expect(directionOf([5])).toBe('INSUFFICIENT_DATA');
    expect(directionOf([])).toBe('INSUFFICIENT_DATA');
  });

  it('derives gap history with threshold states and first-below date', () => {
    const history = deriveGapHistory(
      [
        { date: '2026-01-31', portfolioReturn: '1.0', benchmarkReturn: '0.5' },
        { date: '2026-02-28', portfolioReturn: '-2.0', benchmarkReturn: '0.5' },
        { date: '2026-03-31', portfolioReturn: null, benchmarkReturn: '0.5' },
        { date: '2026-04-30', portfolioReturn: '-5.0', benchmarkReturn: '1.0' },
      ],
      -200,
      'IBOV',
      'BRL',
    );
    expect(history.kind).toBe('SERIES');
    expect(history.points.map((point) => point.state)).toEqual([
      'ABOVE',
      'BELOW',
      'UNKNOWN',
      'BELOW',
    ]);
    expect(history.points[3]!.gap).toBe('-6');
    expect(history.worstGap).toBe('-6');
    expect(history.firstBelowAt).toBe('2026-02-28');
    expect(history.trend).toBe('DECREASED');
  });

  it('never invents points: empty input yields empty history', () => {
    const history = deriveGapHistory([], -200, 'IBOV', 'BRL');
    expect(history.points).toEqual([]);
    expect(history.worstGap).toBeNull();
    expect(history.firstBelowAt).toBeNull();
    expect(history.trend).toBe('INSUFFICIENT_DATA');
  });
});

describe('Phase 5Q-B: income history buckets by month', () => {
  it('buckets income rows into calendar months with totals', () => {
    const history = deriveIncomeHistory(
      [
        { tradeDate: '2026-01-15', amount: '100.00', currency: 'BRL', kind: 'DIVIDEND' },
        { tradeDate: '2026-01-20', amount: '30.00', currency: 'BRL', kind: 'JCP' },
        { tradeDate: '2026-03-10', amount: '50.00', currency: 'BRL', kind: 'FII' },
        { tradeDate: '2026-03-11', amount: '10.00', currency: 'USD', kind: 'DIVIDEND' },
      ],
      monthsInRange('2026-01-01', '2026-03-31', 61),
      'BRL',
    );
    expect(history.months.map((bucket) => bucket.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(history.months[0]).toMatchObject({ total: '130.00', dividends: '100.00', jcp: '30.00' });
    expect(history.months[1]).toMatchObject({ total: '0.00' });
    expect(history.months[2]).toMatchObject({ total: '50.00', fiiIncome: '50.00' });
    expect(history.total).toBe('180.00');
    expect(history.trend).toBe('DECREASED');
  });

  it('lists months even with zero income (no fake rows, explicit zeros)', () => {
    const history = deriveIncomeHistory([], monthsInRange('2026-01-01', '2026-02-28', 61), 'BRL');
    expect(history.months).toHaveLength(2);
    expect(history.total).toBe('0.00');
    expect(history.trend).toBe('STABLE');
  });

  it('bounds month enumeration', () => {
    expect(monthsInRange('2020-01-01', '2026-06-16', 61)).toHaveLength(61);
    expect(monthsInRange('2026-06-16', '2026-06-16', 61)).toEqual(['2026-06']);
    expect(monthsInRange('nope', '2026-06-16', 61)).toEqual([]);
  });
});

describe('Phase 5Q-B: runs history is a bounded factual table', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    runId: 'r1',
    createdAt: '2026-06-16T08:00:00.000Z',
    status: 'AWAITING_REVIEW',
    trigger: 'SCHEDULED',
    newRecords: 4,
    partial: false,
    divergent: 0,
    missingLocal: 0,
    missingSource: 0,
    unresolved: 0,
    ...overrides,
  });

  it('caps rows and reports first divergence within the window only', () => {
    const runs = Array.from({ length: 30 }, (_, index) =>
      row({
        runId: `r${29 - index}`,
        createdAt: `2026-06-${String(30 - index).padStart(2, '0')}T08:00:00.000Z`,
      }),
    );
    runs[0] = row({ runId: 'r29', createdAt: '2026-06-30T08:00:00.000Z', divergent: 2 });
    const history = deriveRunsHistory(runs, 20);
    expect(history.rows).toHaveLength(20);
    expect(history.firstDivergenceAt).toBe('2026-06-30');
    expect(history.trend).toBe('INSUFFICIENT_DATA');
  });

  it('returns no fake first-seen when nothing diverged', () => {
    const history = deriveRunsHistory([row()], 20);
    expect(history.firstDivergenceAt).toBeNull();
  });

  it('caps sampling policy', () => {
    expect(REVIEW_HISTORY_LIMITS.maxRuns).toBe(20);
    expect(REVIEW_HISTORY_LIMITS.maxMonths).toBe(61);
    expect(REVIEW_HISTORY_LIMITS.maxPoints).toBe(120);
  });
});

describe('Phase 5Q-B: review periods resolve deterministically', () => {
  it('maps presets to explicit civil ranges', () => {
    expect(resolveReviewPeriod('1M', '2026-06-16')).toEqual({
      preset: '1M',
      startDate: '2026-05-17',
      endDate: '2026-06-16',
    });
    expect(resolveReviewPeriod('1A', '2026-06-16')).toEqual({
      preset: '1A',
      startDate: '2025-06-16',
      endDate: '2026-06-16',
    });
    expect(resolveReviewPeriod('YTD', '2026-06-16')).toEqual({
      preset: 'YTD',
      startDate: '2026-01-01',
      endDate: '2026-06-16',
    });
    expect(resolveReviewPeriod('INCEPTION', '2026-06-16')).toEqual({
      preset: 'INCEPTION',
      startDate: '2021-06-17',
      endDate: '2026-06-16',
    });
  });

  it('handles month/year boundaries and leap days without Date objects', () => {
    expect(subtractCivilDays('2026-03-01', 1)).toBe('2026-02-28');
    expect(subtractCivilDays('2024-03-01', 1)).toBe('2024-02-29');
    expect(subtractCivilDays('2026-01-01', 1)).toBe('2025-12-31');
    expect(subtractCivilDays('2026-06-16', 0)).toBe('2026-06-16');
    expect(subtractCivilDays('nope', 5)).toBeNull();
    expect(subtractCivilDays('2026-13-01', 5)).toBeNull();
  });

  it('rejects unknown presets fail-closed', async () => {
    const { InvalidReviewPeriodError } = await import('@atlas/portfolio-review');
    expect(() => resolveReviewPeriod('CUSTOM', '2026-06-16')).toThrow(InvalidReviewPeriodError);
    expect(() => resolveReviewPeriod('', '2026-06-16')).toThrow(InvalidReviewPeriodError);
  });
});
