import { DomainError } from '@atlas/domain';
import { addDecimals } from './scenario';
import { ratioToHundredthsOfPercent } from './contribution-tracking';
import { STRATEGY_CATEGORIES } from './types';

export class InvalidContributionInsightsError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_INSIGHTS');
    this.name = 'InvalidContributionInsightsError';
  }
}

/**
 * Phase 5Q-I — insight period presets (read-only analytics).
 * Mirrors the portfolio preset vocabulary (3M/6M/YTD/1A/INCEPTION);
 * no CUSTOM in v1. Default 1A, consistent with the review surfaces.
 */
export const INSIGHT_PERIODS = ['3M', '6M', 'YTD', '1A', 'INCEPTION'] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

export const INSIGHT_DEFAULT_PERIOD: InsightPeriod = '1A';

/** Hard bounds so timeline buckets stay small no matter the history. */
export const MAX_TIMELINE_MONTHS = 120;
export const MAX_RECENT_PLANS = 10;

function isLeapYearCivil(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonthCivil(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYearCivil(year) ? 29 : 28;
    default:
      return 0;
  }
}

/** Civil month shift on `YYYY-MM-DD` (clamps day, no `Date`, no timezone). */
export function addMonthsIso(date: string, months: number): string {
  const [yearRaw = '0', monthRaw = '1', dayRaw = '1'] = date.split('-');
  let year = Number(yearRaw);
  let month = Number(monthRaw);
  const day = Number(dayRaw);
  const total = year * 12 + (month - 1) + months;
  year = Math.floor(total / 12);
  month = (total % 12) + 1;
  const clampedDay = Math.min(day, daysInMonthCivil(year, month));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(clampedDay)}`;
}

export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function nextMonthKey(monthKey: string): string {
  const [yearRaw = '0', monthRaw = '1'] = monthKey.split('-');
  let year = Number(yearRaw);
  let month = Number(monthRaw) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Resolves a preset to an inclusive civil date range. INCEPTION yields
 * an open start (bounded downstream by actual activity, never by
 * loading "everything"). Invalid preset or today → null (caller 400s).
 */
export function resolveInsightPeriod(
  preset: string,
  today: string,
): { start: string | null; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (preset === 'INCEPTION') return { start: null, end: today };
  let start: string;
  if (preset === 'YTD') {
    start = `${today.slice(0, 4)}-01-01`;
  } else if (preset === '3M' || preset === '6M' || preset === '1A') {
    const months = preset === '3M' ? 3 : preset === '6M' ? 6 : 12;
    start = addMonthsIso(today, -months);
  } else {
    return null;
  }
  if (start > today) return null;
  return { start, end: today };
}

export interface InsightPlanInput {
  id: string;
  name: string;
  plannedDate: string;
  status: string;
  currency: string;
  total: string;
  items: ReadonlyArray<{ category: string; amount: string }>;
}

export interface InsightConfirmedInput {
  planId: string;
  transactionId: string;
  tradeDate: string;
  amount: string;
  currency: string;
  category: string;
}

export interface InsightsTimelineMonth {
  month: string;
  planned: string;
  confirmed: string;
  difference: string;
  plannedCount: number;
  completedCount: number;
}

export interface InsightsCategoryRow {
  category: string;
  planned: string;
  confirmed: string;
  difference: string;
}

export interface InsightsRecentPlan {
  id: string;
  name: string;
  plannedDate: string;
  status: string;
  plannedTotal: string;
  confirmedTotal: string;
  difference: string;
  confirmedCount: number;
}

export interface ContributionInsights {
  currency: string;
  plannedTotal: string;
  confirmedTotal: string;
  difference: string;
  completionBp: number | null;
  plannedPlanCount: number;
  completedPlanCount: number;
  cancelledPlanCount: number;
  plansWithConfirmed: number;
  plansWithoutConfirmed: number;
  completedWithoutConfirmedCount: number;
  plannedWithConfirmedCount: number;
  confirmedTransactionCount: number;
  timeline: InsightsTimelineMonth[];
  statusBreakdown: Array<{ status: string; count: number; plannedTotal: string }>;
  byCategory: InsightsCategoryRow[];
  recentPlans: InsightsRecentPlan[];
  cancelledPlannedTotal: string;
  cancelledCount: number;
}

/**
 * Derives read-only contribution insights from plans + CONFIRMED links.
 * PLANNED and COMPLETED plans feed the planning timeline; CANCELLED
 * plans are excluded from planned totals (kept in status breakdown and
 * a separate cancelled amount). Facts only: derived totals with neutral
 * copy and no judgment language.
 */
export function deriveContributionInsights(input: {
  plans: ReadonlyArray<InsightPlanInput>;
  confirmed: ReadonlyArray<InsightConfirmedInput>;
  currency: string;
  range: { start: string | null; end: string };
}): ContributionInsights {
  const inScope = input.plans.filter(
    (plan) =>
      (input.range.start === null || plan.plannedDate >= input.range.start) &&
      plan.plannedDate <= input.range.end,
  );
  const active = inScope.filter((plan) => plan.status === 'PLANNED' || plan.status === 'COMPLETED');
  const cancelled = inScope.filter((plan) => plan.status === 'CANCELLED');

  const confirmedByPlan = new Map<string, InsightConfirmedInput[]>();
  for (const row of input.confirmed) {
    const list = confirmedByPlan.get(row.planId) ?? [];
    list.push(row);
    confirmedByPlan.set(row.planId, list);
  }

  let plannedTotal = '0';
  for (const plan of active) {
    plannedTotal = addDecimals(plannedTotal, plan.total);
  }
  let confirmedTotal = '0';
  for (const row of input.confirmed) {
    confirmedTotal = addDecimals(confirmedTotal, row.amount);
  }

  const plannedByCategory = new Map<string, string>();
  for (const plan of active) {
    for (const item of plan.items) {
      plannedByCategory.set(
        item.category,
        addDecimals(plannedByCategory.get(item.category) ?? '0', item.amount),
      );
    }
  }
  const actualByCategory = new Map<string, string>();
  for (const row of input.confirmed) {
    actualByCategory.set(
      row.category,
      addDecimals(actualByCategory.get(row.category) ?? '0', row.amount),
    );
  }
  const categories = Array.from(
    new Set([...plannedByCategory.keys(), ...actualByCategory.keys()]),
  ).sort(
    (left, right) =>
      STRATEGY_CATEGORIES.indexOf(left as (typeof STRATEGY_CATEGORIES)[number]) -
      STRATEGY_CATEGORIES.indexOf(right as (typeof STRATEGY_CATEGORIES)[number]),
  );

  // Monthly buckets: every civil month from the earliest activity (or
  // the range start) through the range end. Bounded by actual data.
  const activityMonths = new Set<string>();
  for (const plan of active) activityMonths.add(monthKeyOf(plan.plannedDate));
  for (const row of input.confirmed) {
    if (row.tradeDate >= (input.range.start ?? '0000-00') && row.tradeDate <= input.range.end) {
      activityMonths.add(monthKeyOf(row.tradeDate));
    }
  }
  let firstMonth = input.range.start === null ? null : monthKeyOf(input.range.start);
  if (activityMonths.size > 0) {
    const earliest = [...activityMonths].sort()[0]!;
    if (firstMonth === null || earliest < firstMonth) firstMonth = earliest;
  }
  const lastMonth = monthKeyOf(input.range.end);
  const months: string[] = [];
  if (firstMonth !== null && firstMonth <= lastMonth) {
    let cursor = firstMonth;
    let guard = 0;
    while (cursor <= lastMonth && guard < MAX_TIMELINE_MONTHS) {
      months.push(cursor);
      cursor = nextMonthKey(cursor);
      guard += 1;
    }
  }
  const timeline: InsightsTimelineMonth[] = months.map((month) => {
    let planned = '0';
    let plannedCount = 0;
    let completedCount = 0;
    for (const plan of active) {
      if (monthKeyOf(plan.plannedDate) === month) {
        planned = addDecimals(planned, plan.total);
        plannedCount += 1;
        if (plan.status === 'COMPLETED') completedCount += 1;
      }
    }
    let confirmed = '0';
    for (const row of input.confirmed) {
      if (monthKeyOf(row.tradeDate) === month && row.tradeDate <= input.range.end) {
        if (input.range.start === null || row.tradeDate >= input.range.start) {
          confirmed = addDecimals(confirmed, row.amount);
        }
      }
    }
    return {
      month,
      planned,
      confirmed,
      difference: addDecimals(confirmed, `-${planned}`),
      plannedCount,
      completedCount,
    };
  });

  const recentPlans: InsightsRecentPlan[] = [...active]
    .sort((left, right) =>
      left.plannedDate === right.plannedDate
        ? left.id.localeCompare(right.id)
        : left.plannedDate > right.plannedDate
          ? -1
          : 1,
    )
    .slice(0, 10)
    .map((plan) => {
      const rows = confirmedByPlan.get(plan.id) ?? [];
      let confirmed = '0';
      for (const row of rows) confirmed = addDecimals(confirmed, row.amount);
      return {
        id: plan.id,
        name: plan.name,
        plannedDate: plan.plannedDate,
        status: plan.status,
        plannedTotal: plan.total,
        confirmedTotal: confirmed,
        difference: addDecimals(confirmed, `-${plan.total}`),
        confirmedCount: rows.length,
      };
    });

  let cancelledPlannedTotal = '0';
  for (const plan of cancelled) {
    cancelledPlannedTotal = addDecimals(cancelledPlannedTotal, plan.total);
  }

  return {
    currency: input.currency,
    plannedTotal,
    confirmedTotal,
    difference: addDecimals(confirmedTotal, `-${plannedTotal}`),
    completionBp: ratioToHundredthsOfPercent(confirmedTotal, plannedTotal),
    plannedPlanCount: active.filter((plan) => plan.status === 'PLANNED').length,
    completedPlanCount: active.filter((plan) => plan.status === 'COMPLETED').length,
    cancelledPlanCount: cancelled.length,
    plansWithConfirmed: active.filter((plan) => (confirmedByPlan.get(plan.id) ?? []).length > 0)
      .length,
    plansWithoutConfirmed: active.filter(
      (plan) => (confirmedByPlan.get(plan.id) ?? []).length === 0,
    ).length,
    completedWithoutConfirmedCount: active.filter(
      (plan) => plan.status === 'COMPLETED' && (confirmedByPlan.get(plan.id) ?? []).length === 0,
    ).length,
    plannedWithConfirmedCount: active.filter(
      (plan) => plan.status === 'PLANNED' && (confirmedByPlan.get(plan.id) ?? []).length > 0,
    ).length,
    confirmedTransactionCount: input.confirmed.length,
    timeline,
    statusBreakdown: (['PLANNED', 'COMPLETED', 'CANCELLED'] as const).map((status) => {
      const rows = inScope.filter((plan) => plan.status === status);
      let total = '0';
      for (const plan of rows) total = addDecimals(total, plan.total);
      return { status, count: rows.length, plannedTotal: total };
    }),
    byCategory: categories.map((category) => {
      const planned = plannedByCategory.get(category) ?? '0';
      const actual = actualByCategory.get(category) ?? '0';
      return {
        category,
        planned,
        confirmed: actual,
        difference: addDecimals(actual, `-${planned}`),
      };
    }),
    recentPlans,
    cancelledPlannedTotal,
    cancelledCount: cancelled.length,
  };
}
