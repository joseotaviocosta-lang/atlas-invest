import { DomainError } from '@atlas/domain';
import { addDecimals } from './scenario';
import {
  enumerateGoalMonths,
  goalVersionForMonth,
  validateGoalMonth,
  type GoalVersionInput,
} from './contribution-goals';

export class InvalidContributionCalendarError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_CALENDAR');
    this.name = 'InvalidContributionCalendarError';
  }
}

/** Hard bound so a calendar window stays small no matter the request. */
export const MAX_CALENDAR_MONTHS = 24;

export interface CalendarPlanInput {
  id: string;
  name: string;
  /** Date-only `YYYY-MM-DD` the plan is declared for. */
  plannedDate: string;
  status: string;
  currency: string;
  /** Canonical decimal total (exact, never float). */
  total: string;
}

export interface CalendarActualInput {
  /** Date-only `YYYY-MM-DD` from the ledger (never moved by plan linkage). */
  tradeDate: string;
  /** Canonical decimal amount (exact, never float). */
  amount: string;
  currency: string;
  /** Raw ledger type (e.g. DEPOSIT); display mapping stays in the UI. */
  type: string;
  /** Owning plan (CONFIRMED link); may live in another month. */
  planId: string;
  planName: string;
}

export interface CalendarMonthCurrencyTotals {
  currency: string;
  planned: string;
  plannedCount: number;
  completedCount: number;
  cancelledCount: number;
  confirmed: string;
  confirmedCount: number;
}

export interface CalendarPlanRow {
  id: string;
  name: string;
  plannedDate: string;
  status: string;
  currency: string;
  total: string;
}

export interface CalendarActualRow {
  tradeDate: string;
  amount: string;
  currency: string;
  type: string;
  linkedPlanId: string;
  linkedPlanName: string;
}

export interface ContributionPlanningMonth {
  /** Identity `YYYY-MM` (civil, no timezone). */
  month: string;
  isCurrentMonth: boolean;
  goal: { amount: string; currency: string } | null;
  /** A goal version takes effect this month (factual marker, no judgment). */
  goalChange: boolean;
  totalsByCurrency: CalendarMonthCurrencyTotals[];
  plannedDifferenceToGoal: string | null;
  confirmedDifferenceToGoal: string | null;
  plans: CalendarPlanRow[];
  confirmedActuals: CalendarActualRow[];
}

export interface CalendarSummaryByCurrency {
  currency: string;
  /** Sum of the version in force per month (real versions, never annualized). */
  goalTotal: string;
  plannedTotal: string;
  confirmedTotal: string;
  plannedDifference: string | null;
  confirmedDifference: string | null;
  monthsWithGoal: number;
  monthsWithoutGoal: number;
}

function monthOf(dateOnly: string): string {
  return dateOnly.slice(0, 7);
}

/**
 * Validates an explicit month window and enumerates it. Both bounds are
 * `YYYY-MM`; the window is inclusive, ordered, and capped at
 * MAX_CALENDAR_MONTHS. Pure: no clock, no I/O.
 */
export function validateCalendarRange(
  from: unknown,
  to: unknown,
): { valid: true; months: string[] } | { valid: false; reason: string } {
  const fromCheck = validateGoalMonth(from);
  if (!fromCheck.valid) return { valid: false, reason: 'INVALID_FROM' };
  const toCheck = validateGoalMonth(to);
  if (!toCheck.valid) return { valid: false, reason: 'INVALID_TO' };
  if (fromCheck.month > toCheck.month) return { valid: false, reason: 'REVERSED_RANGE' };
  const months = enumerateGoalMonths(
    { start: `${fromCheck.month}-01`, end: `${toCheck.month}-01` },
    [],
    MAX_CALENDAR_MONTHS + 1,
  );
  if (months.length > MAX_CALENDAR_MONTHS) return { valid: false, reason: 'RANGE_TOO_LARGE' };
  return { valid: true, months };
}

function emptyTotals(currency: string): CalendarMonthCurrencyTotals {
  return {
    currency,
    planned: '0',
    plannedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    confirmed: '0',
    confirmedCount: 0,
  };
}

/**
 * Derives the planning calendar: goal + plans + confirmed actuals composed
 * per calendar month. Goal uses the version in force each month; plans
 * bucket by plannedDate; actuals bucket by tradeDate (linkage never moves
 * money between months). Cancelled plans are listed but never summed.
 * Candidates and rejected links never enter (callers only pass CONFIRMED).
 * Pure: no I/O, no clock, exact decimal math.
 */
export function deriveContributionPlanningCalendar(input: {
  months: ReadonlyArray<string>;
  currentMonth: string;
  goals: ReadonlyArray<GoalVersionInput>;
  plans: ReadonlyArray<CalendarPlanInput>;
  actuals: ReadonlyArray<CalendarActualInput>;
}): {
  months: ContributionPlanningMonth[];
  summaryByCurrency: CalendarSummaryByCurrency[];
  currencies: string[];
  limitations: string[];
} {
  const monthSet = new Set(input.months);
  const plansByMonth = new Map<string, CalendarPlanInput[]>();
  for (const plan of input.plans) {
    const month = monthOf(plan.plannedDate);
    if (!monthSet.has(month)) continue;
    const bucket = plansByMonth.get(month);
    if (bucket) bucket.push(plan);
    else plansByMonth.set(month, [plan]);
  }
  const actualsByMonth = new Map<string, CalendarActualInput[]>();
  for (const actual of input.actuals) {
    const month = monthOf(actual.tradeDate);
    if (!monthSet.has(month)) continue;
    const bucket = actualsByMonth.get(month);
    if (bucket) bucket.push(actual);
    else actualsByMonth.set(month, [actual]);
  }

  const months: ContributionPlanningMonth[] = [];
  const goalTotals = new Map<string, string>();
  const plannedTotals = new Map<string, string>();
  const confirmedTotals = new Map<string, string>();
  const monthsWithGoalByCurrency = new Map<string, number>();
  let hasPlans = false;
  let hasActuals = false;
  let hasGoals = false;

  for (const month of input.months) {
    const version = goalVersionForMonth(input.goals, month);
    const goal = version === null ? null : { amount: version.amount, currency: version.currency };
    if (goal !== null) {
      hasGoals = true;
      goalTotals.set(goal.currency, addDecimals(goalTotals.get(goal.currency) ?? '0', goal.amount));
      monthsWithGoalByCurrency.set(
        goal.currency,
        (monthsWithGoalByCurrency.get(goal.currency) ?? 0) + 1,
      );
    }

    const monthPlans = [...(plansByMonth.get(month) ?? [])].sort((a, b) => {
      if (a.plannedDate !== b.plannedDate) return a.plannedDate < b.plannedDate ? -1 : 1;
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const monthActuals = [...(actualsByMonth.get(month) ?? [])].sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
      if (a.amount !== b.amount) return a.amount < b.amount ? -1 : 1;
      if (a.planName !== b.planName) return a.planName < b.planName ? -1 : 1;
      return a.planId < b.planId ? -1 : 1;
    });
    if (monthPlans.length > 0) hasPlans = true;
    if (monthActuals.length > 0) hasActuals = true;

    const totalsByCurrency = new Map<string, CalendarMonthCurrencyTotals>();
    const forCurrency = (currency: string): CalendarMonthCurrencyTotals => {
      const existing = totalsByCurrency.get(currency);
      if (existing) return existing;
      const created = emptyTotals(currency);
      totalsByCurrency.set(currency, created);
      return created;
    };
    for (const plan of monthPlans) {
      const totals = forCurrency(plan.currency);
      if (plan.status === 'COMPLETED') {
        totals.completedCount += 1;
        totals.planned = addDecimals(totals.planned, plan.total);
        plannedTotals.set(
          plan.currency,
          addDecimals(plannedTotals.get(plan.currency) ?? '0', plan.total),
        );
      } else if (plan.status === 'CANCELLED') {
        // Listed for history, never summed.
        totals.cancelledCount += 1;
      } else {
        totals.plannedCount += 1;
        totals.planned = addDecimals(totals.planned, plan.total);
        plannedTotals.set(
          plan.currency,
          addDecimals(plannedTotals.get(plan.currency) ?? '0', plan.total),
        );
      }
    }
    for (const actual of monthActuals) {
      const totals = forCurrency(actual.currency);
      totals.confirmedCount += 1;
      totals.confirmed = addDecimals(totals.confirmed, actual.amount);
      confirmedTotals.set(
        actual.currency,
        addDecimals(confirmedTotals.get(actual.currency) ?? '0', actual.amount),
      );
    }
    const orderedTotals = [...totalsByCurrency.values()].sort((a, b) =>
      a.currency < b.currency ? -1 : 1,
    );

    // Differences only when the whole month speaks one currency and it is
    // the goal currency — never across currencies.
    let plannedDifferenceToGoal: string | null = null;
    let confirmedDifferenceToGoal: string | null = null;
    if (
      goal !== null &&
      orderedTotals.length === 1 &&
      orderedTotals[0]?.currency === goal.currency
    ) {
      plannedDifferenceToGoal = addDecimals(orderedTotals[0].planned, `-${goal.amount}`);
      confirmedDifferenceToGoal = addDecimals(orderedTotals[0].confirmed, `-${goal.amount}`);
    }

    months.push({
      month,
      isCurrentMonth: month === input.currentMonth,
      goal,
      goalChange: version !== null && version.effectiveFromMonth === month,
      totalsByCurrency: orderedTotals,
      plannedDifferenceToGoal,
      confirmedDifferenceToGoal,
      plans: monthPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        plannedDate: plan.plannedDate,
        status: plan.status,
        currency: plan.currency,
        total: plan.total,
      })),
      confirmedActuals: monthActuals.map((actual) => ({
        tradeDate: actual.tradeDate,
        amount: actual.amount,
        currency: actual.currency,
        type: actual.type,
        linkedPlanId: actual.planId,
        linkedPlanName: actual.planName,
      })),
    });
  }

  const currencies = Array.from(
    new Set([...goalTotals.keys(), ...plannedTotals.keys(), ...confirmedTotals.keys()]),
  ).sort();
  const summaryByCurrency: CalendarSummaryByCurrency[] = currencies.map((currency) => {
    const goalTotal = goalTotals.get(currency) ?? '0';
    const plannedTotal = plannedTotals.get(currency) ?? '0';
    const confirmedTotal = confirmedTotals.get(currency) ?? '0';
    const monthsWithGoal = monthsWithGoalByCurrency.get(currency) ?? 0;
    return {
      currency,
      goalTotal,
      plannedTotal,
      confirmedTotal,
      plannedDifference: monthsWithGoal === 0 ? null : addDecimals(plannedTotal, `-${goalTotal}`),
      confirmedDifference:
        monthsWithGoal === 0 ? null : addDecimals(confirmedTotal, `-${goalTotal}`),
      monthsWithGoal,
      monthsWithoutGoal: input.months.length - monthsWithGoal,
    };
  });

  const limitations: string[] = [];
  if (currencies.length > 1) limitations.push('MIXED_CURRENCIES');
  if (!hasPlans && !hasActuals && !hasGoals) limitations.push('NO_ACTIVITY');

  return { months, summaryByCurrency, currencies, limitations };
}
