/**
 * Phase 5K — ticker/account resolution helpers (pure).
 *
 * Ticker is NEVER identity: resolution maps display labels to canonical
 * AssetIds through explicit match states. Unknown tickers never become zero
 * and never auto-create assets.
 */

import type { AccountRef, AccountResolution, AssetRef, AssetResolution } from './types';

export interface AssetMatch {
  resolution: AssetResolution;
  asset: AssetRef | null;
  candidates: AssetRef[];
}

export function resolveAsset(ticker: string, assets: AssetRef[]): AssetMatch {
  const normalized = ticker.trim().toUpperCase();
  const matches = assets.filter((asset) => asset.ticker.trim().toUpperCase() === normalized);
  if (matches.length === 0) {
    return { resolution: 'NOT_FOUND', asset: null, candidates: [] };
  }
  const active = matches.filter((asset) => asset.status === 'ACTIVE');
  const pool = active.length > 0 ? active : matches;
  if (pool.length === 1) {
    return { resolution: 'RESOLVED', asset: pool[0]!, candidates: [] };
  }
  return { resolution: 'AMBIGUOUS', asset: null, candidates: [...pool] };
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
