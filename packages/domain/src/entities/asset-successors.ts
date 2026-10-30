import { LocalDate } from '../primitives/local-date';

/**
 * Ticker successor registry — corporate identity without ledger events.
 *
 * A ticker rename (e.g. MRFG3 → MBRF3) changes the market symbol, never the
 * economic asset: no SELL/BUY, no TRANSFER, no cost reset, no tax realization.
 * Identity stays the AssetId; this registry maps symbol continuity so import
 * resolution, reconciliation, display and quote lookup can follow renames.
 *
 * Rules:
 * - Mappings are EXPLICIT and frozen. Never inferred by textual similarity.
 * - Only ratio '1' (exact 1:1) is supported. Anything else fails closed.
 * - `effectiveDate` is a first-evidence lower bound observed in official B3
 *   files (`FIRST_OBSERVED_IN_B3_FILES` is intentionally conservative: before
 *   that date the predecessor symbol is authoritative, never the successor).
 * - No chains (A→B→C), no self-maps, no duplicates — enforced by tests.
 * - Pure strings and civil dates. Zero floats. No I/O.
 */

export type TickerSuccessorRelation = 'TICKER_RENAME';

export type TickerSuccessorDateSource = 'FIRST_OBSERVED_IN_B3_FILES';

export interface TickerSuccessorEntry {
  readonly predecessor: string;
  readonly successor: string;
  readonly relation: TickerSuccessorRelation;
  /** Exact decimal ratio (new per old). Only '1' is supported. */
  readonly ratio: string;
  /** Civil YYYY-MM-DD from which the successor symbol is authoritative. */
  readonly effectiveDate: string;
  readonly effectiveDateSource: TickerSuccessorDateSource;
}

export const TICKER_SUCCESSORS: readonly TickerSuccessorEntry[] = Object.freeze([
  Object.freeze({
    predecessor: 'MALL11',
    successor: 'PMLL11',
    relation: 'TICKER_RENAME',
    ratio: '1',
    effectiveDate: '2025-11-14',
    effectiveDateSource: 'FIRST_OBSERVED_IN_B3_FILES',
  }),
  Object.freeze({
    predecessor: 'MRFG3',
    successor: 'MBRF3',
    relation: 'TICKER_RENAME',
    ratio: '1',
    effectiveDate: '2025-11-28',
    effectiveDateSource: 'FIRST_OBSERVED_IN_B3_FILES',
  }),
] as const);

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function isSupportedRatio(entry: TickerSuccessorEntry): boolean {
  return entry.ratio.trim() === '1';
}

function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    LocalDate.from(value);
    return true;
  } catch {
    return false;
  }
}

export function isWellFormedSuccessorEntry(entry: TickerSuccessorEntry): boolean {
  if (entry.predecessor.trim() === '' || entry.successor.trim() === '') return false;
  if (normalizeTicker(entry.predecessor) === normalizeTicker(entry.successor)) return false;
  if (entry.relation !== 'TICKER_RENAME') return false;
  if (!isSupportedRatio(entry)) return false;
  return isValidCivilDate(entry.effectiveDate);
}

/** Finds the entry whose predecessor matches (case-insensitive), or null. */
export function findSuccessorEntry(predecessorTicker: string): TickerSuccessorEntry | null {
  const wanted = normalizeTicker(predecessorTicker);
  if (wanted === '') return null;
  return (
    TICKER_SUCCESSORS.find(
      (entry) => normalizeTicker(entry.predecessor) === wanted && isSupportedRatio(entry),
    ) ?? null
  );
}

/** Finds the entry whose successor matches (case-insensitive), or null. */
export function findPredecessorEntry(successorTicker: string): TickerSuccessorEntry | null {
  const wanted = normalizeTicker(successorTicker);
  if (wanted === '') return null;
  return (
    TICKER_SUCCESSORS.find(
      (entry) => normalizeTicker(entry.successor) === wanted && isSupportedRatio(entry),
    ) ?? null
  );
}

/**
 * Display/quote symbol: the successor once its effective date is reached,
 * otherwise the ticker itself. Unknown tickers pass through untouched.
 * Never invents symbols; never fuzzy-matches.
 */
export function resolveCurrentTicker(ticker: string, asOf?: string): string {
  const normalized = normalizeTicker(ticker);
  if (normalized === '') return ticker;
  const entry = findSuccessorEntry(normalized);
  if (!entry) return normalized;
  if (asOf !== undefined) {
    if (!isValidCivilDate(asOf)) return normalized;
    if (asOf < entry.effectiveDate) return normalized;
  }
  return normalizeTicker(entry.successor);
}

/**
 * Stable identity key for grouping: a known successor folds to its
 * predecessor ticker; everything else keys by itself. Pure label mapping —
 * carries no quantity, cost, or economic fields.
 */
export function resolveCanonicalTicker(ticker: string): string {
  const normalized = normalizeTicker(ticker);
  if (normalized === '') return ticker;
  const entry = findPredecessorEntry(normalized);
  return entry ? normalizeTicker(entry.predecessor) : normalized;
}

/** True when both tickers denote the same economic continuity (1:1 rename). */
export function areSuccessorEquivalent(a: string, b: string): boolean {
  const na = normalizeTicker(a);
  const nb = normalizeTicker(b);
  if (na === '' || nb === '') return false;
  if (na === nb) return true;
  return resolveCanonicalTicker(na) === resolveCanonicalTicker(nb);
}
