import {
  Transaction,
  Quantity,
  Money,
  Percentage,
  Currency,
  PortfolioId,
  TradeTransaction,
  TransferTransaction,
  SplitTransaction,
  BonusTransaction,
  AmortizationTransaction,
} from '@atlas/domain';
import {
  DeferredPortfolioEvent,
  CostBasisStatus,
  RealizedDisposal,
  RealizedResultStatus,
  AppliedCorporateAction,
} from './types';
import {
  NegativePositionError,
  CurrencyMismatchError,
  InvalidBuyCostError,
  InvalidSellPriceError,
  InvalidSellingCostError,
  UnsupportedTransactionStateError,
  InvalidCorporateActionFactorError,
  InvalidBonusQuantityError,
  AmortizationExceedsCostError,
  IncompleteAmortizationCostError,
  EmptyPositionCorporateActionError,
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
  readonly realizedDisposals: RealizedDisposal[] = [];
  readonly appliedCorporateActions: AppliedCorporateAction[] = [];

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

  recordRealizedDisposal(disposal: RealizedDisposal): void {
    this.realizedDisposals.push(disposal);
  }

  recordAppliedCorporateAction(ca: AppliedCorporateAction): void {
    this.appliedCorporateActions.push(ca);
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
    if (tx.fees) {
      if (tx.fees.currency !== tx.currency) {
        throw new CurrencyMismatchError(tx.currency, tx.fees.currency);
      }
      if (tx.fees.isNegative()) {
        throw new InvalidBuyCostError(
          String(tx.id),
          tx.fees.amount,
          'BUY transaction fees cannot be negative',
        );
      }
    }
    if (tx.taxes) {
      if (tx.taxes.currency !== tx.currency) {
        throw new CurrencyMismatchError(tx.currency, tx.taxes.currency);
      }
      if (tx.taxes.isNegative()) {
        throw new InvalidBuyCostError(
          String(tx.id),
          tx.taxes.amount,
          'BUY transaction taxes cannot be negative',
        );
      }
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

    // 1. Check long-only invariant (Section 24)
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

    // 2. Validate unitPrice > 0 (Section 74)
    if (!tx.unitPrice.isPositive()) {
      throw new InvalidSellPriceError(
        String(tx.id),
        tx.unitPrice.amount,
        'SELL transaction requires unitPrice > 0',
      );
    }

    // 3. Multi-currency safety (Section 29, 30)
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 4. Validate and accumulate selling costs (Section 7, 75, 76)
    let sellingCosts = Money.zero(tx.currency);
    if (tx.fees) {
      if (tx.fees.currency !== tx.currency) {
        throw new CurrencyMismatchError(tx.currency, tx.fees.currency);
      }
      if (tx.fees.isNegative()) {
        throw new InvalidSellingCostError(String(tx.id), 'fees', tx.fees.amount);
      }
      sellingCosts = sellingCosts.add(tx.fees);
    }
    if (tx.taxes) {
      if (tx.taxes.currency !== tx.currency) {
        throw new CurrencyMismatchError(tx.currency, tx.taxes.currency);
      }
      if (tx.taxes.isNegative()) {
        throw new InvalidSellingCostError(String(tx.id), 'taxes', tx.taxes.amount);
      }
      sellingCosts = sellingCosts.add(tx.taxes);
    }

    // 5. Compute gross and net proceeds (Section 3)
    const grossProceeds = tx.unitPrice.multiply(tx.quantity);
    const netProceeds = grossProceeds.subtract(sellingCosts);

    // 6. Compute cost basis removed, realized gain/loss, and return percentage before modifying quantity (Section 78)
    const isIncomplete = !currentPos || currentPos.costBasisStatus === 'INCOMPLETE';
    let costBasisRemoved: Money | undefined;
    let realizedGainLoss: Money | undefined;
    let realizedReturnPercentage: Percentage | undefined;
    const disposalStatus: RealizedResultStatus = isIncomplete ? 'INCOMPLETE' : 'KNOWN';

    if (!isIncomplete && currentPos.averageCost && currentPos.totalCost) {
      const currentAvg = currentPos.averageCost;
      costBasisRemoved = currentAvg.multiply(tx.quantity);
      realizedGainLoss = netProceeds.subtract(costBasisRemoved);

      if (costBasisRemoved.isPositive()) {
        const ratio = Quantity.from(realizedGainLoss.amount)
          .divide(Quantity.from(costBasisRemoved.amount))
          .multiply('100');
        realizedReturnPercentage = Percentage.from(ratio.value);
      }
    }

    // 7. Record RealizedDisposal event (Section 11, 84)
    const disposal: RealizedDisposal = Object.freeze({
      transactionId: tx.id,
      portfolioId: ctx.portfolioId,
      accountId: tx.accountId,
      assetId: tx.assetId,
      tradeDate: tx.tradeDate,
      quantity: tx.quantity,
      unitPrice: tx.unitPrice,
      grossProceeds,
      sellingCosts,
      netProceeds,
      costBasisRemoved,
      realizedGainLoss,
      realizedReturnPercentage,
      currency: tx.currency,
      status: disposalStatus,
    });
    ctx.recordRealizedDisposal(disposal);

    // 8. Update quantity and cost basis
    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      // Full SELL (Section 26 & ADR-039): omit liquidated positions from active state, cost resets to zero
      accountAssets.delete(assetKey);
    } else {
      // Partial SELL: remaining unit averageCost is unchanged (ADR-041)
      if (!isIncomplete && currentPos.averageCost && currentPos.totalCost && costBasisRemoved) {
        const newTotalCost = currentPos.totalCost.subtract(costBasisRemoved);
        accountAssets.set(assetKey, {
          quantity: newQty,
          totalCost: newTotalCost,
          averageCost: currentPos.averageCost,
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

const splitHandler: TransactionHandler<SplitTransaction> = {
  handle(ctx, tx) {
    // 1. Factor validation (ADR-048)
    if (!tx.factor.isPositive() || tx.factor.equals(Quantity.from('1'))) {
      throw new InvalidCorporateActionFactorError(
        String(tx.id),
        tx.factor.value,
        'SPLIT factor must be greater than zero and cannot be 1 (no-op)',
      );
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 2. Active position validation
    if (!currentPos || currentPos.quantity.isZero()) {
      throw new EmptyPositionCorporateActionError(
        String(tx.id),
        String(tx.accountId),
        assetKey,
        'SPLIT',
      );
    }

    // 3. Compute transformed quantities and preserved cost basis
    const beforeQuantity = currentPos.quantity;
    const afterQuantity = beforeQuantity.multiply(tx.factor);
    const beforeTotalCost = currentPos.totalCost;
    const beforeAverageCost = currentPos.averageCost;

    let afterTotalCost: Money | undefined;
    let afterAverageCost: Money | undefined;
    const status: CostBasisStatus = currentPos.costBasisStatus;

    if (status === 'KNOWN' && beforeTotalCost) {
      afterTotalCost = beforeTotalCost; // Total carried cost unchanged
      afterAverageCost = afterTotalCost.divide(afterQuantity);
    } else {
      afterTotalCost = undefined;
      afterAverageCost = undefined;
    }

    // 4. Update position state
    accountAssets.set(assetKey, {
      quantity: afterQuantity,
      totalCost: afterTotalCost,
      averageCost: afterAverageCost,
      currency: currentPos.currency,
      costBasisStatus: status,
    });

    // 5. Record audit corporate action
    ctx.recordAppliedCorporateAction({
      transactionId: tx.id,
      type: 'SPLIT',
      accountId: tx.accountId,
      assetId: tx.assetId,
      tradeDate: tx.tradeDate,
      beforeQuantity,
      afterQuantity,
      beforeTotalCost,
      afterTotalCost,
      beforeAverageCost,
      afterAverageCost,
      status,
    });

    ctx.appliedTransactions.push(tx);
  },
};

const reverseSplitHandler: TransactionHandler<SplitTransaction> = {
  handle(ctx, tx) {
    // 1. Factor validation (ADR-048)
    if (!tx.factor.isPositive() || tx.factor.equals(Quantity.from('1'))) {
      throw new InvalidCorporateActionFactorError(
        String(tx.id),
        tx.factor.value,
        'REVERSE_SPLIT factor must be greater than zero and cannot be 1 (no-op)',
      );
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 2. Active position validation
    if (!currentPos || currentPos.quantity.isZero()) {
      throw new EmptyPositionCorporateActionError(
        String(tx.id),
        String(tx.accountId),
        assetKey,
        'REVERSE_SPLIT',
      );
    }

    // 3. Compute transformed quantities and preserved cost basis
    const beforeQuantity = currentPos.quantity;
    const afterQuantity = beforeQuantity.divide(tx.factor); // Exact fractional preservation
    const beforeTotalCost = currentPos.totalCost;
    const beforeAverageCost = currentPos.averageCost;

    let afterTotalCost: Money | undefined;
    let afterAverageCost: Money | undefined;
    const status: CostBasisStatus = currentPos.costBasisStatus;

    if (status === 'KNOWN' && beforeTotalCost) {
      afterTotalCost = beforeTotalCost; // Total carried cost unchanged
      afterAverageCost = afterTotalCost.divide(afterQuantity);
    } else {
      afterTotalCost = undefined;
      afterAverageCost = undefined;
    }

    // 4. Update position state
    accountAssets.set(assetKey, {
      quantity: afterQuantity,
      totalCost: afterTotalCost,
      averageCost: afterAverageCost,
      currency: currentPos.currency,
      costBasisStatus: status,
    });

    // 5. Record audit corporate action
    ctx.recordAppliedCorporateAction({
      transactionId: tx.id,
      type: 'REVERSE_SPLIT',
      accountId: tx.accountId,
      assetId: tx.assetId,
      tradeDate: tx.tradeDate,
      beforeQuantity,
      afterQuantity,
      beforeTotalCost,
      afterTotalCost,
      beforeAverageCost,
      afterAverageCost,
      status,
    });

    ctx.appliedTransactions.push(tx);
  },
};

const bonusHandler: TransactionHandler<BonusTransaction> = {
  handle(ctx, tx) {
    // 1. Quantity validation (ADR-049)
    if (!tx.quantity.isPositive()) {
      throw new InvalidBonusQuantityError(String(tx.id), tx.quantity.value);
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 2. Active position validation
    if (!currentPos || currentPos.quantity.isZero()) {
      throw new EmptyPositionCorporateActionError(
        String(tx.id),
        String(tx.accountId),
        assetKey,
        'BONUS',
      );
    }

    // 3. Currency validation
    if (tx.assignedCost && tx.assignedCost.currency !== currentPos.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.assignedCost.currency);
    }

    // 4. Compute transformed quantities and cost basis
    const beforeQuantity = currentPos.quantity;
    const afterQuantity = beforeQuantity.add(tx.quantity);
    const beforeTotalCost = currentPos.totalCost;
    const beforeAverageCost = currentPos.averageCost;

    let afterTotalCost: Money | undefined;
    let afterAverageCost: Money | undefined;
    let status: CostBasisStatus;

    if (tx.assignedCost && currentPos.costBasisStatus === 'KNOWN' && beforeTotalCost) {
      // Explicit assigned cost provided -> KNOWN status with weighted average cost
      afterTotalCost = beforeTotalCost.add(tx.assignedCost);
      afterAverageCost = afterTotalCost.divide(afterQuantity);
      status = 'KNOWN';
    } else {
      // Missing assigned cost OR position already INCOMPLETE -> INCOMPLETE status
      afterTotalCost = undefined;
      afterAverageCost = undefined;
      status = 'INCOMPLETE';
    }

    // 5. Update position state
    accountAssets.set(assetKey, {
      quantity: afterQuantity,
      totalCost: afterTotalCost,
      averageCost: afterAverageCost,
      currency: currentPos.currency,
      costBasisStatus: status,
    });

    // 6. Record audit corporate action
    ctx.recordAppliedCorporateAction({
      transactionId: tx.id,
      type: 'BONUS',
      accountId: tx.accountId,
      assetId: tx.assetId,
      tradeDate: tx.tradeDate,
      beforeQuantity,
      afterQuantity,
      beforeTotalCost,
      afterTotalCost,
      beforeAverageCost,
      afterAverageCost,
      status,
    });

    ctx.appliedTransactions.push(tx);
  },
};

const amortizationHandler: TransactionHandler<AmortizationTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 1. Active position validation
    if (!currentPos || currentPos.quantity.isZero()) {
      throw new EmptyPositionCorporateActionError(
        String(tx.id),
        String(tx.accountId),
        assetKey,
        'AMORTIZATION',
      );
    }

    // 2. Currency validation (ADR-050)
    if (currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 3. Incomplete cost basis rejection (cannot safely subtract without knowing carried cost)
    if (currentPos.costBasisStatus === 'INCOMPLETE') {
      throw new IncompleteAmortizationCostError(String(tx.id), String(tx.accountId), assetKey);
    }

    const beforeTotalCost = currentPos.totalCost!;
    // 4. Disallow amortization exceeding current carried total cost
    if (tx.amount.compare(beforeTotalCost) > 0) {
      throw new AmortizationExceedsCostError(
        String(tx.id),
        tx.amount.amount,
        beforeTotalCost.amount,
      );
    }

    // 5. Compute transformed cost basis (quantity remains unchanged)
    const beforeQuantity = currentPos.quantity;
    const afterQuantity = beforeQuantity;
    const beforeAverageCost = currentPos.averageCost;

    const afterTotalCost = beforeTotalCost.subtract(tx.amount);
    const afterAverageCost = afterTotalCost.isZero()
      ? Money.zero(currentPos.currency)
      : afterTotalCost.divide(afterQuantity);
    const status: CostBasisStatus = 'KNOWN'; // Known zero or positive cost is KNOWN, distinct from INCOMPLETE

    // 6. Update position state
    accountAssets.set(assetKey, {
      quantity: afterQuantity,
      totalCost: afterTotalCost,
      averageCost: afterAverageCost,
      currency: currentPos.currency,
      costBasisStatus: status,
    });

    // 7. Record audit corporate action
    ctx.recordAppliedCorporateAction({
      transactionId: tx.id,
      type: 'AMORTIZATION',
      accountId: tx.accountId,
      assetId: tx.assetId,
      tradeDate: tx.tradeDate,
      beforeQuantity,
      afterQuantity,
      beforeTotalCost,
      afterTotalCost,
      beforeAverageCost,
      afterAverageCost,
      status,
    });

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

    case 'SPLIT':
      splitHandler.handle(ctx, tx as SplitTransaction);
      break;

    case 'REVERSE_SPLIT':
      reverseSplitHandler.handle(ctx, tx as SplitTransaction);
      break;

    case 'BONUS':
      bonusHandler.handle(ctx, tx as BonusTransaction);
      break;

    case 'AMORTIZATION':
      amortizationHandler.handle(ctx, tx as AmortizationTransaction);
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

    case 'SUBSCRIPTION':
      recordDeferredEvent(
        ctx,
        tx,
        'Subscription rights execution requires cash outlay and entitlement semantics, formally deferred to Phase 1E.',
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
