/**
 * Phase 5Q-C — strategy policy: centralized thresholds (pure).
 *
 * Tolerance is a UI/decision threshold: how far from the user's own target
 * a category may drift before it is called materially different. It is NOT
 * an acceptable-risk statement, NOT suitability, NOT advice.
 */

export const STRATEGY_TOTAL_BP = 10000;
export const MIN_TARGET_BP = 0;
export const MAX_TARGET_BP = 10000;

/** Deviation within ±tolerance counts as ON_TARGET (inclusive). */
export const STRATEGY_TOLERANCE_BP = 100;

/** Coverage below which comparisons are not classified (fail closed). */
export const STRATEGY_MIN_COVERAGE_BP = 8000;

/**
 * Phase 5Q-E — cap on saved hypothetical scenarios per portfolio.
 * Abuse guard only (small list, no pagination in v1); hitting it never
 * deletes anything — the API fails closed with a clear message.
 */
export const MAX_SAVED_SCENARIOS_PER_PORTFOLIO = 50;

/** Saved scenario names: plain text, trimmed, 1..80 chars, no markup. */
export const SCENARIO_NAME_MIN_LENGTH = 1;
export const SCENARIO_NAME_MAX_LENGTH = 80;

/**
 * Parses a decimal percent string ('25', '25.5', '25,50', '87.456') into
 * integer basis points using decimal-string math only (locale commas
 * handled explicitly: '25,5' becomes 2550, never 25; binary floats never
 * touch a monetary value). Truncates fractional digits beyond 2 decimals
 * toward zero. Returns null when unparseable or negative.
 */
export function parsePercentToBasisPoints(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (normalized === '' || normalized.startsWith('-')) return null;
  const match = /^(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!match) return null;
  if (match[1] === '' && (match[2] ?? '') === '') return null;
  const intPart = match[1] === '' ? '0' : (match[1] as string);
  const fracPart = match[2] ?? '';
  const frac2 = (fracPart + '00').slice(0, 2);
  const basisPoints = Number(intPart) * 100 + Number(frac2);
  if (!Number.isSafeInteger(basisPoints)) return null;
  return basisPoints;
}

/** Formats integer basis points as a pt-BR percent string ('2500' -> '25,00%'). Display only. */
export function formatBasisPointsPtBr(basisPoints: number): string {
  const negative = basisPoints < 0;
  const abs = Math.abs(Math.trunc(basisPoints));
  const intPart = Math.floor(abs / 100).toString();
  const fracPart = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${fracPart}%`;
}

/** Formats a signed basis-point deviation as pt-BR p.p. ('-500' -> '-5,00 p.p.'). Display only. */
export function formatDeviationPtBr(deviationBp: number): string {
  const formatted = formatBasisPointsPtBr(Math.abs(deviationBp)).replace('%', '').trim();
  const sign = deviationBp > 0 ? '+' : deviationBp < 0 ? '-' : '';
  return `${sign}${formatted} p.p.`.replace('  ', ' ');
}
