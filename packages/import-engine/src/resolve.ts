/**
 * Phase 5K — ticker/account resolution helpers (pure).
 *
 * Ticker is NEVER identity: resolution maps display labels to canonical
 * AssetIds through explicit match states. Unknown tickers never become zero
 * and never auto-create assets.
 */

import { findPredecessorEntry } from '@atlas/domain';
import type { AccountRef, AccountResolution, AssetRef, AssetResolution } from './types';

export interface AssetMatch {
  resolution: AssetResolution;
  asset: AssetRef | null;
  candidates: AssetRef[];
  /**
   * True when the ticker resolved through an explicit successor mapping
   * (e.g. MBRF3 → MRFG3 asset row). No asset is created, nothing is renamed;
   * the canonical identity stays the predecessor's AssetId.
   */
  viaSuccessor: boolean;
}

export function resolveAsset(ticker: string, assets: AssetRef[]): AssetMatch {
  const normalized = ticker.trim().toUpperCase();
  const matches = assets.filter((asset) => asset.ticker.trim().toUpperCase() === normalized);
  if (matches.length === 0) {
    return resolveViaSuccessor(normalized, assets);
  }
  const active = matches.filter((asset) => asset.status === 'ACTIVE');
  const pool = active.length > 0 ? active : matches;
  if (pool.length === 1) {
    return { resolution: 'RESOLVED', asset: pool[0]!, candidates: [], viaSuccessor: false };
  }
  return { resolution: 'AMBIGUOUS', asset: null, candidates: [...pool], viaSuccessor: false };
}

/**
 * Successor fallback: a known successor ticker (e.g. MBRF3) resolves to the
 * predecessor's canonical asset row (e.g. MRFG3). Explicit audited mapping
 * only — unknown tickers still return NOT_FOUND, never fuzzy matches, never
 * auto-created assets.
 */
function resolveViaSuccessor(normalizedTicker: string, assets: AssetRef[]): AssetMatch {
  const entry = findPredecessorEntry(normalizedTicker);
  if (!entry) {
    return { resolution: 'NOT_FOUND', asset: null, candidates: [], viaSuccessor: false };
  }
  const predecessor = entry.predecessor.trim().toUpperCase();
  const matches = assets.filter((asset) => asset.ticker.trim().toUpperCase() === predecessor);
  if (matches.length === 0) {
    return { resolution: 'NOT_FOUND', asset: null, candidates: [], viaSuccessor: false };
  }
  const active = matches.filter((asset) => asset.status === 'ACTIVE');
  const pool = active.length > 0 ? active : matches;
  if (pool.length === 1) {
    return { resolution: 'RESOLVED', asset: pool[0]!, candidates: [], viaSuccessor: true };
  }
  return { resolution: 'AMBIGUOUS', asset: null, candidates: [...pool], viaSuccessor: true };
}

export interface AccountMatch {
  resolution: AccountResolution;
  account: AccountRef | null;
  candidates: AccountRef[];
}

export function resolveAccount(label: string | undefined, accounts: AccountRef[]): AccountMatch {
  if (label === undefined || label.trim() === '') {
    return { resolution: 'UNSPECIFIED', account: null, candidates: [] };
  }
  const trimmed = label.trim();
  const byId = accounts.find((account) => account.id === trimmed);
  if (byId) {
    return { resolution: 'RESOLVED', account: byId, candidates: [] };
  }
  const normalized = trimmed.toLowerCase();
  const byName = accounts.filter((account) => account.name.trim().toLowerCase() === normalized);
  if (byName.length === 1) {
    return { resolution: 'RESOLVED', account: byName[0]!, candidates: [] };
  }
  if (byName.length > 1) {
    return { resolution: 'AMBIGUOUS', account: null, candidates: [...byName] };
  }
  return { resolution: 'NOT_FOUND', account: null, candidates: [] };
}
