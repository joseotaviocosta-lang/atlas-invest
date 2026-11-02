/**
 * Shared ledger/evidence adapters into TaxCostResolution inputs (CTE-4).
 *
 * Single canonical implementation consumed by the fiscal enrichment seam and
 * the cost-evidence assessment read model. Structural minimal inputs — no
 * Prisma, repository or engine-state imports — so the resolver stays pure.
 * Facts only: absent fields flow through and fail closed in the resolver;
 * nothing is defaulted or zero-filled here.
 */
import type {
  TaxResolutionEvidenceRowInput,
  TaxResolutionLedgerLotInput,
} from './resolution';

export interface LedgerTransactionLike {
  readonly id?: unknown;
  readonly accountId?: unknown;
  readonly assetId?: unknown;
  readonly type?: string;
  readonly quantity?: { value?: unknown };
  readonly unitPrice?: { amount?: unknown } | null;
  readonly assignedCost?: { amount?: unknown } | null;
  readonly tradeDate?: { toString?: () => string } | string;
  readonly currency?: unknown;
}

export interface EvidenceRowLike {
  readonly id: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly acquisitionDate: string;
  readonly quantityCovered: string;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
  readonly currency: string;
  readonly evidenceType: string;
  readonly sourceReference: string;
  readonly version: number;
  readonly supersedesId: string | null;
  readonly fingerprint: string;
  readonly status: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: Date | null;
}

/**
 * BUY / SUBSCRIPTION / assigned BONUS become dated cost lots.
 * TRANSFER_* carried cost is not reconstructible from rows alone, so those
 * scopes stay PARTIAL/BLOCKED unless evidence covers them (fail-closed,
 * ADR-312). SELL/FEE/TAX/others never contribute cost.
 */
export function toTaxResolutionLedgerLots(
  transactions: readonly LedgerTransactionLike[],
  scope: { accountId: string; assetId: string },
): TaxResolutionLedgerLotInput[] {
  const lots: TaxResolutionLedgerLotInput[] = [];
  for (const tx of transactions) {
    if (String(tx.accountId) !== scope.accountId || String(tx.assetId) !== scope.assetId) {
      continue;
    }
    const tradeDate = typeof tx.tradeDate === 'string' ? tx.tradeDate : tx.tradeDate?.toString?.() ?? '';
    const base = {
      transactionId: String(tx.id ?? ''),
      quantity: String(tx.quantity?.value ?? ''),
      acquisitionDate: tradeDate,
      currency: String(tx.currency ?? ''),
    };
    if (tx.type === 'BUY' || tx.type === 'SUBSCRIPTION') {
      const unit = tx.unitPrice?.amount;
      lots.push({
        ...base,
        ...(unit !== undefined && unit !== null ? { unitCost: String(unit) } : {}),
      });
    } else if (tx.type === 'BONUS' && tx.assignedCost?.amount !== undefined && tx.assignedCost?.amount !== null) {
      lots.push({ ...base, totalCost: String(tx.assignedCost.amount) });
    }
  }
  return lots;
}

export function toTaxResolutionEvidenceRows(
  rows: readonly EvidenceRowLike[],
): TaxResolutionEvidenceRowInput[] {
  return rows.map((row) => ({
    evidenceId: row.id,
    evidenceVersion: row.version,
    evidenceFingerprint: row.fingerprint,
    evidenceType: row.evidenceType,
    accountId: row.accountId,
    assetId: row.assetId,
    acquisitionDate: row.acquisitionDate,
    quantityCovered: row.quantityCovered,
    unitCost: row.unitCost,
    totalCost: row.totalCost,
    currency: row.currency,
    status: row.status,
    supersedesId: row.supersedesId,
    verifiedBy: row.confirmedBy,
    verifiedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  }));
}
