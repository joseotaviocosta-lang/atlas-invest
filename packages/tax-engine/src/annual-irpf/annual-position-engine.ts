import {
  AssetId,
  createTransactionId,
  Currency,
  isValidUUID,
  Money,
  PortfolioId,
  Transaction,
  TransactionFactory,
} from '@atlas/domain';
import { PortfolioReplayEngine, AppliedCorporateAction } from '@atlas/portfolio-engine';
import { TaxSubjectId } from '../ids';
import { TaxAssetCategory } from '../types';
import { isTaxCategorySupportedInPhase4A, resolveTaxAssetCategory } from '../asset-classification';
import { TAX_ENGINE_VERSION } from '../version';
import {
  AnnualPosition,
  AnnualPositionBlockingReason,
  AnnualPositionCompleteness,
  AnnualPositionReport,
  AnnualPositionSummary,
  AnnualPositionTrace,
} from './annual-position';
import { AnnualOpeningPositionInput } from './annual-opening-position';
import {
  AnnualTaxPeriod,
  CalendarYear,
  DeclarationExercise,
  createAnnualTaxPeriod,
  parseCalendarYear,
} from './annual-period';
import { InvalidAnnualTaxPeriodError } from '../errors';

export interface AssetMetadata {
  readonly ticker?: string;
  readonly category?: TaxAssetCategory;
  readonly supported?: boolean;
}

export type AssetMetadataResolver = (assetId: AssetId) => AssetMetadata | undefined;

export interface BuildAnnualPositionReportInput {
  readonly taxSubjectId: TaxSubjectId;
  readonly portfolioId: PortfolioId;
  readonly calendarYear: CalendarYear | number;
  readonly declarationExercise?: DeclarationExercise | number;
  readonly transactions: readonly Transaction[];
  readonly openingPositions?: readonly AnnualOpeningPositionInput[];
  readonly assetMetadataResolver?: AssetMetadataResolver;
}

/**
 * Builds an authoritative Annual Position Report at December 31st of the calendar year.
 *
 * Deterministic, pure, zero-I/O:
 * 1. Projects portfolio state strictly using PortfolioReplayEngine replay at YYYY-12-31.
 * 2. Incorporates confirmed opening positions for pre-Atlas holdings.
 * 3. Enforces historical acquisition cost (NEVER market valuation).
 * 4. Fails closed on incomplete cost basis or historical overlaps.
 * 5. Strictly distinguishes unknown != zero.
 * 6. Omits zero-quantity custody positions.
 */
export function buildAnnualPositionReport(
  input: BuildAnnualPositionReportInput,
): AnnualPositionReport {
  if (!input.taxSubjectId) {
    throw new InvalidAnnualTaxPeriodError(
      'TaxSubjectId is required to build annual position report.',
    );
  }
  if (!input.portfolioId) {
    throw new InvalidAnnualTaxPeriodError(
      'PortfolioId is required to build annual position report.',
    );
  }

  const calendarYear =
    typeof input.calendarYear === 'number'
      ? (parseCalendarYear(input.calendarYear) ??
        (() => {
          throw new InvalidAnnualTaxPeriodError(`Invalid calendar year: ${input.calendarYear}`);
        })())
      : input.calendarYear;

  const period: AnnualTaxPeriod = createAnnualTaxPeriod(
    calendarYear,
    input.declarationExercise,
  );
  const cutoffDate = period.endDate; // YYYY-12-31

  // Filter transactions for this portfolio
  const portfolioTxs = input.transactions.filter(
    (tx) => String(tx.portfolioId) === String(input.portfolioId),
  );

  // Group opening positions by asset
  const allOpeningPositions = (input.openingPositions ?? []).filter(
    (op) => String(op.portfolioId) === String(input.portfolioId),
  );

  const confirmedOpeningByAsset = new Map<string, AnnualOpeningPositionInput>();
  const draftOpeningByAsset = new Map<string, AnnualOpeningPositionInput[]>();

  for (const op of allOpeningPositions) {
    const assetKey = String(op.assetId);
    if (op.status === 'CONFIRMED' && op.effectiveDate.compare(cutoffDate) <= 0) {
      const existing = confirmedOpeningByAsset.get(assetKey);
      if (!existing || op.revision > existing.revision) {
        confirmedOpeningByAsset.set(assetKey, op);
      }
    } else if (op.status === 'DRAFT') {
      const drafts = draftOpeningByAsset.get(assetKey) ?? [];
      drafts.push(op);
      draftOpeningByAsset.set(assetKey, drafts);
    }
  }

  // Detect overlaps and unconfirmed opening positions
  const assetBlockingMap = new Map<string, Set<AnnualPositionBlockingReason>>();
  const appliedOpeningPositions = new Map<string, AnnualOpeningPositionInput>();

  for (const [assetKey, op] of confirmedOpeningByAsset.entries()) {
    // Check if there are ledger transactions for this asset on or before opening effectiveDate
    const priorLedgerTxs = portfolioTxs.filter(
      (tx) =>
        'assetId' in tx &&
        tx.assetId &&
        String(tx.assetId) === assetKey &&
        tx.tradeDate.compare(op.effectiveDate) <= 0,
    );

    if (priorLedgerTxs.length > 0) {
      let reasons = assetBlockingMap.get(assetKey);
      if (!reasons) {
        reasons = new Set();
        assetBlockingMap.set(assetKey, reasons);
      }
      reasons.add('OVERLAPPING_OPENING_AND_LEDGER_HISTORY');
    } else {
      appliedOpeningPositions.set(assetKey, op);
    }
  }

  for (const [assetKey] of draftOpeningByAsset.entries()) {
    let reasons = assetBlockingMap.get(assetKey);
    if (!reasons) {
      reasons = new Set();
      assetBlockingMap.set(assetKey, reasons);
    }
    reasons.add('UNCONFIRMED_OPENING_POSITION');
  }

  // Synthesize transactions for valid non-overlapping opening positions
  const syntheticOpeningTxs: Transaction[] = [];
  const zeroCostOpeningAssets = new Set<string>();
  for (const [assetKey, op] of appliedOpeningPositions.entries()) {
    // Convert opening position to initial BUY transaction with exact quantity and total cost
    const isZeroCost = op.totalHistoricalCost.isZero();
    if (isZeroCost) {
      zeroCostOpeningAssets.add(assetKey);
    }
    const unitPrice = isZeroCost
      ? Money.from('0.000000000000000001', op.currency)
      : op.totalHistoricalCost.divide(op.quantity);
    const syntheticTx = TransactionFactory.createBuy({
      id: createTransactionId(isValidUUID(op.id) ? op.id : undefined),
      portfolioId: String(input.portfolioId),
      accountId: String(op.accountId),
      assetId: assetKey,
      tradeDate: op.effectiveDate,
      quantity: op.quantity,
      unitPrice,
      currency: op.currency,
      source: 'MANUAL',
      notes: `Annual opening position (rev ${op.revision})`,
      createdAt: new Date(0), // ensures canonical sorting places this first on tradeDate
    });
    syntheticOpeningTxs.push(syntheticTx);
  }

  const allReplayTxs = [...syntheticOpeningTxs, ...portfolioTxs];

  // Execute deterministic portfolio replay at year-end cutoff (YYYY-12-31)
  const replayEngine = new PortfolioReplayEngine();
  const replayResult = replayEngine.replay({
    portfolioId: input.portfolioId,
    transactions: allReplayTxs,
    asOfDate: cutoffDate,
  });
  const replayState = replayResult.state;

  const annualPositions: AnnualPosition[] = [];
  let totalKnownCostInBrl = Money.zero('BRL');
  let hasIncompleteCost = false;

  // Process all assets with non-zero custody on 31/12
  const sortedAssetKeys = Array.from(replayState.assets.keys()).sort();

  for (const assetKey of sortedAssetKeys) {
    const assetState = replayState.assets.get(assetKey);
    if (!assetState || assetState.quantity.isZero()) {
      continue;
    }

    const metadata = input.assetMetadataResolver?.(assetState.assetId);
    const assetCategory: TaxAssetCategory = metadata?.category ?? resolveTaxAssetCategory('STOCK');

    const existingBlockingReasons = assetBlockingMap.get(assetKey);
    const blockingReasonsSet = new Set<AnnualPositionBlockingReason>(
      existingBlockingReasons ? Array.from(existingBlockingReasons) : [],
    );

    if (assetState.costBasisStatus === 'INCOMPLETE' || !assetState.totalCost) {
      blockingReasonsSet.add('UNKNOWN_COST_BASIS');
    }

    const isCategorySupported = isTaxCategorySupportedInPhase4A(assetCategory);
    const isExplicitlySupported = metadata?.supported ?? isCategorySupported;
    if (!isCategorySupported || !isExplicitlySupported) {
      blockingReasonsSet.add('UNSUPPORTED_ASSET_CLASS');
    }

    const blockingReasons = Object.freeze(Array.from(blockingReasonsSet));

    let completenessStatus: AnnualPositionCompleteness = 'COMPLETE';
    if (
      blockingReasons.includes('UNKNOWN_COST_BASIS') ||
      blockingReasons.includes('OVERLAPPING_OPENING_AND_LEDGER_HISTORY') ||
      blockingReasons.includes('UNSUPPORTED_ASSET_CLASS')
    ) {
      completenessStatus = 'BLOCKED';
    } else if (blockingReasons.includes('UNCONFIRMED_OPENING_POSITION')) {
      completenessStatus = 'REQUIRES_CONFIRMATION';
    } else if (blockingReasons.length > 0) {
      completenessStatus = 'PARTIAL';
    }

    // Count transactions and corporate actions for audit trace
    const assetTxsCount = portfolioTxs.filter(
      (tx) =>
        'assetId' in tx &&
        tx.assetId &&
        String(tx.assetId) === assetKey &&
        tx.tradeDate.compare(cutoffDate) <= 0,
    ).length;

    const isCostKnown =
      completenessStatus === 'COMPLETE' &&
      assetState.costBasisStatus === 'KNOWN' &&
      assetState.totalCost !== undefined;

    let totalHistoricalCost: Money | null = null;
    let averageHistoricalCost: Money | null = null;
    if (isCostKnown) {
      if (zeroCostOpeningAssets.has(assetKey) && assetTxsCount === 0) {
        totalHistoricalCost = Money.zero(assetState.currency ?? 'BRL');
        averageHistoricalCost = Money.zero(assetState.currency ?? 'BRL');
      } else {
        totalHistoricalCost = assetState.totalCost!;
        averageHistoricalCost = assetState.averageCost ?? null;
      }
    }

    if (isCostKnown && totalHistoricalCost) {
      if (totalHistoricalCost.currency === 'BRL') {
        totalKnownCostInBrl = totalKnownCostInBrl.add(totalHistoricalCost);
      }
    } else {
      hasIncompleteCost = true;
    }

    const corporateActionsCount = replayState.appliedCorporateActions.filter(
      (ca: AppliedCorporateAction) => String(ca.assetId) === assetKey,
    ).length;

    const openingApplied = appliedOpeningPositions.has(assetKey);
    const appliedOp = appliedOpeningPositions.get(assetKey);

    const trace: AnnualPositionTrace = Object.freeze({
      appliedTransactionCount: assetTxsCount,
      corporateActionCount: corporateActionsCount,
      openingPositionApplied: openingApplied,
      provenanceSummary: openingApplied
        ? `Opening position rev ${appliedOp ? String(appliedOp.revision) : '1'} + ${assetTxsCount} ledger txs (${corporateActionsCount} corp actions)`
        : `${assetTxsCount} ledger transactions (${corporateActionsCount} corporate actions)`,
    });

    const position: AnnualPosition = Object.freeze({
      taxSubjectId: input.taxSubjectId,
      portfolioId: input.portfolioId,
      calendarYear,
      declarationExercise: period.declarationExercise,
      asOfDate: cutoffDate,
      assetId: assetState.assetId,
      ticker: metadata?.ticker,
      assetCategory,
      quantity: assetState.quantity,
      totalHistoricalCost,
      averageHistoricalCost,
      currency: (assetState.currency ?? 'BRL') as Currency,
      costBasisStatus: assetState.costBasisStatus,
      completenessStatus,
      blockingReasons,
      openingPositionApplied: openingApplied,
      openingPositionId: appliedOp ? appliedOp.id : undefined,
      trace,
    });

    annualPositions.push(position);
  }

  // Process any draft opening positions that have no active ledger custody
  for (const [assetKey, drafts] of draftOpeningByAsset.entries()) {
    if (replayState.assets.has(assetKey) || drafts.length === 0) {
      continue;
    }

    const draftOp = drafts[drafts.length - 1]!;
    hasIncompleteCost = true;

    const metadata = input.assetMetadataResolver?.(draftOp.assetId);
    const assetCategory: TaxAssetCategory = metadata?.category ?? resolveTaxAssetCategory('STOCK');

    const blockingReasons: readonly AnnualPositionBlockingReason[] = Object.freeze([
      'UNCONFIRMED_OPENING_POSITION',
    ]);

    const trace: AnnualPositionTrace = Object.freeze({
      appliedTransactionCount: 0,
      corporateActionCount: 0,
      openingPositionApplied: false,
      provenanceSummary: `Draft opening position rev ${draftOp.revision} (unconfirmed)`,
    });

    const position: AnnualPosition = Object.freeze({
      taxSubjectId: input.taxSubjectId,
      portfolioId: input.portfolioId,
      calendarYear,
      declarationExercise: period.declarationExercise,
      asOfDate: cutoffDate,
      assetId: draftOp.assetId,
      ticker: metadata?.ticker,
      assetCategory,
      quantity: draftOp.quantity,
      totalHistoricalCost: null,
      averageHistoricalCost: null,
      currency: draftOp.currency,
      costBasisStatus: 'INCOMPLETE',
      completenessStatus: 'REQUIRES_CONFIRMATION',
      blockingReasons,
      openingPositionApplied: false,
      openingPositionId: draftOp.id,
      trace,
    });

    annualPositions.push(position);
  }

  // Summary counts
  const completeCount = annualPositions.filter((p) => p.completenessStatus === 'COMPLETE').length;
  const blockedCount = annualPositions.filter((p) => p.completenessStatus === 'BLOCKED').length;
  const requiresConfirmCount = annualPositions.filter(
    (p) => p.completenessStatus === 'REQUIRES_CONFIRMATION',
  ).length;

  let summaryCompleteness: AnnualPositionCompleteness = 'COMPLETE';
  if (annualPositions.length === 0) {
    summaryCompleteness = 'COMPLETE';
  } else if (completeCount === annualPositions.length) {
    summaryCompleteness = 'COMPLETE';
  } else if (blockedCount === annualPositions.length) {
    summaryCompleteness = 'BLOCKED';
  } else if (requiresConfirmCount > 0 && completeCount === 0 && blockedCount === 0) {
    summaryCompleteness = 'REQUIRES_CONFIRMATION';
  } else {
    summaryCompleteness = 'PARTIAL';
  }

  const summary: AnnualPositionSummary = Object.freeze({
    calendarYear,
    declarationExercise: period.declarationExercise,
    asOfDate: cutoffDate,
    totalAssetsCount: annualPositions.length,
    completePositionsCount: completeCount,
    blockedPositionsCount: blockedCount,
    requiresConfirmationCount: requiresConfirmCount,
    totalHistoricalCostKnown: hasIncompleteCost ? null : totalKnownCostInBrl,
    currency: 'BRL' as Currency,
    completenessStatus: summaryCompleteness,
  });

  return Object.freeze({
    taxSubjectId: input.taxSubjectId,
    portfolioId: input.portfolioId,
    period,
    positions: Object.freeze(annualPositions),
    summary,
    generatedAt: new Date(),
    version: TAX_ENGINE_VERSION,
  });
}
