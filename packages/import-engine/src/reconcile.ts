/**
 * Phase 5L — reconciliation layer (pure, zero I/O).
 *
 * A source position snapshot (e.g. B3 D-1) is NEVER a second source of truth
 * and must NEVER silently overwrite the ledger. This module compares
 * ledger-derived positions against a source snapshot and reports an explicit
 * per-asset verdict. Divergence correction, when it exists, happens through
 * canonical ledger events — never by mutating the snapshot comparison.
 */

import { resolveCanonicalTicker } from '@atlas/domain';
import { normalizeDecimalValue } from './fingerprint';

export const RECONCILIATION_STATUSES = [
  'MATCHED',
  'DIVERGENT',
  'MISSING_LOCAL',
  'MISSING_SOURCE',
  'UNRESOLVED',
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface LedgerPositionRow {
  assetId: string;
  ticker?: string;
  quantity: string;
}

export interface SourceSnapshotRow {
  assetId: string;
  ticker?: string;
  quantity: string;
  asOf: string;
}

export interface ReconciliationEntry {
  assetId: string;
  ticker?: string;
  ledgerQuantity: string | null;
  sourceQuantity: string | null;
  delta: string | null;
  status: ReconciliationStatus;
}

export interface ReconciliationSummary {
  totalAssets: number;
  matched: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

/**
 * Canonical grouping key for cross-source reconciliation rows.
 *
 * A known successor ticker folds to its predecessor (e.g. MBRF3 and MRFG3
 * both key as `ticker:MRFG3`), so ledger rows under the historical identity
 * compare against source snapshots under the current identity as one economic
 * position. Rows without a ticker key by AssetId. Pure label mapping — the
 * engine comparison itself is untouched.
 */
export function canonicalReconciliationKey(
  ticker: string | undefined,
  assetId: string,
): string {
  const trimmed = (ticker ?? '').trim();
  if (trimmed === '') return `id:${assetId}`;
  return `ticker:${resolveCanonicalTicker(trimmed)}`;
}

function isDecimal(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function subtractDecimal(a: string, b: string): string {
  const [ai = '', af = ''] = a.split('.');
  const [bi = '', bf = ''] = b.split('.');
  const scale = Math.max(af.length, bf.length);
  const pad = (int: string, frac: string): string => `${int}${frac.padEnd(scale, '0')}`;
  const left =
    BigInt(pad(ai === '' ? '0' : ai.replace('-', ''), af)) * (ai.startsWith('-') ? -1n : 1n);
  const right =
    BigInt(pad(bi === '' ? '0' : bi.replace('-', ''), bf)) * (bi.startsWith('-') ? -1n : 1n);
  const diff = left - right;
  const negative = diff < 0n;
  const abs = (negative ? -diff : diff).toString().padStart(scale + 1, '0');
  if (scale === 0) {
    return `${negative ? '-' : ''}${abs}`;
  }
  const intPart = abs.slice(0, -scale) || '0';
  const fracPart = abs.slice(-scale).replace(/0+$/, '');
  const canonical = fracPart === '' ? intPart : `${intPart}.${fracPart}`;
  return negative && canonical !== '0' ? `-${canonical}` : canonical;
}

export function reconcilePositions(
  ledger: LedgerPositionRow[],
  snapshot: SourceSnapshotRow[],
): { entries: readonly ReconciliationEntry[]; summary: ReconciliationSummary } {
  const ledgerByAsset = new Map(ledger.map((row) => [row.assetId, row]));
  const snapshotByAsset = new Map(snapshot.map((row) => [row.assetId, row]));
  const assetIds = [...new Set([...ledgerByAsset.keys(), ...snapshotByAsset.keys()])].sort();

  const entries: ReconciliationEntry[] = assetIds.map((assetId) => {
    const ledgerRow = ledgerByAsset.get(assetId);
    const snapshotRow = snapshotByAsset.get(assetId);
    const ticker = ledgerRow?.ticker ?? snapshotRow?.ticker;

    if (!ledgerRow) {
      return {
        assetId,
        ...(ticker ? { ticker } : {}),
        ledgerQuantity: null,
        sourceQuantity: snapshotRow!.quantity,
        delta: null,
        status: 'MISSING_LOCAL' as const,
      };
    }
    if (!snapshotRow) {
      return {
        assetId,
        ...(ticker ? { ticker } : {}),
        ledgerQuantity: ledgerRow.quantity,
        sourceQuantity: null,
        delta: null,
        status: 'MISSING_SOURCE' as const,
      };
    }
    if (!isDecimal(ledgerRow.quantity) || !isDecimal(snapshotRow.quantity)) {
      return {
        assetId,
        ...(ticker ? { ticker } : {}),
        ledgerQuantity: ledgerRow.quantity,
        sourceQuantity: snapshotRow.quantity,
        delta: null,
        status: 'UNRESOLVED' as const,
      };
    }
    const ledgerQty = normalizeDecimalValue(ledgerRow.quantity);
    const sourceQty = normalizeDecimalValue(snapshotRow.quantity);
    if (ledgerQty === sourceQty) {
      return {
        assetId,
        ...(ticker ? { ticker } : {}),
        ledgerQuantity: ledgerRow.quantity,
        sourceQuantity: snapshotRow.quantity,
        delta: '0',
        status: 'MATCHED' as const,
      };
    }
    return {
      assetId,
      ...(ticker ? { ticker } : {}),
      ledgerQuantity: ledgerRow.quantity,
      sourceQuantity: snapshotRow.quantity,
      delta: subtractDecimal(sourceQty, ledgerQty),
      status: 'DIVERGENT' as const,
    };
  });

  const summary: ReconciliationSummary = {
    totalAssets: entries.length,
    matched: entries.filter((entry) => entry.status === 'MATCHED').length,
    divergent: entries.filter((entry) => entry.status === 'DIVERGENT').length,
    missingLocal: entries.filter((entry) => entry.status === 'MISSING_LOCAL').length,
    missingSource: entries.filter((entry) => entry.status === 'MISSING_SOURCE').length,
    unresolved: entries.filter((entry) => entry.status === 'UNRESOLVED').length,
  };

  return {
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    summary: Object.freeze(summary),
  };
}
