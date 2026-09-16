import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Quantity,
  Transaction,
} from '@atlas/domain';
import { PortfolioState, AccountState, AssetState, ReplayResult, ReplayOptions } from './types';
import { PORTFOLIO_ENGINE_VERSION } from './version';
import { compareTransactionsChronologically } from './ordering';
import { ReplayContext, dispatchTransaction } from './dispatcher';
import { CrossPortfolioTransactionError, DuplicateTransactionError } from './errors';

/**
 * Pure, deterministic, stateless Portfolio Replay Engine.
 * Reconstructs derived portfolio and account state by evaluating ledger transactions.
 */
export class PortfolioReplayEngine {
  readonly version = PORTFOLIO_ENGINE_VERSION;

  /**
   * Replays a sequence of transactions for a portfolio up to an optional as-of date.
   *
   * Invariants guaranteed:
   * - Deterministic output: 1,000 runs produce identical results.
   * - Input immutability: The source transaction array is never mutated.
   * - Output immutability: All returned maps, arrays, and objects are deeply frozen.
   * - Canonical ordering: Events are ordered by (tradeDate, createdAt, id).
   * - Zero IEEE 754 float: Exact decimal quantity arithmetic throughout.
   */
  replay(options: ReplayOptions): ReplayResult {
    const portfolioId = createPortfolioId(String(options.portfolioId));
    const asOfDate = options.asOfDate
      ? options.asOfDate instanceof LocalDate
        ? options.asOfDate
        : LocalDate.from(String(options.asOfDate))
      : undefined;

    const rawTransactions = options.transactions;

    // 1. Input Integrity: Validate portfolio isolation and detect duplicate IDs
    const seenIds = new Set<string>();
    for (const tx of rawTransactions) {
      const txId = String(tx.id);
      if (seenIds.has(txId)) {
        throw new DuplicateTransactionError(txId);
      }
      seenIds.add(txId);

      if (String(tx.portfolioId) !== String(portfolioId)) {
        throw new CrossPortfolioTransactionError(String(portfolioId), txId, String(tx.portfolioId));
      }
    }

    // 2. Filter by asOfDate on a shallow copy to guarantee input immutability
    const filtered: Transaction[] = [];
    for (const tx of rawTransactions) {
      if (asOfDate) {
        if (tx.tradeDate.compare(asOfDate) <= 0) {
          filtered.push(tx);
        }
      } else {
        filtered.push(tx);
      }
    }

    // 3. Canonical Sorting: Sort copy according to the deterministic 3-tuple
    filtered.sort(compareTransactionsChronologically);

    // 4. Execution: Dispatch each transaction to internal replay context
    const ctx = new ReplayContext(portfolioId);
    for (const tx of filtered) {
      dispatchTransaction(ctx, tx);
    }

    // 5. Finalize Immutable Derived State
    const accountsMap = new Map<string, AccountState>();
    const aggregatedQuantities = new Map<string, Quantity>();

    for (const [accIdStr, assetMap] of ctx.accounts.entries()) {
      const accountAssets = new Map<string, AssetState>();

      for (const [assetIdStr, qty] of assetMap.entries()) {
        if (!qty.isZero()) {
          const assetState: AssetState = Object.freeze({
            assetId: createAssetId(assetIdStr),
            quantity: qty,
          });
          accountAssets.set(assetIdStr, assetState);

          // Aggregate for portfolio view
          const currentAgg = aggregatedQuantities.get(assetIdStr) ?? Quantity.zero();
          aggregatedQuantities.set(assetIdStr, currentAgg.add(qty));
        }
      }

      const accountState: AccountState = Object.freeze({
        accountId: createAccountId(accIdStr),
        assets: Object.freeze(accountAssets),
      });
      accountsMap.set(accIdStr, accountState);
    }

    // Build portfolio aggregated asset state
    const portfolioAssetsMap = new Map<string, AssetState>();
    for (const [assetIdStr, totalQty] of aggregatedQuantities.entries()) {
      if (!totalQty.isZero()) {
        portfolioAssetsMap.set(
          assetIdStr,
          Object.freeze({
            assetId: createAssetId(assetIdStr),
            quantity: totalQty,
          }),
        );
      }
    }

    const portfolioState: PortfolioState = Object.freeze({
      portfolioId,
      asOfDate,
      accounts: Object.freeze(accountsMap),
      assets: Object.freeze(portfolioAssetsMap),
      processedTransactionCount: filtered.length,
      appliedTransactionCount: ctx.appliedTransactions.length,
      deferredTransactionCount: ctx.deferredEvents.length,
    });

    return Object.freeze({
      engineVersion: this.version,
      state: portfolioState,
      appliedTransactions: Object.freeze([...ctx.appliedTransactions]),
      deferredEvents: Object.freeze([...ctx.deferredEvents]),
      totalProcessedCount: filtered.length,
    });
  }
}

/**
 * Factory function for creating a new stateless PortfolioReplayEngine instance.
 */
export function createPortfolioReplayEngine(): PortfolioReplayEngine {
  return new PortfolioReplayEngine();
}

/**
 * Convenience functional entry-point to execute a deterministic replay.
 */
export function replayPortfolio(options: ReplayOptions): ReplayResult {
  const engine = new PortfolioReplayEngine();
  return engine.replay(options);
}
