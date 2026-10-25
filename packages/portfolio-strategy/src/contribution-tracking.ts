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

/**
 * Phase 5Q-H — centralized contribution matching policy (discovery only).
 *
 * daysBefore/daysAfter keep the asymmetric window: ledger dates lag or
 * lead the planned date, rarely matching it exactly. queryLimit bounds
 * the DB read; maxCandidates caps the ranked output; groupBaseLimit
 * bounds pair search (C(20,2) = 190 max); maxGroupSize is 2 in v1
 * (subset-sum is out of scope). No weights, no scores — ordering is
 * documented in rankContributionCandidates.
 */
export const CONTRIBUTION_MATCH_POLICY = {
  daysBefore: 7,
  daysAfter: 14,
  queryLimit: 200,
  maxCandidates: 50,
  groupBaseLimit: 20,
  maxGroupSize: 2,
} as const;

/** Candidate discovery window around the planned date (heuristic, not a rule). */
export const TRACKING_CANDIDATE_WINDOW_BEFORE_DAYS = CONTRIBUTION_MATCH_POLICY.daysBefore;
export const TRACKING_CANDIDATE_WINDOW_AFTER_DAYS = CONTRIBUTION_MATCH_POLICY.daysAfter;

/** Cap on derived candidates (bounded read, deterministic order). */
export const MAX_TRACKING_CANDIDATES = CONTRIBUTION_MATCH_POLICY.maxCandidates;

/**
 * Factual match reasons. Every reason is a verifiable fact about the
 * transaction vs the plan — never likelihood, never a recommendation.
 * The UI renders these verbatim as "why this appeared".
 */
export type ContributionMatchReason =
  | 'SAME_CURRENCY'
  | 'WITHIN_DATE_WINDOW'
  | 'ON_PLANNED_DATE'
  | 'BEFORE_PLANNED_DATE'
  | 'AFTER_PLANNED_DATE'
  | 'EXACT_AMOUNT'
  | 'PARTIAL_AMOUNT'
  | 'ABOVE_PLANNED_AMOUNT'
  | 'COMBINED_EXACT_AMOUNT'
  | 'COMBINED_PARTIAL_AMOUNT'
  | 'COMBINED_ABOVE_AMOUNT';

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
  /** Days between trade date and planned date (exact civil math). */
  dateDistanceDays: number;
  /** Exact |amount − plannedTotal| as a canonical decimal. */
  amountDifference: string;
  /** Factual reasons, stable order: currency, window, date side, amount side. */
  reasons: ContributionMatchReason[];
}

/**
 * Deterministic ranking, documented and weight-free:
 * 1. date distance asc, 2. amount distance asc (exact decimal),
 * 3. trade date asc, 4. id asc. No scores, no hidden weights —
 * what you read here is the whole ranking.
 */
export function rankContributionCandidates(
  candidates: readonly TrackingCandidate[],
): TrackingCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.dateDistanceDays !== right.dateDistanceDays) {
      return left.dateDistanceDays - right.dateDistanceDays;
    }
    const amountOrder = compareDecimalStrings(left.amountDifference, right.amountDifference);
    if (amountOrder !== 0) return amountOrder;
    if (left.tradeDate !== right.tradeDate) {
      return left.tradeDate < right.tradeDate ? -1 : 1;
    }
    return left.transactionId < right.transactionId ? -1 : 1;
  });
}

function candidateReasons(input: {
  tradeDate: string;
  plannedDate: string;
  amount: string;
  plannedTotal: string;
}): ContributionMatchReason[] {
  const reasons: ContributionMatchReason[] = ['SAME_CURRENCY', 'WITHIN_DATE_WINDOW'];
  if (input.tradeDate === input.plannedDate) reasons.push('ON_PLANNED_DATE');
  else if (input.tradeDate < input.plannedDate) reasons.push('BEFORE_PLANNED_DATE');
  else reasons.push('AFTER_PLANNED_DATE');
  const order = compareDecimalStrings(input.amount, input.plannedTotal);
  if (order === 0) reasons.push('EXACT_AMOUNT');
  else if (order < 0) reasons.push('PARTIAL_AMOUNT');
  else reasons.push('ABOVE_PLANNED_AMOUNT');
  return reasons;
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
 * [planned − 7d, planned + 14d] window (or an explicit override window
 * for manual search), not already confirmed or rejected. Each candidate
 * carries factual reasons + exact distances; ordering goes through
 * rankContributionCandidates. Rejected and confirmed ids come from the
 * link table (memory, not math).
 */
export function deriveContributionCandidates(input: {
  plannedDate: string;
  plannedTotal: string;
  currency: string;
  transactions: readonly TrackingTransactionInput[];
  confirmedIds: ReadonlySet<string>;
  rejectedIds: ReadonlySet<string>;
  maxCandidates?: number;
  window?: { start: string; end: string };
}): TrackingCandidate[] {
  const limit = input.maxCandidates ?? CONTRIBUTION_MATCH_POLICY.maxCandidates;
  const window = input.window ?? trackingCandidateWindow(input.plannedDate);
  const ranked = input.transactions
    .filter((tx) =>
      (ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES as readonly string[]).includes(tx.type),
    )
    .filter((tx) => tx.currency === input.currency)
    .filter((tx) => tx.tradeDate >= window.start && tx.tradeDate <= window.end)
    .filter((tx) => !input.confirmedIds.has(tx.id) && !input.rejectedIds.has(tx.id))
    .map((tx): TrackingCandidate => ({
      transactionId: tx.id,
      tradeDate: tx.tradeDate,
      amount: tx.amount,
      currency: tx.currency,
      dateDistanceDays: dateDistanceDays(tx.tradeDate, input.plannedDate),
      amountDifference: absDecimalDifference(tx.amount, input.plannedTotal),
      reasons: candidateReasons({
        tradeDate: tx.tradeDate,
        plannedDate: input.plannedDate,
        amount: tx.amount,
        plannedTotal: input.plannedTotal,
      }),
    }));
  return rankContributionCandidates(ranked).slice(0, limit);
}

export interface ContributionCandidateGroup {
  transactionIds: [string, string];
  tradeDates: [string, string];
  amounts: [string, string];
  currency: string;
  combinedAmount: string;
  /** Exact |combined − plannedTotal| as a canonical decimal. */
  amountDifference: string;
  /** Days between the two legs (exact civil math). */
  dateSpanDays: number;
  reasons: ContributionMatchReason[];
}

/**
 * Derives pair groups from the top-ranked candidates (never persisted).
 * Bounded: at most groupBaseLimit legs in, C(n,2) pairs out. Pairs use
 * exact decimal sums; ordering is amount distance, then date span, then
 * id pair — deterministic, no scores. Rejected/confirmed legs never
 * enter: callers pass already-filtered candidates.
 */
export function deriveContributionCandidateGroups(input: {
  plannedTotal: string;
  currency: string;
  candidates: readonly TrackingCandidate[];
  groupBaseLimit?: number;
}): ContributionCandidateGroup[] {
  const base = input.candidates.slice(
    0,
    input.groupBaseLimit ?? CONTRIBUTION_MATCH_POLICY.groupBaseLimit,
  );
  const groups: Array<ContributionCandidateGroup & { idKey: string }> = [];
  for (let leftIndex = 0; leftIndex < base.length; leftIndex += 1) {
    const left = base[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < base.length; rightIndex += 1) {
      const right = base[rightIndex]!;
      const combinedAmount = addDecimals(left.amount, right.amount);
      const amountDifference = absDecimalDifference(combinedAmount, input.plannedTotal);
      const order = compareDecimalStrings(combinedAmount, input.plannedTotal);
      groups.push({
        transactionIds: [left.transactionId, right.transactionId].sort() as [string, string],
        tradeDates: [left.tradeDate, right.tradeDate].sort() as [string, string],
        amounts: [left.amount, right.amount],
        currency: input.currency,
        combinedAmount,
        amountDifference,
        dateSpanDays: dateDistanceDays(left.tradeDate, right.tradeDate),
        reasons: [
          order === 0
            ? 'COMBINED_EXACT_AMOUNT'
            : order < 0
              ? 'COMBINED_PARTIAL_AMOUNT'
              : 'COMBINED_ABOVE_AMOUNT',
        ],
        idKey: [left.transactionId, right.transactionId].sort().join('|'),
      });
    }
  }
  return groups
    .sort((left, right) => {
      const amountOrder = compareDecimalStrings(left.amountDifference, right.amountDifference);
      if (amountOrder !== 0) return amountOrder;
      if (left.dateSpanDays !== right.dateSpanDays) return left.dateSpanDays - right.dateSpanDays;
      return left.idKey < right.idKey ? -1 : left.idKey > right.idKey ? 1 : 0;
    })
    .map(({ idKey, ...group }) => {
      void idKey;
      return group;
    });
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
