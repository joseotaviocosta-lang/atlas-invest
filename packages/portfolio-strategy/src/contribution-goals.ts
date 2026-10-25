import { DomainError } from '@atlas/domain';
import { addDecimals, canonicalDecimal } from './scenario';
import { ratioToHundredthsOfPercent } from './contribution-tracking';

export class InvalidContributionGoalError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_GOAL');
    this.name = 'InvalidContributionGoalError';
  }
}

export const GOAL_CADENCES = ['MONTHLY'] as const;
export type GoalCadence = (typeof GOAL_CADENCES)[number];

export const GOAL_SCOPES = ['PORTFOLIO'] as const;

const MONTH_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

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

/**
 * Strict `YYYY-MM` validation (real calendar months 01–12 only).
 * Returns the canonical month key; storage uses the first day as DATE.
 */
export function validateGoalMonth(raw: unknown): { valid: true; month: string } | { valid: false } {
  if (typeof raw !== 'string') return { valid: false };
  const trimmed = raw.trim();
  const match = MONTH_KEY_REGEX.exec(trimmed);
  if (!match) return { valid: false };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (daysInMonthCivil(year, month) === 0) return { valid: false };
  return { valid: true, month: trimmed };
}

export function monthKeyToFirstDay(month: string): string {
  return `${month}-01`;
}

export function firstDayToMonthKey(date: string): string {
  return date.slice(0, 7);
}

/** First-day-of-month shift on `YYYY-MM-DD` (civil, no `Date`). */
export function addMonthsToFirstDay(date: string, months: number): string {
  const [yearRaw = '0', monthRaw = '1'] = date.split('-');
  const total = Number(yearRaw) * 12 + (Number(monthRaw) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-01`;
}

function monthKeyToSerial(month: string): number {
  const [yearRaw = '0', monthRaw = '1'] = month.split('-');
  return Number(yearRaw) * 12 + (Number(monthRaw) - 1);
}

/** Lexicographic-safe month comparison without date construction. */
export function compareMonthKeys(left: string, right: string): -1 | 0 | 1 {
  const delta = monthKeyToSerial(left) - monthKeyToSerial(right);
  if (delta < 0) return -1;
  if (delta > 0) return 1;
  return 0;
}

/**
 * Months covered by a period range for goal aggregation. Fixed ranges
 * enumerate every month (bounded: 1A = 12); an open-ended range falls
 * back to the activity months already derived. Hard-capped.
 */
export function enumerateGoalMonths(
  range: { start: string | null; end: string },
  activityMonths: readonly string[],
  cap = 120,
): string[] {
  if (range.start === null) return [...activityMonths];
  const months: string[] = [];
  let cursor = range.start.slice(0, 7);
  const end = range.end.slice(0, 7);
  let guard = 0;
  while (cursor <= end && guard < cap) {
    months.push(cursor);
    const [yearRaw = '0', monthRaw = '1'] = cursor.split('-');
    let year = Number(yearRaw);
    let month = Number(monthRaw) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    cursor = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    guard += 1;
  }
  return months;
}

export interface GoalVersionInput {
  amount: string;
  currency: string;
  /** Inclusive first effective month `YYYY-MM`. */
  effectiveFromMonth: string;
  /** Exclusive end month `YYYY-MM`, or null when open-ended. */
  effectiveToMonth: string | null;
}

/**
 * Amount active for a month under versioned rows. Versions are
 * half-open [effectiveFromMonth, effectiveToMonth); null end means
 * open-ended. Deterministic: latest effectiveFrom wins on ties.
 */
export function goalForMonth(
  versions: ReadonlyArray<GoalVersionInput>,
  month: string,
): string | null {
  return goalVersionForMonth(versions, month)?.amount ?? null;
}

/**
 * Version in force for a month (same half-open semantics as
 * goalForMonth). Exposes currency alongside the amount so consumers
 * never compare money across currencies.
 */
export function goalVersionForMonth(
  versions: ReadonlyArray<GoalVersionInput>,
  month: string,
): GoalVersionInput | null {
  let best: GoalVersionInput | null = null;
  for (const version of versions) {
    if (compareMonthKeys(version.effectiveFromMonth, month) > 0) continue;
    if (
      version.effectiveToMonth !== null &&
      compareMonthKeys(month, version.effectiveToMonth) >= 0
    ) {
      continue;
    }
    if (
      best === null ||
      compareMonthKeys(version.effectiveFromMonth, best.effectiveFromMonth) > 0
    ) {
      best = version;
    }
  }
  return best;
}

export type GoalMonthStatus = 'NO_GOAL' | 'BELOW' | 'AT' | 'ABOVE';

/**
 * Progress of one month against its goal. Exact decimal compare, no
 * tolerance. Status is factual position, never judgment.
 */
export function deriveGoalProgress(input: {
  goalAmount: string | null;
  plannedAmount: string;
  confirmedAmount: string;
}): {
  goalAmount: string | null;
  plannedAmount: string;
  confirmedAmount: string;
  plannedDifference: string | null;
  confirmedDifference: string | null;
  completionBp: number | null;
  status: GoalMonthStatus;
} {
  const plannedDifference =
    input.goalAmount === null ? null : addDecimals(input.plannedAmount, `-${input.goalAmount}`);
  const confirmedDifference =
    input.goalAmount === null ? null : addDecimals(input.confirmedAmount, `-${input.goalAmount}`);
  let status: GoalMonthStatus = 'NO_GOAL';
  if (input.goalAmount !== null) {
    const order = compareDecimalStrings(input.confirmedAmount, input.goalAmount);
    status = order < 0 ? 'BELOW' : order > 0 ? 'ABOVE' : 'AT';
  }
  return {
    goalAmount: input.goalAmount,
    plannedAmount: input.plannedAmount,
    confirmedAmount: input.confirmedAmount,
    plannedDifference,
    confirmedDifference,
    completionBp:
      input.goalAmount === null
        ? null
        : ratioToHundredthsOfPercent(input.confirmedAmount, input.goalAmount),
    status,
  };
}

function splitDecimalParts(value: string): { int: string; frac: string } {
  const dot = value.indexOf('.');
  if (dot === -1) return { int: value === '' ? '0' : value, frac: '' };
  return {
    int: value.slice(0, dot) === '' ? '0' : value.slice(0, dot),
    frac: value.slice(dot + 1),
  };
}

function normalizeIntDigits(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/, '');
  return stripped === '' ? '0' : stripped;
}

function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const left = splitDecimalParts(canonicalDecimal(a));
  const right = splitDecimalParts(canonicalDecimal(b));
  const scale = Math.max(left.frac.length, right.frac.length);
  const toUnits = (part: { int: string; frac: string }): bigint =>
    BigInt(normalizeIntDigits(part.int) + (part.frac + '0'.repeat(scale)).slice(0, scale));
  const delta = toUnits(left) - toUnits(right);
  if (delta < BigInt(0)) return -1;
  if (delta > BigInt(0)) return 1;
  return 0;
}

/**
 * Sums the goal actually in force for each month in a closed range.
 * Months without an active goal contribute nothing and are counted
 * separately — never extrapolated.
 */
export function sumGoalForPeriod(input: {
  versions: ReadonlyArray<GoalVersionInput>;
  months: ReadonlyArray<string>;
}): { total: string; monthsWithGoal: number; monthsWithoutGoal: number } {
  let total = '0';
  let monthsWithGoal = 0;
  let monthsWithoutGoal = 0;
  for (const month of input.months) {
    const amount = goalForMonth(input.versions, month);
    if (amount === null) {
      monthsWithoutGoal += 1;
    } else {
      monthsWithGoal += 1;
      total = addDecimals(total, amount);
    }
  }
  return { total, monthsWithGoal, monthsWithoutGoal };
}
