/**
 * Shared documentary-coverage aggregation (single canonical implementation).
 *
 * Consumed by the CTI context builder. The notifications feed computes the
 * same projection through this helper — one logic, no drift.
 * Pure: exact decimal strings only, no I/O.
 */
import { Quantity, type Transaction } from '@atlas/domain';
import {
  buildCostBasisAssessment,
  summarizeLedgerKnownLots,
  toVerifiedEvidenceLot,
  type CostBasisAssessment,
  type LedgerKnownLot,
  type VerifiedEvidenceLot,
  type PortfolioState,
} from '@atlas/portfolio-engine';

export interface CoverageScopeDetail {
  readonly accountId: string;
  readonly assetId: string;
  readonly positionQuantity: string;
  readonly ledgerKnownQuantity: string;
  readonly evidenceCoveredQuantity: string;
  readonly uncoveredQuantity: string;
  readonly complete: boolean;
  readonly canonicalIncomplete: boolean;
  readonly latestLotDate: string | null;
}

export interface DocumentaryCoverageSummary {
  readonly scopes: readonly CoverageScopeDetail[];
  /** Headline counts below are DISTINCT ASSETS (user-facing positions). */
  readonly incompleteScopes: number;
  readonly partialScopes: number;
  readonly completeScopes: number;
  readonly canonicalIncompleteScopes: number;
  readonly incompleteAssets: number;
  readonly partialAssets: number;
  readonly completeAssets: number;
  readonly canonicalIncompleteAssets: number;
}

interface EvidenceRowLike {
  readonly id: string;
  readonly assetId: string;
  readonly accountId: string;
  readonly acquisitionDate: string;
  readonly quantityCovered: string;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
  readonly currency: string;
  readonly evidenceType: string;
  readonly sourceReference: string;
  readonly createdAt: Date;
  readonly status: string;
}

export function summarizeDocumentaryCoverage(input: {
  transactions: readonly Transaction[];
  replayState: PortfolioState;
  /** Current (non-superseded) evidence rows; only VERIFIED counts. */
  evidenceRows: readonly EvidenceRowLike[];
}): DocumentaryCoverageSummary {
  const verified: VerifiedEvidenceLot[] = input.evidenceRows
    .filter((row) => row.status === 'VERIFIED')
    .map((row) =>
      toVerifiedEvidenceLot({
        id: row.id,
        assetId: row.assetId,
        accountId: row.accountId,
        acquisitionDate: row.acquisitionDate,
        quantityCovered: row.quantityCovered,
        unitCost: row.unitCost,
        totalCost: row.totalCost,
        currency: row.currency,
        evidenceType: row.evidenceType,
        sourceReference: row.sourceReference,
        createdAt: row.createdAt,
      }),
    );

  const scopes: CoverageScopeDetail[] = [];
  for (const [accountId, acc] of input.replayState.accounts) {
    for (const [assetId, pos] of acc.assets) {
      if (pos.quantity.isZero()) continue;
      const ledgerLots: LedgerKnownLot[] = summarizeLedgerKnownLots([...input.transactions], {
        assetId,
        accountId,
      });
      const scopeEvidence = verified.filter(
        (ev) => ev.accountId === accountId && ev.assetId === assetId,
      );
      const assessment: CostBasisAssessment = buildCostBasisAssessment({
        positionQuantity: pos.quantity,
        ledgerLots,
        evidence: scopeEvidence,
      });
      let latest: string | null = null;
      for (const lot of ledgerLots) {
        if (latest === null || lot.tradeDate > latest) latest = lot.tradeDate;
      }
      scopes.push({
        accountId,
        assetId,
        positionQuantity: assessment.positionQuantity,
        ledgerKnownQuantity: assessment.ledgerKnownQuantity,
        evidenceCoveredQuantity: assessment.evidenceCoveredQuantity,
        uncoveredQuantity: assessment.uncoveredQuantity,
        complete: assessment.status === 'COMPLETE',
        canonicalIncomplete: pos.costBasisStatus === 'INCOMPLETE',
        latestLotDate: latest,
      });
    }
  }
  scopes.sort((a, b) =>
    a.accountId === b.accountId
      ? a.assetId.localeCompare(b.assetId)
      : a.accountId.localeCompare(b.accountId),
  );

  let incompleteScopes = 0;
  let partialScopes = 0;
  let completeScopes = 0;
  let canonicalIncompleteScopes = 0;
  for (const scope of scopes) {
    const uncovered = Quantity.from(scope.uncoveredQuantity);
    const covered = Quantity.from(scope.positionQuantity).subtract(uncovered);
    if (uncovered.isZero()) {
      completeScopes += 1;
    } else if (covered.isZero()) {
      incompleteScopes += 1;
    } else {
      partialScopes += 1;
    }
    if (scope.canonicalIncomplete) canonicalIncompleteScopes += 1;
  }

  // Asset-level aggregates: an asset is complete only when EVERY open scope
  // is complete; incomplete when NO scope has coverage; otherwise partial.
  // Zero-tests only — quantities across accounts are never summed as money.
  const byAsset = new Map<string, { uncovered: boolean; covered: boolean; canonical: boolean }>();
  for (const scope of scopes) {
    const slot = byAsset.get(scope.assetId) ?? { uncovered: false, covered: false, canonical: false };
    const uncovered = Quantity.from(scope.uncoveredQuantity);
    const covered = Quantity.from(scope.positionQuantity).subtract(uncovered);
    slot.uncovered = slot.uncovered || !uncovered.isZero();
    slot.covered = slot.covered || !covered.isZero();
    slot.canonical = slot.canonical || scope.canonicalIncomplete;
    byAsset.set(scope.assetId, slot);
  }
  let incompleteAssets = 0;
  let partialAssets = 0;
  let completeAssets = 0;
  let canonicalIncompleteAssets = 0;
  for (const slot of byAsset.values()) {
    if (!slot.uncovered) {
      completeAssets += 1;
    } else if (!slot.covered) {
      incompleteAssets += 1;
    } else {
      partialAssets += 1;
    }
    if (slot.canonical) canonicalIncompleteAssets += 1;
  }

  return Object.freeze({
    scopes: Object.freeze(scopes),
    incompleteScopes,
    partialScopes,
    completeScopes,
    canonicalIncompleteScopes,
    incompleteAssets,
    partialAssets,
    completeAssets,
    canonicalIncompleteAssets,
  });
}
