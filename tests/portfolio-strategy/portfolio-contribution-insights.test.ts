import { describe, expect, it } from 'vitest';
import {
  addMonthsIso,
  deriveContributionInsights,
  INSIGHT_DEFAULT_PERIOD,
  INSIGHT_PERIODS,
  MAX_RECENT_PLANS,
  monthKeyOf,
  resolveInsightPeriod,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-I — contribution insights engine (pure, read-only).
 *
 * Facts only: planned vs confirmed, status vs evidence kept apart,
 * no scores, no forecasts, no recommendations.
 */
const PLANS = [
  {
    id: 'p1',
    name: 'Novembro',
    plannedDate: '2026-11-10',
    status: 'PLANNED',
    currency: 'BRL',
    total: '5000',
    items: [
      { category: 'STOCK', amount: '2000' },
      { category: 'FIXED_INCOME', amount: '3000' },
    ],
  },
  {
    id: 'p2',
    name: 'Outubro',
    plannedDate: '2026-10-05',
    status: 'COMPLETED',
    currency: 'BRL',
    total: '4000',
    items: [{ category: 'CASH', amount: '4000' }],
  },
  {
    id: 'p3',
    name: 'Cancelado',
    plannedDate: '2026-09-01',
    status: 'CANCELLED',
    currency: 'BRL',
    total: '1000',
    items: [{ category: 'CASH', amount: '1000' }],
  },
];

const CONFIRMED = [
  {
    planId: 'p1',
    transactionId: 't1',
    tradeDate: '2026-11-12',
    amount: '1800',
    currency: 'BRL',
    category: 'CASH',
  },
  {
    planId: 'p1',
    transactionId: 't2',
    tradeDate: '2026-11-15',
    amount: '2900',
    currency: 'BRL',
    category: 'CASH',
  },
  {
    planId: 'p2',
    transactionId: 't3',
    tradeDate: '2026-10-06',
    amount: '4000',
    currency: 'BRL',
    category: 'CASH',
  },
];

const RANGE = { start: '2026-01-01', end: '2026-12-31' };

describe('Phase 5Q-I: insights aggregation', () => {
  it('separates planned intent from confirmed evidence', () => {
    const insights = deriveContributionInsights({
      plans: PLANS,
      confirmed: CONFIRMED,
      currency: 'BRL',
      range: RANGE,
    });
    // Cancelled plan excluded from planned totals, kept in breakdown.
    expect(insights.plannedTotal).toBe('9000');
    expect(insights.confirmedTotal).toBe('8700');
    expect(insights.difference).toBe('-300');
    expect(insights.completionBp).toBe(9667);
    expect(insights.cancelledPlannedTotal).toBe('1000');
    expect(insights.cancelledCount).toBe(1);
    expect(insights.confirmedTransactionCount).toBe(3);
  });

  it('keeps status and evidence counts apart', () => {
    const insights = deriveContributionInsights({
      plans: PLANS,
      confirmed: CONFIRMED,
      currency: 'BRL',
      range: RANGE,
    });
    expect(insights.plannedPlanCount).toBe(1);
    expect(insights.completedPlanCount).toBe(1);
    expect(insights.cancelledPlanCount).toBe(1);
    expect(insights.plansWithConfirmed).toBe(2);
    expect(insights.plansWithoutConfirmed).toBe(0);
    expect(insights.completedWithoutConfirmedCount).toBe(0);
    expect(insights.plannedWithConfirmedCount).toBe(1);
    expect(insights.statusBreakdown).toEqual([
      { status: 'PLANNED', count: 1, plannedTotal: '5000' },
      { status: 'COMPLETED', count: 1, plannedTotal: '4000' },
      { status: 'CANCELLED', count: 1, plannedTotal: '1000' },
    ]);
  });

  it('flags completed-without-actual and planned-with-actual factually', () => {
    const insights = deriveContributionInsights({
      plans: [
        {
          ...PLANS[0]!,
          id: 'p9',
          name: 'Lonely',
          status: 'COMPLETED',
          plannedDate: '2026-11-10',
          total: '5000',
          items: PLANS[0]!.items,
          currency: 'BRL',
        },
      ],
      confirmed: [],
      currency: 'BRL',
      range: RANGE,
    });
    expect(insights.completedWithoutConfirmedCount).toBe(1);
    expect(insights.plansWithConfirmed).toBe(0);
    expect(insights.completionBp).toBe(0);
    expect(insights.difference).toBe('-5000');
  });

  it('aggregates monthly buckets with civil dates only', () => {
    const insights = deriveContributionInsights({
      plans: PLANS,
      confirmed: CONFIRMED,
      currency: 'BRL',
      range: RANGE,
    });
    const october = insights.timeline.find((row) => row.month === '2026-10')!;
    expect(october).toMatchObject({
      planned: '4000',
      confirmed: '4000',
      difference: '0',
      plannedCount: 1,
      completedCount: 1,
    });
    const november = insights.timeline.find((row) => row.month === '2026-11')!;
    expect(november).toMatchObject({
      planned: '5000',
      confirmed: '4700',
      difference: '-300',
      plannedCount: 1,
      completedCount: 0,
    });
    // Deterministic month ordering, no gaps inside the activity span.
    const months = insights.timeline.map((row) => row.month);
    expect(months).toEqual([...months].sort());
  });

  it('derives category rows with CASH actual semantics', () => {
    const insights = deriveContributionInsights({
      plans: PLANS,
      confirmed: CONFIRMED,
      currency: 'BRL',
      range: RANGE,
    });
    const stock = insights.byCategory.find((row) => row.category === 'STOCK')!;
    // Planned STOCK, no confirmed STOCK: shown as-is, never inferred.
    expect(stock).toMatchObject({ planned: '2000', confirmed: '0', difference: '-2000' });
    const cash = insights.byCategory.find((row) => row.category === 'CASH')!;
    expect(cash).toMatchObject({ planned: '4000', confirmed: '8700', difference: '4700' });
    expect(insights).not.toHaveProperty('score');
    expect(JSON.stringify(insights)).not.toMatch(/score|forecast|streak|discipline/i);
  });

  it('bounds recent plans deterministically', () => {
    const many = Array.from({ length: 15 }, (_, index) => ({
      id: `p-${String(index).padStart(2, '0')}`,
      name: `Plan ${index}`,
      plannedDate: `2026-${String((index % 12) + 1).padStart(2, '0')}-10`,
      status: 'PLANNED',
      currency: 'BRL',
      total: '100',
      items: [{ category: 'CASH', amount: '100' }],
    }));
    const insights = deriveContributionInsights({
      plans: many,
      confirmed: [],
      currency: 'BRL',
      range: RANGE,
    });
    expect(insights.recentPlans).toHaveLength(MAX_RECENT_PLANS);
    expect(insights.recentPlans[0]?.plannedDate).toBe('2026-12-10');
  });
});

describe('Phase 5Q-I: period resolution', () => {
  it('exposes fixed presets with 1A default and rejects the rest', () => {
    expect(INSIGHT_PERIODS).toEqual(['3M', '6M', 'YTD', '1A', 'INCEPTION']);
    expect(INSIGHT_DEFAULT_PERIOD).toBe('1A');
    expect(resolveInsightPeriod('1A', '2026-10-25')).toEqual({
      start: '2025-10-25',
      end: '2026-10-25',
    });
    expect(resolveInsightPeriod('3M', '2026-10-25')).toEqual({
      start: '2026-07-25',
      end: '2026-10-25',
    });
    expect(resolveInsightPeriod('YTD', '2026-10-25')).toEqual({
      start: '2026-01-01',
      end: '2026-10-25',
    });
    expect(resolveInsightPeriod('INCEPTION', '2026-10-25')).toEqual({
      start: null,
      end: '2026-10-25',
    });
    expect(resolveInsightPeriod('CUSTOM', '2026-10-25')).toBeNull();
    expect(resolveInsightPeriod('nope', '2026-10-25')).toBeNull();
  });

  it('shifts months civilly without Date construction', () => {
    expect(addMonthsIso('2026-10-31', -1)).toBe('2026-09-30');
    expect(addMonthsIso('2026-01-15', -3)).toBe('2025-10-15');
    expect(monthKeyOf('2026-11-10')).toBe('2026-11');
  });
});
