import { percentStringToBasisPoints } from './policy';

/**
 * Phase 5Q-B — historical evidence derivation (pure, zero I/O).
 *
 * Trends are neutral direction facts only: INCREASED / DECREASED / STABLE
 * describe movement, never quality (no IMPROVED/WORSENED/GOOD/BAD — with
 * one documented exception: valuation coverage, where direction IS the
 * data-quality statement and still says nothing about the portfolio).
 * firstSeen is only ever a date actually observed inside the analyzed
 * window; absence of evidence yields INSUFFICIENT_DATA, never invention.
 */

export type ReviewTrend = 'INCREASED' | 'DECREASED' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface GapHistoryPoint {
  date: string;
  portfolioReturn: string | null;
  benchmarkReturn: string | null;
  /** Gap in percentage points (portfolio − benchmark), decimal string. */
  gap: string | null;
  state: 'BELOW' | 'ABOVE' | 'EVEN' | 'UNKNOWN';
}

export interface GapHistory {
  kind: 'SERIES';
  benchmark: string;
  currency: string;
  points: GapHistoryPoint[];
  /** Worst (most negative) observed gap, decimal p.p. string. */
  worstGap: string | null;
  firstBelowAt: string | null;
  trend: ReviewTrend;
}

export interface IncomeMonthBucket {
  month: string;
  total: string;
  currency: string;
  dividends: string;
  jcp: string;
  fiiIncome: string;
}

export interface IncomeHistory {
  kind: 'TABLE_MONTHLY';
  months: IncomeMonthBucket[];
  total: string;
  currency: string;
  trend: ReviewTrend;
}

/** Multi-currency income history: one table per currency (never summed). */
export interface IncomeHistoriesGroup {
  kind: 'GROUPED';
  groups: IncomeHistory[];
}

export interface RunHistoryRow {
  runId: string;
  date: string;
  status: string;
  trigger: string | null;
  newRecords: number;
  partial: boolean;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

export interface RunsHistory {
  kind: 'TABLE_RUNS';
  rows: RunHistoryRow[];
  firstDivergenceAt: string | null;
  trend: ReviewTrend;
}

export interface ComparisonHistoryRow {
  category: string;
  targetBp: number;
  currentBp: number | null;
  deviationBp: number | null;
  state: 'ABOVE_TARGET' | 'BELOW_TARGET' | 'ON_TARGET' | 'UNAVAILABLE';
}

/**
 * Current-vs-target table for a declared strategy. Deliberately NOT a
 * history: strategy targets have no versioning in v1, so projecting the
 * current comparison backwards would invent history. The limitation list
 * always carries SINGLE_SNAPSHOT_ONLY alongside this kind.
 */
export interface ComparisonHistory {
  kind: 'TABLE_COMPARISON';
  rows: ComparisonHistoryRow[];
  trend: ReviewTrend;
}

export interface UnavailableHistory {
  kind: 'UNAVAILABLE';
  reason: 'NO_HISTORICAL_SOURCE' | 'BENCHMARK_UNAVAILABLE' | 'NO_RUNS_IN_WINDOW';
}

export type ReviewSignalHistory =
  | GapHistory
  | IncomeHistory
  | IncomeHistoriesGroup
  | RunsHistory
  | ComparisonHistory
  | UnavailableHistory;

/**
 * Decimal string subtraction (a − b), same scale, no floats. Returns null
 * when either side is unparseable — callers treat null as UNKNOWN.
 */
export function subtractDecimalStrings(a: string, b: string): string | null {
  const parse = (value: string): { negative: boolean; int: string; frac: string } | null => {
    const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
    if (!match) return null;
    if (match[2] === '' && (match[3] ?? '') === '') return null;
    return {
      negative: match[1] === '-',
      int: match[2] === '' ? '0' : match[2]!,
      frac: match[3] ?? '',
    };
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  const scale = Math.max(left.frac.length, right.frac.length);
  const toUnits = (part: { negative: boolean; int: string; frac: string }): bigint => {
    const digits = part.int + (part.frac + '0'.repeat(scale)).slice(0, scale);
    const normalized = digits.replace(/^0+(?=\d)/, '');
    const units = BigInt(normalized === '' ? '0' : normalized);
    return part.negative ? -units : units;
  };
  const diff = toUnits(left) - toUnits(right);
  const negative = diff < BigInt(0);
  const abs = (negative ? -diff : diff).toString().padStart(scale + 1, '0');
  const intPart = abs.slice(0, Math.max(abs.length - scale, 1)).replace(/^0+(?=\d)/, '');
  const fracPart = scale === 0 ? '' : abs.slice(Math.max(abs.length - scale, 1));
  const trimmedFrac = fracPart.replace(/0+$/, '');
  return `${negative ? '-' : ''}${intPart}${trimmedFrac === '' ? '' : `.${trimmedFrac}`}`;
}

/** First-vs-last direction with zero tolerance (ties → STABLE, gaps → INSUFFICIENT_DATA). */
export function directionOf(values: Array<number | null>): ReviewTrend {
  const observed = values.filter((value): value is number => value !== null);
  if (observed.length < 2) return 'INSUFFICIENT_DATA';
  const first = observed[0]!;
  const last = observed[observed.length - 1]!;
  if (last > first) return 'INCREASED';
  if (last < first) return 'DECREASED';
  return 'STABLE';
}

export function deriveGapHistory(
  points: Array<{ date: string; portfolioReturn: string | null; benchmarkReturn: string | null }>,
  thresholdBp: number,
  benchmark: string,
  currency: string,
): GapHistory {
  const mapped: GapHistoryPoint[] = points.map((point) => {
    const gap =
      point.portfolioReturn !== null && point.benchmarkReturn !== null
        ? subtractDecimalStrings(point.portfolioReturn, point.benchmarkReturn)
        : null;
    const gapBp = gap === null ? null : percentStringToBasisPoints(gap);
    return {
      date: point.date,
      portfolioReturn: point.portfolioReturn,
      benchmarkReturn: point.benchmarkReturn,
      gap,
      state:
        gapBp === null
          ? ('UNKNOWN' as const)
          : gapBp <= thresholdBp
            ? ('BELOW' as const)
            : gapBp === 0
              ? ('EVEN' as const)
              : ('ABOVE' as const),
    };
  });
  const below = mapped.filter((point) => point.state === 'BELOW');
  const gaps = mapped
    .map((point) => (point.gap === null ? null : percentStringToBasisPoints(point.gap)))
    .filter((value): value is number => value !== null);
  const worst = gaps.length > 0 ? Math.min(...gaps) : null;
  const worstPoint =
    worst === null
      ? null
      : mapped.find(
          (point) => point.gap !== null && percentStringToBasisPoints(point.gap) === worst,
        );
  return {
    kind: 'SERIES',
    benchmark,
    currency,
    points: mapped,
    worstGap: worstPoint?.gap ?? null,
    firstBelowAt: below.length > 0 ? below[0]!.date : null,
    trend: directionOf(
      mapped.map((point) => (point.gap === null ? null : percentStringToBasisPoints(point.gap))),
    ),
  };
}

export interface IncomeHistoryRow {
  tradeDate: string;
  amount: string;
  currency: string;
  kind: 'DIVIDEND' | 'JCP' | 'FII';
}

function amountToCents(value: string): number | null {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  if (match[1] === '-') return null;
  const cents =
    Number(match[2] === '' ? '0' : match[2]) * 100 + Number(((match[3] ?? '') + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function centsToAmount(cents: number, currency: string): { amount: string; currency: string } {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100).toString();
  const fracPart = String(abs % 100).padStart(2, '0');
  return { amount: `${negative ? '-' : ''}${intPart}.${fracPart}`, currency };
}

export function deriveIncomeHistory(
  rows: IncomeHistoryRow[],
  months: string[],
  currency: string,
): IncomeHistory {
  const byMonth = new Map<string, { dividends: number; jcp: number; fii: number }>();
  for (const month of months) {
    byMonth.set(month, { dividends: 0, jcp: 0, fii: 0 });
  }
  for (const row of rows) {
    if (row.currency !== currency) continue;
    const month = row.tradeDate.slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    const cents = amountToCents(row.amount);
    if (cents === null) continue;
    if (row.kind === 'DIVIDEND') bucket.dividends += cents;
    else if (row.kind === 'JCP') bucket.jcp += cents;
    else bucket.fii += cents;
  }
  const buckets: IncomeMonthBucket[] = months.map((month) => {
    const bucket = byMonth.get(month)!;
    const total = bucket.dividends + bucket.jcp + bucket.fii;
    return {
      month,
      total: centsToAmount(total, currency).amount,
      currency,
      dividends: centsToAmount(bucket.dividends, currency).amount,
      jcp: centsToAmount(bucket.jcp, currency).amount,
      fiiIncome: centsToAmount(bucket.fii, currency).amount,
    };
  });
  const totals = buckets.map((bucket) => {
    const match = /^(-?)(\d+)\.(\d{2})$/.exec(bucket.total);
    if (!match) return null;
    return Number(match[2]) * 100 + Number(match[3]);
  });
  const grand = totals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {
    kind: 'TABLE_MONTHLY',
    months: buckets,
    total: centsToAmount(grand, currency).amount,
    currency,
    trend: directionOf(totals),
  };
}

export function monthsInRange(startDate: string, endDate: string, maxMonths: number): string[] {
  const startMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(startDate);
  const endMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(endDate);
  if (!startMatch || !endMatch) return [];
  let year = Number(startMatch[1]);
  let month = Number(startMatch[2]);
  const endYear = Number(endMatch[1]);
  const endMonth = Number(endMatch[2]);
  const months: string[] = [];
  while ((year < endYear || (year === endYear && month <= endMonth)) && months.length < maxMonths) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function deriveRunsHistory(
  runs: Array<{
    runId: string;
    createdAt: string;
    status: string;
    trigger: string | null;
    newRecords: number;
    partial: boolean;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  }>,
  limit: number,
): RunsHistory {
  const rows: RunHistoryRow[] = runs.slice(0, Math.max(1, limit)).map((run) => ({
    runId: run.runId,
    date: run.createdAt.slice(0, 10),
    status: run.status,
    trigger: run.trigger,
    newRecords: run.newRecords,
    partial: run.partial,
    divergent: run.divergent,
    missingLocal: run.missingLocal,
    missingSource: run.missingSource,
    unresolved: run.unresolved,
  }));
  const firstDivergent = rows.find(
    (row) =>
      row.divergent > 0 || row.missingLocal > 0 || row.missingSource > 0 || row.unresolved > 0,
  );
  return {
    kind: 'TABLE_RUNS',
    rows,
    firstDivergenceAt: firstDivergent ? firstDivergent.date : null,
    trend: 'INSUFFICIENT_DATA',
  };
}

export const REVIEW_HISTORY_LIMITS = {
  /** Maximum runs listed in a drill-down (recency-bounded window). */
  maxRuns: 20,
  /** Maximum monthly buckets in income history. */
  maxMonths: 61,
  /** Maximum points asserted on any history (series cap lives in the engine). */
  maxPoints: 120,
} as const;
