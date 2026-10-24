/**
 * Phase 5Q-A — review policy: centralized attention heuristics (pure).
 *
 * Every threshold here is an attention heuristic, NOT financial advice and
 * NOT a universal financial rule:
 * - what it means: below, per threshold;
 * - why it exists: surface what deserves a human look before conclusions;
 * - recommendation boundary: no threshold below ever implies buy/sell/
 *   hold, suitability, or a target allocation.
 *
 * Thresholds compare integer basis points parsed from decimal strings
 * (never binary floats): 25.00% -> 2500, -4.20 p.p. -> -420.
 */

/** Coverage below which valuation-dependent numbers need a qualifier. */
export const VALUATION_COVERAGE_ATTENTION_BP = 10000;
/** Coverage below which missing prices demand review (not just a note). */
export const VALUATION_COVERAGE_LOW_BP = 8000;
/** Single position at/above this share of known value gets attention. */
export const SINGLE_ASSET_CONCENTRATION_BP = 2500;
/** Review window: trailing 365 days. */
export const REVIEW_PERIOD_DAYS = 365;
/** Default review period preset (explicit product choice, STEP 3). */
export const DEFAULT_REVIEW_PERIOD_PRESET = '1A' as const;
/** Benchmark gap at/below this (p.p.) is material enough to surface. */
export const BENCHMARK_GAP_MATERIAL_PP_BP = -200;

/**
 * Parses a decimal percent string ('31.42', '-4.2', '100') into integer
 * basis points (3142, -420, 10000) using string math only: 1% = 100bp,
 * fractional digits beyond 2 decimals are truncated toward zero
 * (deterministic, documented). Returns null for anything unparseable —
 * callers treat null as "no sound number", which suppresses the signal
 * instead of guessing.
 */
export function percentStringToBasisPoints(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) return null;
  const sign = match[1] ?? '';
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? '';
  if (intPart === '' && fracPart === '') return null;
  const normalizedFrac = (fracPart + '00').slice(0, 2);
  const basisPoints = Number(intPart === '' ? '0' : intPart) * 100 + Number(normalizedFrac);
  if (!Number.isSafeInteger(basisPoints)) return null;
  return sign === '-' ? -basisPoints : basisPoints;
}

/**
 * True when a money amount string is strictly positive. String math only:
 * an optional leading '+' aside, any '-' sign, empty digit run or
 * unparseable content counts as not positive (fail closed: no income
 * signal). Looks for a nonzero digit in what remains.
 */
export function isPositiveAmountString(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('-')) return false;
  const digits = trimmed.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digits.length > 0;
}

/** Supported review periods (STEP 2/3: presets only, no CUSTOM in v1). */
export const REVIEW_PERIODS = ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION'] as const;
export type ReviewPeriodPreset = (typeof REVIEW_PERIODS)[number];

/** Preset spans in days (INCEPTION is bounded: 5y fits every downstream cap). */
const REVIEW_PERIOD_DAYS_MAP: Record<ReviewPeriodPreset, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  YTD: -1,
  '1A': 365,
  INCEPTION: 1825,
};

export class InvalidReviewPeriodError extends Error {
  readonly code = 'REVIEW.INVALID_PERIOD';
  constructor(period: string) {
    super(`Período de revisão inválido: "${period}"`);
    this.name = 'InvalidReviewPeriodError';
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 30;
}

function parseCivilDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function formatCivilDateParts(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Pure civil-day subtraction on ISO dates (no Date objects, no timezones). */
export function subtractCivilDays(dateIso: string, days: number): string | null {
  const parsed = parseCivilDateParts(dateIso);
  if (!parsed || days < 0 || !Number.isSafeInteger(days)) return null;
  let { year, month, day } = parsed;
  let remaining = days;
  while (remaining > 0) {
    if (day > remaining) {
      day -= remaining;
      remaining = 0;
    } else {
      remaining -= day;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }
  return formatCivilDateParts(year, month, day);
}

/**
 * Resolves a review preset to an explicit {startDate, endDate} window over
 * civil days. INCEPTION is bounded (trailing 1825d — fits every downstream
 * cap; use-cases clamp to ledger inception). Throws on unknown presets.
 */
export function resolveReviewPeriod(
  preset: string,
  todayIso: string,
): { preset: ReviewPeriodPreset; startDate: string; endDate: string } {
  if (!(REVIEW_PERIODS as readonly string[]).includes(preset)) {
    throw new InvalidReviewPeriodError(preset);
  }
  const valid = preset as ReviewPeriodPreset;
  const endDate = todayIso;
  if (valid === 'YTD') {
    const parsed = parseCivilDateParts(todayIso);
    if (!parsed) throw new InvalidReviewPeriodError(preset);
    return { preset: valid, startDate: formatCivilDateParts(parsed.year, 1, 1), endDate };
  }
  const startDate = subtractCivilDays(todayIso, REVIEW_PERIOD_DAYS_MAP[valid]);
  if (startDate === null) throw new InvalidReviewPeriodError(preset);
  return { preset: valid, startDate, endDate };
}
