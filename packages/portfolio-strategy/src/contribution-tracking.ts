import { DomainError } from '@atlas/domain';
import { addDecimals, canonicalDecimal } from './scenario';
import { STRATEGY_CATEGORIES } from './types';

export class InvalidContributionTrackingError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_TRACKING');
    this.name = 'InvalidContributionTrackingError';
  }
}

/**
 * Phase 5Q-G — eligible "actual" transaction types (documented, conservative).
 *
 * Only DEPOSIT counts in v1: it is the ledger's explicit external-cash
 * event (amount + currency, no rotation ambiguity). BUY/SUBSCRIPTION are
 * purchases, not proven contributions; TRANSFER_IN carries no monetary
 * amount; income/outflows/splits are never contributions. Sources are
 * agnostic (MANUAL/CSV/B3/...): eligibility is by type, never by origin.
 */
export const ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES = ['DEPOSIT'] as const;

/** Candidate discovery window around the planned date (heuristic, not a rule). */
export const TRACKING_CANDIDATE_WINDOW_BEFORE_DAYS = 7;
export const TRACKING_CANDIDATE_WINDOW_AFTER_DAYS = 14;

/** Cap on derived candidates (bounded read, deterministic order). */
export const MAX_TRACKING_CANDIDATES = 50;

export type PlanLinkStatus = 'CONFIRMED' | 'REJECTED';

/**
 * Link transitions. Confirm/reject are idempotent; CONFIRMED can move to
 * REJECTED (unlink keeps the audit row); REJECTED can move back to
 * CONFIRMED on explicit re-confirm. Terminal plan state does not block
 * reads — only the plan lifecycle is immutable, links stay visible.
 */
export function canTransitionPlanLinkStatus(
  from: 'ABSENT' | PlanLinkStatus,
  to: PlanLinkStatus,
): boolean {
  if (from === 'ABSENT') return true;
  if (from === to) return true;
  return true;
}

export interface TrackingTransactionInput {
  id: string;
  /** Ledger transaction type (e.g. 'DEPOSIT'). */
  type: string;
  /** Date-only `YYYY-MM-DD` (trade date). */
  tradeDate: string;
  /** Canonical decimal money amount. */
  amount: string;
  currency: string;
}

export interface TrackingCandidate {
  transactionId: string;
  tradeDate: string;
  amount: string;
  currency: string;
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

/** Exact absolute decimal difference as canonical string (BigInt, no floats). */
export function absDecimalDifference(a: string, b: string): string {
  const left = splitDecimalParts(a);
  const right = splitDecimalParts(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  const toUnits = (part: { int: string; frac: string }): bigint => {
    const padded = (part.frac + '0'.repeat(scale)).slice(0, Math.max(scale, 1));
    return BigInt(normalizeIntDigits(part.int) + padded);
  };
  const diff = toUnits(left) - toUnits(right);
  const abs = (diff < BigInt(0) ? -diff : diff).toString();
  if (scale === 0) return abs;
  const padded = abs.padStart(scale + 1, '0');
  return canonicalDecimal(
    `${padded.slice(0, padded.length - scale)}.${padded.slice(padded.length - scale)}`,
  );
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
 * Date-only day shift on `YYYY-MM-DD` via civil calendar math (no `Date`,
 * no timezone). Works for the small discovery windows used here.
 */
export function addDaysIso(date: string, days: number): string {
  const [yearRaw = '0', monthRaw = '1', dayRaw = '1'] = date.split('-');
  let year = Number(yearRaw);
  let month = Number(monthRaw);
  let day = Number(dayRaw);
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (days >= 0) {
    let remaining = days;
    while (remaining > 0) {
      const dim = daysInMonthCivil(year, month);
      const room = dim - day;
      if (remaining <= room) {
        day += remaining;
        remaining = 0;
      } else {
        remaining -= room + 1;
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
  } else {
    let remaining = -days;
    while (remaining > 0) {
      if (remaining < day) {
        day -= remaining;
        remaining = 0;
      } else {
        remaining -= day;
        month -= 1;
        if (month < 1) {
          month = 12;
          year -= 1;
        }
        day = daysInMonthCivil(year, month);
      }
    }
  }
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function dateDistanceDays(a: string, b: string): number {
  const toSerial = (value: string): number => {
    const [yearRaw = '0', monthRaw = '1', dayRaw = '1'] = value.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    let serial = day;
    for (let cursorYear = 0; cursorYear < year; cursorYear += 1) {
      serial += isLeapYearCivil(cursorYear) ? 366 : 365;
    }
    for (let cursorMonth = 1; cursorMonth < month; cursorMonth += 1) {
      serial += daysInMonthCivil(year, cursorMonth);
    }
    return serial;
  };
  return Math.abs(toSerial(a) - toSerial(b));
}

/**
 * Candidate discovery window for a planned date (lexicographic ISO math,
 * no timezone). Centralized here so the API query bounds and the engine
 * filter can never disagree.
 */
export function trackingCandidateWindow(plannedDate: string): {
  start: string;
  end: string;
} {
  return {
    start: addDaysIso(plannedDate, -TRACKING_CANDIDATE_WINDOW_BEFORE_DAYS),
    end: addDaysIso(plannedDate, TRACKING_CANDIDATE_WINDOW_AFTER_DAYS),
  };
}

/**
 * Derives deterministic candidates on read (never persisted here).
 * Filters: eligible type, same currency, trade date inside the
 * [planned - 7d, planned + 14d] window, not already confirmed or
 * rejected. Orders by date distance, then exact amount distance to the
 * planned total, then trade date, then id — capped. Rejected and
 * confirmed ids come from the link table (memory, not math).
 */
export function deriveContributionCandidates(input: {
  plannedDate: string;
  plannedTotal: string;
  currency: string;
  transactions: readonly TrackingTransactionInput[];
  confirmedIds: ReadonlySet<string>;
  rejectedIds: ReadonlySet<string>;
  maxCandidates?: number;
}): TrackingCandidate[] {
  const limit = input.maxCandidates ?? MAX_TRACKING_CANDIDATES;
  const windowStart = addDaysIso(input.plannedDate, -TRACKING_CANDIDATE_WINDOW_BEFORE_DAYS);
  const windowEnd = addDaysIso(input.plannedDate, TRACKING_CANDIDATE_WINDOW_AFTER_DAYS);
  const ranked = input.transactions
    .filter((tx) =>
      (ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES as readonly string[]).includes(tx.type),
    )
    .filter((tx) => tx.currency === input.currency)
    .filter((tx) => tx.tradeDate >= windowStart && tx.tradeDate <= windowEnd)
    .filter((tx) => !input.confirmedIds.has(tx.id) && !input.rejectedIds.has(tx.id))
    .map((tx) => ({
      tx,
      dateDistance: dateDistanceDays(tx.tradeDate, input.plannedDate),
      amountDistance: absDecimalDifference(tx.amount, input.plannedTotal),
    }))
    .sort((left, right) => {
      if (left.dateDistance !== right.dateDistance) return left.dateDistance - right.dateDistance;
      const amountOrder = compareDecimalStrings(left.amountDistance, right.amountDistance);
      if (amountOrder !== 0) return amountOrder;
      if (left.tx.tradeDate !== right.tx.tradeDate) {
        return left.tx.tradeDate < right.tx.tradeDate ? -1 : 1;
      }
      return left.tx.id < right.tx.id ? -1 : 1;
    })
    .slice(0, limit);
  return ranked.map(({ tx }) => ({
    transactionId: tx.id,
    tradeDate: tx.tradeDate,
    amount: tx.amount,
    currency: tx.currency,
  }));
}

export interface TrackingCategoryRow {
  category: string;
  planned: string;
  actual: string;
  difference: string;
}

export interface ContributionTracking {
  plannedTotal: string;
  actualTotal: string;
  difference: string;
  /** Integer basis points of actual/planned (null only if planned is zero, impossible by validation). */
  completionBp: number | null;
  byCategory: TrackingCategoryRow[];
  confirmedCount: number;
}

/**
 * Aggregates CONFIRMED transactions only (candidates never enter totals).
 * Amounts come from the ledger (never copied into links). Exact decimal
 * math; per-category rows cover the union of planned and actual
 * categories in canonical order. No score, no judgment — facts only.
 */
export function deriveContributionTracking(input: {
  planned: ReadonlyMap<string, string>;
  actual: ReadonlyArray<{ category: string; amount: string }>;
}): ContributionTracking {
  let plannedTotal = '0';
  for (const amount of input.planned.values()) {
    plannedTotal = addDecimals(plannedTotal, amount);
  }
  let actualTotal = '0';
  for (const row of input.actual) {
    actualTotal = addDecimals(actualTotal, row.amount);
  }
  const categories = Array.from(
    new Set([...input.planned.keys(), ...input.actual.map((row) => row.category)]),
  ).sort(
    (left, right) =>
      STRATEGY_CATEGORIES.indexOf(left as (typeof STRATEGY_CATEGORIES)[number]) -
      STRATEGY_CATEGORIES.indexOf(right as (typeof STRATEGY_CATEGORIES)[number]),
  );
  const actualByCategory = new Map<string, string>();
  for (const row of input.actual) {
    actualByCategory.set(
      row.category,
      addDecimals(actualByCategory.get(row.category) ?? '0', row.amount),
    );
  }
  const byCategory: TrackingCategoryRow[] = categories.map((category) => {
    const planned = input.planned.get(category) ?? '0';
    const actual = actualByCategory.get(category) ?? '0';
    return {
      category,
      planned,
      actual,
      difference: addDecimals(actual, `-${planned}`),
    };
  });
  return {
    plannedTotal,
    actualTotal,
    difference: addDecimals(actualTotal, `-${plannedTotal}`),
    completionBp: ratioToHundredthsOfPercent(actualTotal, plannedTotal),
    byCategory,
    confirmedCount: input.actual.length,
  };
}

/**
 * Exact actual/planned ratio in basis points of percent (10000 = 100%),
 * ROUND_HALF_UP. Null when the planned total is zero (unreachable through
 * validated plans, but fail-closed rather than divide by zero).
 */
export function ratioToHundredthsOfPercent(actual: string, planned: string): number | null {
  const top = splitDecimalParts(canonicalDecimal(actual));
  const bottom = splitDecimalParts(canonicalDecimal(planned));
  const scale = Math.max(top.frac.length, bottom.frac.length, 2);
  const toUnits = (part: { int: string; frac: string }): bigint =>
    BigInt(normalizeIntDigits(part.int) + (part.frac + '0'.repeat(scale)).slice(0, scale));
  const numerator = toUnits(top);
  const denominator = toUnits(bottom);
  if (denominator === BigInt(0)) return null;
  // bp = round(actual / planned * 10000), half-up.
  const result = (numerator * BigInt(10000) * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidContributionTrackingError('Tracking ratio out of range');
  }
  return Number(result);
}
