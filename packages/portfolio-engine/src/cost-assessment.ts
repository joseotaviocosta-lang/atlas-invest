/**
 * Historical cost-basis coverage assessment (ADR-310).
 *
 * Pure read-side derivation: combines the ledger-derived known cost lots
 * with VERIFIED historical cost-evidence lots into a coverage assessment.
 * NEVER mutates transactions, NEVER changes canonical `costBasisStatus`,
 * NEVER feeds the tax engine (TAX_COST_ENRICHMENT_NOT_ENABLED).
 *
 * Safety direction is always conservative: ambiguous evidence is excluded
 * (understating coverage) rather than summed (which could overstate it).
 * Over-coverage fails closed with status BLOCKED.
 */
import {
  Currency,
  InvalidCostEvidenceError,
  Money,
  Quantity,
  Transaction,
  assertValidCurrency,
  computeCostLotKey,
  coveragePercent,
} from '@atlas/domain';
import type { CostBasisStatus } from './types';

export interface LedgerKnownLot {
  readonly assetId: string;
  readonly accountId: string;
  readonly tradeDate: string;
  readonly quantity: Quantity;
  readonly unitPrice?: Money;
  readonly totalCost: Money;
  readonly currency: Currency;
}

export interface VerifiedEvidenceLot {
  readonly evidenceId: string;
  readonly assetId: string;
  readonly accountId: string;
  readonly acquisitionDate: string;
  readonly quantityCovered: Quantity;
  readonly unitCost?: Money;
  readonly totalCost: Money;
  readonly currency: Currency;
  readonly evidenceType: string;
  readonly sourceReference: string;
  readonly createdAt: Date;
}

/**
 * Maps a persistence-shaped evidence row to an engine lot without importing
 * database types (structural typing keeps the dependency direction clean).
 * Rows without a total cost are rejected — cost must never be fabricated.
 */
export function toVerifiedEvidenceLot(row: {
  id: string;
  assetId: string;
  accountId: string;
  acquisitionDate: string;
  quantityCovered: string;
  unitCost: string | null;
  totalCost: string | null;
  currency: string;
  evidenceType: string;
  sourceReference: string;
  createdAt: Date;
}): VerifiedEvidenceLot {
  if (row.totalCost === null) {
    throw new InvalidCostEvidenceError(`Verified evidence '${row.id}' has no total cost`);
  }
  return {
    evidenceId: row.id,
    assetId: row.assetId,
    accountId: row.accountId,
    acquisitionDate: row.acquisitionDate,
    quantityCovered: Quantity.from(row.quantityCovered),
    unitCost: row.unitCost ? Money.from(row.unitCost, row.currency) : undefined,
    totalCost: Money.from(row.totalCost, row.currency),
    currency: assertValidCurrency(row.currency),
    evidenceType: row.evidenceType,
    sourceReference: row.sourceReference,
    createdAt: row.createdAt,
  };
}

export type CostAssessmentStatus = 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' | 'BLOCKED';

export interface CostAssessmentIssue {
  readonly code: string;
  readonly message: string;
  readonly evidenceIds?: string[];
}

export interface CostBasisAssessment {
  readonly status: CostAssessmentStatus;
  readonly positionQuantity: string;
  readonly ledgerKnownQuantity: string;
  readonly evidenceCoveredQuantity: string;
  readonly totalCoveredQuantity: string;
  readonly uncoveredQuantity: string;
  readonly coveragePercent: string;
  readonly verifiedKnownCost: Array<{ amount: string; currency: string }>;
  readonly averageKnownCostForCoveredQuantity: { amount: string; currency: string } | null;
  readonly appliedEvidenceIds: string[];
  readonly redundantEvidenceIds: string[];
  readonly duplicateEvidenceIds: string[];
  readonly issues: CostAssessmentIssue[];
}

/**
 * Sums ledger-derived known-cost lots for one asset scope. Only transaction
 * kinds carrying explicit acquisition cost qualify (BUY, SUBSCRIPTION,
 * BONUS with assignedCost). Matched TRANSFER_IN legs with carried cost are
 * deliberately EXCLUDED in v1 (documented limitation): understating known
 * coverage is fail-closed-safe, overstating it is not.
 */
export function summarizeLedgerKnownLots(
  transactions: Transaction[],
  scope: { assetId: string; accountId?: string },
): LedgerKnownLot[] {
  const lots: LedgerKnownLot[] = [];
  for (const tx of transactions) {
    if (!('assetId' in tx) || String(tx.assetId) !== scope.assetId) continue;
    if (scope.accountId !== undefined && String(tx.accountId) !== scope.accountId) continue;
    if (tx.type === 'BUY' || tx.type === 'SUBSCRIPTION') {
      lots.push({
        assetId: String(tx.assetId),
        accountId: String(tx.accountId),
        tradeDate: tx.tradeDate.toString(),
        quantity: tx.quantity,
        unitPrice: tx.unitPrice,
        totalCost: tx.unitPrice.multiply(tx.quantity.value),
        currency: tx.currency,
      });
    } else if (tx.type === 'BONUS' && tx.assignedCost) {
      lots.push({
        assetId: String(tx.assetId),
        accountId: String(tx.accountId),
        tradeDate: tx.tradeDate.toString(),
        quantity: tx.quantity,
        unitPrice: tx.assignedCost.divide(tx.quantity.value),
        totalCost: tx.assignedCost,
        currency: tx.currency,
      });
    }
  }
  return lots;
}

function redundancyKey(assetId: string, accountId: string, date: string, qty: string): string {
  return [assetId, accountId, date, qty].join('|');
}

export function buildCostBasisAssessment(input: {
  positionQuantity: Quantity;
  positionCurrency?: Currency;
  ledgerLots: LedgerKnownLot[];
  evidence: VerifiedEvidenceLot[];
}): CostBasisAssessment {
  const positionQty = input.positionQuantity;
  const ledgerQty = input.ledgerLots.reduce(
    (acc, lot) => acc.add(lot.quantity),
    Quantity.zero(),
  );

  // Deterministic evidence order: oldest confirmation input first.
  const ordered = [...input.evidence].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.evidenceId < b.evidenceId ? -1 : 1),
  );

  // Ledger-lot redundancy index (PART L): same asset+account+date+quantity
  // means the evidence restates an already-known lot — excluded, warned.
  const ledgerKeys = new Set(
    input.ledgerLots.map((lot) =>
      redundancyKey(lot.assetId, lot.accountId, lot.tradeDate, lot.quantity.value),
    ),
  );

  const seenLotKeys = new Set<string>();
  const applied: VerifiedEvidenceLot[] = [];
  const redundant: string[] = [];
  const duplicates: string[] = [];
  for (const ev of ordered) {
    if (ledgerKeys.has(redundancyKey(ev.assetId, ev.accountId, ev.acquisitionDate, ev.quantityCovered.value))) {
      redundant.push(ev.evidenceId);
      continue;
    }
    const key = computeCostLotKey({
      assetId: ev.assetId,
      accountId: ev.accountId,
      acquisitionDate: ev.acquisitionDate,
      quantityCovered: ev.quantityCovered.value,
      unitCost: ev.unitCost?.amount,
      totalCost: ev.totalCost.amount,
      currency: ev.currency,
    });
    if (seenLotKeys.has(key)) {
      duplicates.push(ev.evidenceId);
      continue;
    }
    seenLotKeys.add(key);
    applied.push(ev);
  }

  const evidenceQty = applied.reduce((acc, ev) => acc.add(ev.quantityCovered), Quantity.zero());
  const covered = ledgerQty.add(evidenceQty);
  const issues: CostAssessmentIssue[] = [];
  if (redundant.length > 0) {
    issues.push({
      code: 'EVIDENCE_REDUNDANT',
      message: `${redundant.length} evidence record(s) restate ledger-known lots and were excluded from coverage`,
      evidenceIds: [...redundant],
    });
  }
  if (duplicates.length > 0) {
    issues.push({
      code: 'EVIDENCE_LOT_DUPLICATE',
      message: `${duplicates.length} evidence record(s) describe an already-covered lot and were excluded from coverage`,
      evidenceIds: [...duplicates],
    });
  }

  if (covered.compare(positionQty) > 0) {
    return {
      status: 'BLOCKED',
      positionQuantity: positionQty.value,
      ledgerKnownQuantity: ledgerQty.value,
      evidenceCoveredQuantity: evidenceQty.value,
      totalCoveredQuantity: covered.value,
      uncoveredQuantity: Quantity.zero().value,
      coveragePercent: '100.00',
      verifiedKnownCost: [],
      averageKnownCostForCoveredQuantity: null,
      appliedEvidenceIds: applied.map((ev) => ev.evidenceId),
      redundantEvidenceIds: redundant,
      duplicateEvidenceIds: duplicates,
      issues: [
        ...issues,
        {
          code: 'COST_EVIDENCE_OVER_COVERAGE',
          message: `Verified coverage '${covered.value}' exceeds position quantity '${positionQty.value}'. Coverage is blocked until evidence is corrected.`,
        },
      ],
    };
  }

  const uncovered = positionQty.subtract(covered);
  const perCurrency = new Map<Currency, Money>();
  const addCost = (money: Money) => {
    const prev = perCurrency.get(money.currency);
    perCurrency.set(money.currency, prev ? prev.add(money) : money);
  };
  for (const lot of input.ledgerLots) addCost(lot.totalCost);
  for (const ev of applied) addCost(ev.totalCost);
  const verifiedKnownCost = [...perCurrency.entries()].map(([currency, money]) => ({
    amount: money.amount,
    currency,
  }));
  const averageKnownCostForCoveredQuantity =
    perCurrency.size === 1 && !covered.isZero()
      ? (() => {
          const [currency, money] = [...perCurrency.entries()][0]!;
          return { amount: money.divide(covered.value).amount, currency };
        })()
      : null;

  const finalStatus: CostBasisAssessment['status'] =
    uncovered.isZero() ? 'COMPLETE' : covered.isZero() ? 'INCOMPLETE' : 'PARTIAL';

  return {
    status: finalStatus,
    positionQuantity: positionQty.value,
    ledgerKnownQuantity: ledgerQty.value,
    evidenceCoveredQuantity: evidenceQty.value,
    totalCoveredQuantity: covered.value,
    uncoveredQuantity: uncovered.value,
    coveragePercent: positionQty.isZero() ? '100.00' : coveragePercent(covered, positionQty),
    verifiedKnownCost,
    averageKnownCostForCoveredQuantity,
    appliedEvidenceIds: applied.map((ev) => ev.evidenceId),
    redundantEvidenceIds: redundant,
    duplicateEvidenceIds: duplicates,
    issues,
  };
}

/** Type-guard helper so API/UI layers branch on frozen canonical statuses. */
export function isCanonicalCostStatus(value: string): value is CostBasisStatus {
  return value === 'KNOWN' || value === 'INCOMPLETE';
}
