/**
 * Presentation-only ticker-successor labels for position surfaces.
 *
 * The canonical mapping lives in `@atlas/domain` (asset-successors); this
 * module only shapes display strings. No financial math, no identity changes:
 * routing and keys keep using the row's own ticker/assetId.
 *
 * - Current positions (no asOf): show the successor symbol with an
 *   "anteriormente X" note, e.g. PMLL11 / anteriormente MALL11.
 * - Historical snapshots (asOf before the effective date): keep the epoch
 *   ticker (never rewrite the past).
 * - History/event feeds: NOT mapped here — events keep their epoch ticker
 *   at the call site by simply not calling this helper.
 */

import { resolveCurrentTicker } from '@atlas/domain';

export interface SuccessorDisplay {
  /** Ticker to render as primary label. */
  readonly currentTicker: string;
  /** Predecessor ticker when a rename applies, else null. */
  readonly predecessorTicker: string | null;
  /** Ready-to-render note ("anteriormente X") or null. */
  readonly successionNote: string | null;
}

export function successorDisplayFor(
  ticker: string | null | undefined,
  asOf?: string | null,
): SuccessorDisplay {
  const normalized = (ticker ?? '').trim().toUpperCase();
  if (normalized === '') {
    return { currentTicker: '', predecessorTicker: null, successionNote: null };
  }
  const current = resolveCurrentTicker(normalized, asOf ?? undefined);
  if (current === normalized) {
    return { currentTicker: normalized, predecessorTicker: null, successionNote: null };
  }
  return {
    currentTicker: current,
    predecessorTicker: normalized,
    successionNote: `anteriormente ${normalized}`,
  };
}
