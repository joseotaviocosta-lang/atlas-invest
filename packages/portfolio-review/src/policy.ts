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
/** Benchmark gap at/below this (p.p.) is material enough to surface. */
export const BENCHMARK_GAP_MATERIAL_PP_BP = -200;
/** Review performance window: trailing 365 days. */
export const REVIEW_PERIOD_DAYS = 365;

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
