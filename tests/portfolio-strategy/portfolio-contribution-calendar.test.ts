import { describe, expect, it } from 'vitest';
import {
  deriveContributionPlanningCalendar,
  MAX_CALENDAR_MONTHS,
  validateCalendarRange,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-K — contribution planning calendar engine (pure composition).
 *
 * No new facts: goal versions (5Q-J) + plans (5Q-F) + CONFIRMED actuals
 * (5Q-G) bucketed by calendar month. Plans by plannedDate, actuals by
 * tradeDate — linkage never moves money. Exact decimals, no forecast,
 * no recommendation, no automation.
 */
const BRL_3000 = { amount: '3000', currency: 'BRL' };

function plan(
  id: string,
  plannedDate: string,
  status = 'PLANNED',
  total = '3000',
  currency = 'BRL',
) {
  return { id, name: `Plano ${id}`, plannedDate, status, currency, total };
}

function actual(
  tradeDate: string,
  amount: string,
  planId = 'p1',
  planName = 'Plano p1',
  currency = 'BRL',
) {
  return { tradeDate, amount, currency, type: 'DEPOSIT', planId, planName };
}

const VERSIONS = [
  { amount: '2000', currency: 'BRL', effectiveFromMonth: '2026-01', effectiveToMonth: '2026-07' },
  { amount: '3000', currency: 'BRL', effectiveFromMonth: '2026-07', effectiveToMonth: null },
];

describe('Phase 5Q-K: calendar range validation', () => {
  it('accepts ordered windows and enumerates every month', () => {
    expect(validateCalendarRange('2026-01', '2026-03')).toEqual({
      valid: true,
      months: ['2026-01', '2026-02', '2026-03'],
    });
  });

  it('rejects invalid, reversed and oversized ranges', () => {
    expect(validateCalendarRange('2026-13', '2026-12').valid).toBe(false);
    expect(validateCalendarRange('2026-12', '2026-11')).toEqual({
      valid: false,
      reason: 'REVERSED_RANGE',
    });
    expect(validateCalendarRange('2020-01', '2022-02').reason).toBe('RANGE_TOO_LARGE');
    expect(MAX_CALENDAR_MONTHS).toBe(24);
  });
});

describe('Phase 5Q-K: month composition', () => {
  it('returns an empty range factually', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10'],
      currentMonth: '2026-10',
      goals: [],
      plans: [],
      actuals: [],
    });
    expect(calendar.months).toHaveLength(1);
    expect(calendar.months[0]).toMatchObject({
      month: '2026-10',
      isCurrentMonth: true,
      goal: null,
      goalChange: false,
      totalsByCurrency: [],
      plannedDifferenceToGoal: null,
      confirmedDifferenceToGoal: null,
      plans: [],
      confirmedActuals: [],
    });
    expect(calendar.currencies).toEqual([]);
    expect(calendar.summaryByCurrency).toEqual([]);
    expect(calendar.limitations).toContain('NO_ACTIVITY');
  });

  it('shows a goal-only month without zero-filling plans or actuals', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10'],
      currentMonth: '2026-10',
      goals: [{ ...BRL_3000, effectiveFromMonth: '2026-10', effectiveToMonth: null }],
      plans: [],
      actuals: [],
    });
    expect(calendar.months[0]?.goal).toEqual(BRL_3000);
    expect(calendar.months[0]?.goalChange).toBe(true);
    expect(calendar.months[0]?.totalsByCurrency).toEqual([]);
    expect(calendar.limitations).not.toContain('NO_ACTIVITY');
  });

  it('shows a plan-only month with a null goal and null differences', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-11'],
      currentMonth: '2026-10',
      goals: [],
      plans: [plan('p1', '2026-11-10')],
      actuals: [],
    });
    const month = calendar.months[0];
    expect(month?.goal).toBeNull();
    expect(month?.plannedDifferenceToGoal).toBeNull();
    expect(month?.confirmedDifferenceToGoal).toBeNull();
    expect(month?.totalsByCurrency).toEqual([
      {
        currency: 'BRL',
        planned: '3000',
        plannedCount: 1,
        completedCount: 0,
        cancelledCount: 0,
        confirmed: '0',
        confirmedCount: 0,
      },
    ]);
    expect(month?.isCurrentMonth).toBe(false);
  });

  it('shows an actual-only month for deposits linked to another month plan', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-11'],
      currentMonth: '2026-11',
      goals: [],
      plans: [],
      actuals: [actual('2026-11-05', '2500', 'p-oct', 'Aporte outubro')],
    });
    const month = calendar.months[0];
    expect(month?.plans).toEqual([]);
    expect(month?.confirmedActuals).toEqual([
      {
        tradeDate: '2026-11-05',
        amount: '2500',
        currency: 'BRL',
        type: 'DEPOSIT',
        linkedPlanId: 'p-oct',
        linkedPlanName: 'Aporte outubro',
      },
    ]);
    expect(month?.totalsByCurrency[0]).toMatchObject({ confirmed: '2500', confirmedCount: 1 });
  });

  it('combines goal, plans and actuals with exact differences', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10'],
      currentMonth: '2026-10',
      goals: [{ ...BRL_3000, effectiveFromMonth: '2026-07', effectiveToMonth: null }],
      plans: [plan('p1', '2026-10-10', 'COMPLETED')],
      actuals: [actual('2026-10-12', '2500')],
    });
    const month = calendar.months[0];
    expect(month?.goalChange).toBe(false);
    expect(month?.plannedDifferenceToGoal).toBe('0');
    expect(month?.confirmedDifferenceToGoal).toBe('-500');
    const summary = calendar.summaryByCurrency;
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      currency: 'BRL',
      goalTotal: '3000',
      plannedTotal: '3000',
      confirmedTotal: '2500',
      plannedDifference: '0',
      confirmedDifference: '-500',
      monthsWithGoal: 1,
      monthsWithoutGoal: 0,
    });
  });

  it('applies the version in force per month and marks changes', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-06', '2026-07', '2026-08'],
      currentMonth: '2026-08',
      goals: VERSIONS,
      plans: [],
      actuals: [],
    });
    expect(calendar.months.map((row) => row.goal?.amount)).toEqual(['2000', '3000', '3000']);
    expect(calendar.months.map((row) => row.goalChange)).toEqual([false, true, false]);
    expect(calendar.summaryByCurrency).toEqual([
      {
        currency: 'BRL',
        goalTotal: '8000',
        plannedTotal: '0',
        confirmedTotal: '0',
        plannedDifference: '-8000',
        confirmedDifference: '-8000',
        monthsWithGoal: 3,
        monthsWithoutGoal: 0,
      },
    ]);
  });

  it('excludes cancelled plans from totals but keeps them listed', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-09'],
      currentMonth: '2026-09',
      goals: [],
      plans: [plan('p1', '2026-09-10', 'CANCELLED'), plan('p2', '2026-09-12')],
      actuals: [],
    });
    const month = calendar.months[0];
    expect(month?.plans.map((row) => row.id)).toEqual(['p1', 'p2']);
    expect(month?.totalsByCurrency[0]).toMatchObject({
      planned: '3000',
      plannedCount: 1,
      cancelledCount: 1,
    });
  });

  it('counts completed plans in the planned total', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-09'],
      currentMonth: '2026-09',
      goals: [],
      plans: [plan('p1', '2026-09-10', 'COMPLETED', '1500')],
      actuals: [],
    });
    expect(calendar.months[0]?.totalsByCurrency[0]).toMatchObject({
      planned: '1500',
      completedCount: 1,
    });
  });

  it('keeps cross-month links in their factual months', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10', '2026-11'],
      currentMonth: '2026-10',
      goals: [],
      plans: [plan('p-oct', '2026-10-10')],
      actuals: [actual('2026-11-05', '2500', 'p-oct', 'Plano p-oct')],
    });
    expect(calendar.months[0]?.confirmedActuals).toEqual([]);
    expect(calendar.months[0]?.plans.map((row) => row.id)).toEqual(['p-oct']);
    expect(calendar.months[1]?.plans).toEqual([]);
    expect(calendar.months[1]?.confirmedActuals).toHaveLength(1);
    expect(calendar.months[1]?.confirmedActuals[0]?.linkedPlanName).toBe('Plano p-oct');
  });

  it('never sums across currencies and nulls cross-currency differences', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10'],
      currentMonth: '2026-10',
      goals: [{ ...BRL_3000, effectiveFromMonth: '2026-10', effectiveToMonth: null }],
      plans: [plan('p1', '2026-10-10', 'PLANNED', '1000', 'USD')],
      actuals: [actual('2026-10-12', '2500')],
    });
    const month = calendar.months[0];
    expect(month?.totalsByCurrency.map((row) => row.currency)).toEqual(['BRL', 'USD']);
    expect(month?.plannedDifferenceToGoal).toBeNull();
    expect(month?.confirmedDifferenceToGoal).toBeNull();
    expect(calendar.currencies).toEqual(['BRL', 'USD']);
    expect(calendar.limitations).toContain('MIXED_CURRENCIES');
    expect(calendar.summaryByCurrency).toEqual([
      expect.objectContaining({ currency: 'BRL', goalTotal: '3000', confirmedTotal: '2500' }),
      expect.objectContaining({ currency: 'USD', plannedTotal: '1000' }),
    ]);
  });

  it('orders months, plans and actuals deterministically', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10', '2026-11'],
      currentMonth: '2026-10',
      goals: [],
      plans: [plan('b', '2026-10-10'), plan('a', '2026-10-05')],
      actuals: [actual('2026-10-12', '100'), actual('2026-10-12', '50')],
    });
    expect(calendar.months.map((row) => row.month)).toEqual(['2026-10', '2026-11']);
    expect(calendar.months[0]?.plans.map((row) => row.id)).toEqual(['a', 'b']);
    expect(calendar.months[0]?.confirmedActuals.map((row) => row.amount)).toEqual(['100', '50']);
  });

  it('contains no score, forecast or automation language', () => {
    const calendar = deriveContributionPlanningCalendar({
      months: ['2026-10'],
      currentMonth: '2026-10',
      goals: [],
      plans: [],
      actuals: [],
    });
    expect(JSON.stringify(calendar)).not.toMatch(/score|streak|forecast|remind|schedul|auto-/i);
  });
});
