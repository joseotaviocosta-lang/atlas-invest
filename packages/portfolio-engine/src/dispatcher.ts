import {
  Transaction,
  Quantity,
  Money,
  Currency,
  PortfolioId,
  TradeTransaction,
  TransferTransaction,
} from '@atlas/domain';
import { DeferredPortfolioEvent, CostBasisStatus } from './types';
import {
  NegativePositionError,
  CurrencyMismatchError,
  InvalidBuyCostError,
  UnsupportedTransactionStateError,
} from './errors';

/**
 * Internal mutable position state tracked during replay.
 */
export interface InternalPositionState {
  quantity: Quantity;
  totalCost?: Money;
  averageCost?: Money;
  currency: Currency;
  costBasisStatus: CostBasisStatus;
}

/**
 * Internal mutable builder context used during a single replay run.
 * Isolated per replay execution; never exposed outside the engine.
 */
export class ReplayContext {
  readonly portfolioId: PortfolioId;
  /** accountId -> (assetId -> InternalPositionState) */
  readonly accounts = new Map<string, Map<string, InternalPositionState>>();
  readonly appliedTransactions: Transaction[] = [];
  readonly deferredEvents: DeferredPortfolioEvent[] = [];

  constructor(portfolioId: PortfolioId) {
    this.portfolioId = portfolioId;
  }

  getOrCreateAccountAssets(accountId: string): Map<string, InternalPositionState> {
    let assetMap = this.accounts.get(accountId);
    if (!assetMap) {
      assetMap = new Map<string, InternalPositionState>();
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
    // 1. Validate BUY cost invariants
    if (!tx.unitPrice.isPositive()) {
      throw new InvalidBuyCostError(
        String(tx.id),
        tx.unitPrice.amount,
        'BUY transaction requires unitPrice > 0',
      );
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 2. Multi-currency safety (ADR-040)
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 3. Compute acquisition cost (gross cost + explicit attributable fees/taxes)
    const grossCost = tx.unitPrice.multiply(tx.quantity);
    let acquisitionCost = grossCost;
    if (tx.fees) {
      acquisitionCost = acquisitionCost.add(tx.fees);
    }
    if (tx.taxes) {
      acquisitionCost = acquisitionCost.add(tx.taxes);
    }

    // 4. Update position state
    if (!currentPos || currentPos.costBasisStatus === 'KNOWN') {
      const prevTotalCost = currentPos?.totalCost ?? Money.zero(tx.currency);
      const prevQuantity = currentPos?.quantity ?? Quantity.zero();

      const newTotalCost = prevTotalCost.add(acquisitionCost);
      const newQuantity = prevQuantity.add(tx.quantity);
      const newAverageCost = newTotalCost.divide(newQuantity);

      accountAssets.set(assetKey, {
        quantity: newQuantity,
        totalCost: newTotalCost,
        averageCost: newAverageCost,
        currency: tx.currency,
        costBasisStatus: 'KNOWN',
      });
    } else {
      // Incomplete cost basis remains INCOMPLETE upon subsequent purchases
      const newQuantity = currentPos.quantity.add(tx.quantity);
      accountAssets.set(assetKey, {
        quantity: newQuantity,
        currency: tx.currency,
        costBasisStatus: 'INCOMPLETE',
      });
    }

    ctx.appliedTransactions.push(tx);
  },
};

const sellHandler: TransactionHandler<TradeTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);
    const currentQty = currentPos?.quantity ?? Quantity.zero();

    // 1. Check long-only invariant
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

    // 2. Multi-currency safety
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 3. Update quantity and cost basis
    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      // Full SELL (Section 26 & ADR-039): omit liquidated positions from active state, cost resets to zero
      accountAssets.delete(assetKey);
    } else {
      // Partial SELL: remove cost basis proportionally using current average cost (ADR-041)
      if (
        currentPos &&
        currentPos.costBasisStatus === 'KNOWN' &&
        currentPos.averageCost &&
        currentPos.totalCost
      ) {
        const currentAvg = currentPos.averageCost;
        const costRemoved = currentAvg.multiply(tx.quantity);
        const newTotalCost = currentPos.totalCost.subtract(costRemoved);

        // Pre-sale averageCost remains unchanged; sale price does NOT alter averageCost
        accountAssets.set(assetKey, {
          quantity: newQty,
          totalCost: newTotalCost,
          averageCost: currentAvg,
          currency: currentPos.currency,
          costBasisStatus: 'KNOWN',
        });
      } else {
        accountAssets.set(assetKey, {
          quantity: newQty,
          currency: currentPos?.currency ?? tx.currency,
          costBasisStatus: 'INCOMPLETE',
        });
      }
    }

    ctx.appliedTransactions.push(tx);
  },
};

const transferInHandler: TransactionHandler<TransferTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);
    const currentQty = currentPos?.quantity ?? Quantity.zero();

    // Check currency compatibility
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    const newQty = currentQty.add(tx.quantity);

    // In Phase 1B, TRANSFER_IN without explicit cost basis sets costBasisStatus = 'INCOMPLETE' (ADR-043)
    accountAssets.set(assetKey, {
      quantity: newQty,
      currency: tx.currency,
      costBasisStatus: 'INCOMPLETE',
    });

    ctx.appliedTransactions.push(tx);
  },
};

const transferOutHandler: TransactionHandler<TransferTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);
    const currentQty = currentPos?.quantity ?? Quantity.zero();

    // 1. Check long-only invariant
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

    // 2. Check currency compatibility
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 3. Deduct quantity and proportional cost basis from source account
    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      accountAssets.delete(assetKey);
    } else {
      if (
        currentPos &&
        currentPos.costBasisStatus === 'KNOWN' &&
        currentPos.averageCost &&
        currentPos.totalCost
      ) {
        const currentAvg = currentPos.averageCost;
        const costRemoved = currentAvg.multiply(tx.quantity);
        const newTotalCost = currentPos.totalCost.subtract(costRemoved);

        accountAssets.set(assetKey, {
          quantity: newQty,
          totalCost: newTotalCost,
          averageCost: currentAvg,
          currency: currentPos.currency,
          costBasisStatus: 'KNOWN',
        });
      } else {
        accountAssets.set(assetKey, {
          quantity: newQty,
          currency: currentPos?.currency ?? tx.currency,
          costBasisStatus: 'INCOMPLETE',
        });
      }
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
