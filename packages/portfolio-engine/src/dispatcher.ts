import {
  Transaction,
  Quantity,
  PortfolioId,
  TradeTransaction,
  TransferTransaction,
} from '@atlas/domain';
import { DeferredPortfolioEvent } from './types';
import { NegativePositionError, UnsupportedTransactionStateError } from './errors';

/**
 * Internal mutable builder context used during a single replay run.
 * Isolated per replay execution; never exposed outside the engine.
 */
export class ReplayContext {
  readonly portfolioId: PortfolioId;
  /** accountId -> (assetId -> Quantity) */
  readonly accounts = new Map<string, Map<string, Quantity>>();
  readonly appliedTransactions: Transaction[] = [];
  readonly deferredEvents: DeferredPortfolioEvent[] = [];

  constructor(portfolioId: PortfolioId) {
    this.portfolioId = portfolioId;
  }

  getOrCreateAccountAssets(accountId: string): Map<string, Quantity> {
    let assetMap = this.accounts.get(accountId);
    if (!assetMap) {
      assetMap = new Map<string, Quantity>();
      this.accounts.set(accountId, assetMap);
    }
    return assetMap;
  }
}

/**
 * Handler interface for individual transaction evaluation.
 */
export interface TransactionHandler<T extends Transaction = Transaction> {
  handle(ctx: ReplayContext, tx: T): void;
}

const buyHandler: TransactionHandler<TradeTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentQty = accountAssets.get(assetKey) ?? Quantity.zero();
    const newQty = currentQty.add(tx.quantity);
    accountAssets.set(assetKey, newQty);
    ctx.appliedTransactions.push(tx);
  },
};

const sellHandler: TransactionHandler<TradeTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentQty = accountAssets.get(assetKey) ?? Quantity.zero();

    // Check long-only invariant
    if (tx.quantity.compare(currentQty) > 0) {
      const resultingQty = currentQty.subtract(tx.quantity);
      throw new NegativePositionError({
        portfolioId: String(ctx.portfolioId),
        accountId: String(tx.accountId),
        assetId: assetKey,
        currentQuantity: currentQty.toString(),
        attemptedDeduction: tx.quantity.toString(),
        resultingQuantity: resultingQty.toString(),
      });
    }

    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      // Zero position policy: omit liquidated positions from active state
      accountAssets.delete(assetKey);
    } else {
      accountAssets.set(assetKey, newQty);
    }
    ctx.appliedTransactions.push(tx);
  },
};

const transferInHandler: TransactionHandler<TransferTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentQty = accountAssets.get(assetKey) ?? Quantity.zero();
    const newQty = currentQty.add(tx.quantity);
    accountAssets.set(assetKey, newQty);
    ctx.appliedTransactions.push(tx);
  },
};

const transferOutHandler: TransactionHandler<TransferTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentQty = accountAssets.get(assetKey) ?? Quantity.zero();

    if (tx.quantity.compare(currentQty) > 0) {
      const resultingQty = currentQty.subtract(tx.quantity);
      throw new NegativePositionError({
        portfolioId: String(ctx.portfolioId),
        accountId: String(tx.accountId),
        assetId: assetKey,
        currentQuantity: currentQty.toString(),
        attemptedDeduction: tx.quantity.toString(),
        resultingQuantity: resultingQty.toString(),
      });
    }

    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      accountAssets.delete(assetKey);
    } else {
      accountAssets.set(assetKey, newQty);
    }
    ctx.appliedTransactions.push(tx);
  },
};

/**
 * Registry of deferred transaction handlers with explicit rationale.
 */
function recordDeferredEvent(ctx: ReplayContext, tx: Transaction, reason: string) {
  ctx.deferredEvents.push({
    transactionId: tx.id,
    type: tx.type,
    reason,
    tradeDate: tx.tradeDate,
    assetId: 'assetId' in tx ? tx.assetId : undefined,
    amount: 'amount' in tx ? tx.amount : undefined,
    quantity: 'quantity' in tx ? tx.quantity : undefined,
  });
  // Ensure account presence is registered even for deferred transactions
  ctx.getOrCreateAccountAssets(String(tx.accountId));
}

/**
 * Dispatcher function evaluating a single transaction against the replay context.
 * Utilizes TypeScript exhaustiveness checks (`never`) to prevent unhandled transaction types.
 */
export function dispatchTransaction(ctx: ReplayContext, tx: Transaction): void {
  switch (tx.type) {
    case 'BUY':
      buyHandler.handle(ctx, tx as TradeTransaction);
      break;

    case 'SELL':
      sellHandler.handle(ctx, tx as TradeTransaction);
      break;

    case 'TRANSFER_IN':
      transferInHandler.handle(ctx, tx as TransferTransaction);
      break;

    case 'TRANSFER_OUT':
      transferOutHandler.handle(ctx, tx as TransferTransaction);
      break;

    case 'DIVIDEND':
      recordDeferredEvent(
        ctx,
        tx,
        'Dividend payouts require cash ledger balance and tax rules, formally deferred to Phase 1E.',
      );
      break;

    case 'JCP':
      recordDeferredEvent(
        ctx,
        tx,
        'Interest on equity (JCP) requires withholding tax calculation, formally deferred to Phase 1E.',
      );
      break;

    case 'FII_INCOME':
      recordDeferredEvent(
        ctx,
        tx,
        'Real estate fund income requires monthly distribution processing, formally deferred to Phase 1E.',
      );
      break;

    case 'SPLIT':
      recordDeferredEvent(
        ctx,
        tx,
        'Stock splits require historical quantity and price factor adjustments, formally deferred to Phase 1D.',
      );
      break;

    case 'REVERSE_SPLIT':
      recordDeferredEvent(
        ctx,
        tx,
        'Reverse stock splits require consolidation adjustments, formally deferred to Phase 1D.',
      );
      break;

    case 'BONUS':
      recordDeferredEvent(
        ctx,
        tx,
        'Bonus share allocations require cost basis distribution, formally deferred to Phase 1D.',
      );
      break;

    case 'SUBSCRIPTION':
      recordDeferredEvent(
        ctx,
        tx,
        'Subscription rights execution requires cash outlay and entitlement semantics, formally deferred to Phase 1D.',
      );
      break;

    case 'AMORTIZATION':
      recordDeferredEvent(
        ctx,
        tx,
        'Principal amortization requires asset cost reduction, formally deferred to Phase 1D.',
      );
      break;

    case 'DEPOSIT':
      recordDeferredEvent(
        ctx,
        tx,
        'Cash deposits require account cash balance tracking, formally deferred to Phase 1C.',
      );
      break;

    case 'WITHDRAWAL':
      recordDeferredEvent(
        ctx,
        tx,
        'Cash withdrawals require account cash balance tracking, formally deferred to Phase 1C.',
      );
      break;

    case 'FEE':
      recordDeferredEvent(
        ctx,
        tx,
        'Custody and brokerage fees require cash balance deductions, formally deferred to Phase 1E.',
      );
      break;

    case 'TAX':
      recordDeferredEvent(
        ctx,
        tx,
        'Tax payments require tax engine settlement, formally deferred to Phase 1E.',
      );
      break;

    default: {
      const unreachable: never = tx;
      throw new UnsupportedTransactionStateError(
        (unreachable as Transaction).id,
        (unreachable as Transaction).type,
        `Transaction type '${(unreachable as Transaction).type}' has no registered handler.`,
      );
    }
  }
}
