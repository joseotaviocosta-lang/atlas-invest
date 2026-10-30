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
  IncomeTransaction,
  CashMovementTransaction,
  ExpenseTransaction,
  SubscriptionTransaction,
  ReceiptConversionTransaction,
} from '@atlas/domain';
import {
  DeferredPortfolioEvent,
  CostBasisStatus,
  RealizedDisposal,
  RealizedResultStatus,
  AppliedCorporateAction,
  IncomeEvent,
  CashFlowEvent,
  CashFlowDirection,
  CashFlowCategory,
  AppliedTransfer,
  TransferStatus,
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
  InvalidIncomeAmountError,
  InvalidCashFlowAmountError,
  SubscriptionCostBasisError,
  ReceiptConversionInvalidError,
  ReceiptConversionInsufficientSourceError,
} from './errors';

/**
 * Resolved metadata for a transfer pair within a replay execution.
 */
export interface ResolvedTransferPair {
  readonly transferGroupId: string;
  readonly outLeg?: TransferTransaction;
  readonly inLeg?: TransferTransaction;
}

/**
 * Internal state of a transfer group tracked dynamically as transactions are dispatched.
 */
export interface RuntimeTransferState {
  carriedCost?: Money;
  costBasisStatus: CostBasisStatus;
  outProcessed: boolean;
  inProcessed: boolean;
}

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
  readonly transferGroupPairs: ReadonlyMap<string, ResolvedTransferPair>;
  readonly runtimeTransferState = new Map<string, RuntimeTransferState>();
  /** accountId -> (assetId -> InternalPositionState) */
  readonly accounts = new Map<string, Map<string, InternalPositionState>>();
  readonly appliedTransactions: Transaction[] = [];
  readonly deferredEvents: DeferredPortfolioEvent[] = [];
  readonly realizedDisposals: RealizedDisposal[] = [];
  readonly appliedCorporateActions: AppliedCorporateAction[] = [];
  readonly incomeEvents: IncomeEvent[] = [];
  readonly cashFlowEvents: CashFlowEvent[] = [];
  readonly appliedTransfers: AppliedTransfer[] = [];

  constructor(
    portfolioId: PortfolioId,
    transferGroupPairs: ReadonlyMap<string, ResolvedTransferPair> = new Map(),
  ) {
    this.portfolioId = portfolioId;
    this.transferGroupPairs = transferGroupPairs;
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

  recordIncomeEvent(income: IncomeEvent): void {
    this.incomeEvents.push(income);
  }

  recordCashFlowEvent(cashFlow: CashFlowEvent): void {
    this.cashFlowEvents.push(cashFlow);
  }

  recordAppliedTransfer(transfer: AppliedTransfer): void {
    this.appliedTransfers.push(transfer);
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
        transactionId: String(tx.id),
        tradeDate: tx.tradeDate.toString(),
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

    // 1. Check currency compatibility with existing position
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 2. Check if linked to a matched pair in this replay
    const pair = tx.transferGroupId ? ctx.transferGroupPairs.get(tx.transferGroupId) : undefined;
    const isMatched = !!(pair && pair.outLeg && pair.inLeg);

    let carriedCost: Money | undefined;
    let transferCostStatus: CostBasisStatus = 'INCOMPLETE';

    if (isMatched && tx.transferGroupId && pair?.outLeg) {
      let runtimeState = ctx.runtimeTransferState.get(tx.transferGroupId);
      if (!runtimeState) {
        // IN executed before OUT (e.g. same tradeDate)!
        // Resolve origin account's current position to derive carriedCost
        const originAssets = ctx.getOrCreateAccountAssets(String(pair.outLeg.accountId));
        const originPos = originAssets.get(assetKey);
        if (
          originPos &&
          originPos.costBasisStatus === 'KNOWN' &&
          originPos.averageCost &&
          originPos.totalCost
        ) {
          carriedCost = originPos.averageCost.multiply(tx.quantity);
          transferCostStatus = 'KNOWN';
        } else {
          carriedCost = undefined;
          transferCostStatus = 'INCOMPLETE';
        }
        runtimeState = {
          carriedCost,
          costBasisStatus: transferCostStatus,
          outProcessed: false,
          inProcessed: true,
        };
        ctx.runtimeTransferState.set(tx.transferGroupId, runtimeState);
      } else {
        runtimeState.inProcessed = true;
        carriedCost = runtimeState.carriedCost;
        transferCostStatus = runtimeState.costBasisStatus;
      }
    }

    // 3. Update destination account position
    const newQty = currentQty.add(tx.quantity);

    if (
      isMatched &&
      transferCostStatus === 'KNOWN' &&
      carriedCost &&
      (!currentPos || currentPos.costBasisStatus === 'KNOWN')
    ) {
      // Weighted merge into destination position (Section 28/1F)
      const prevTotalCost = currentPos?.totalCost ?? Money.zero(tx.currency);
      const newTotalCost = prevTotalCost.add(carriedCost);
      const newAverageCost = newTotalCost.divide(newQty);

      accountAssets.set(assetKey, {
        quantity: newQty,
        totalCost: newTotalCost,
        averageCost: newAverageCost,
        currency: tx.currency,
        costBasisStatus: 'KNOWN',
      });
    } else {
      // Unmatched IN or origin was INCOMPLETE or destination was already INCOMPLETE
      // Cost basis becomes / remains INCOMPLETE. Do not fabricate cost.
      accountAssets.set(assetKey, {
        quantity: newQty,
        currency: currentPos?.currency ?? tx.currency,
        costBasisStatus: 'INCOMPLETE',
      });
    }

    // 4. Emit AppliedTransfer audit record
    const transferStatus: TransferStatus = isMatched ? 'MATCHED' : 'UNMATCHED_IN';
    ctx.recordAppliedTransfer(
      Object.freeze({
        transferGroupId: tx.transferGroupId,
        type: 'TRANSFER_IN',
        status: transferStatus,
        transactionId: tx.id,
        accountId: tx.accountId,
        counterpartyAccountId: pair?.outLeg?.accountId,
        assetId: tx.assetId,
        tradeDate: tx.tradeDate,
        quantity: tx.quantity,
        carriedCost: isMatched ? carriedCost : undefined,
        costBasisStatus: isMatched ? transferCostStatus : 'INCOMPLETE',
      }),
    );

    ctx.appliedTransactions.push(tx);
  },
};

const transferOutHandler: TransactionHandler<TransferTransaction> = {
  handle(ctx, tx) {
    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);
    const currentQty = currentPos?.quantity ?? Quantity.zero();

    // 1. Check long-only invariant (Section 24/1F)
    if (tx.quantity.compare(currentQty) > 0) {
      const resultingQty = currentQty.subtract(tx.quantity);
      throw new NegativePositionError({
        portfolioId: String(ctx.portfolioId),
        accountId: String(tx.accountId),
        assetId: assetKey,
        currentQuantity: currentQty.toString(),
        attemptedDeduction: tx.quantity.toString(),
        resultingQuantity: resultingQty.toString(),
        transactionId: String(tx.id),
        tradeDate: tx.tradeDate.toString(),
      });
    }

    // 2. Check currency compatibility
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 3. Determine if linked to a valid paired IN leg in this replay
    const pair = tx.transferGroupId ? ctx.transferGroupPairs.get(tx.transferGroupId) : undefined;
    const isMatched = !!(pair && pair.outLeg && pair.inLeg);

    // 4. Compute carried cost from origin account
    let carriedCost: Money | undefined;
    let transferCostStatus: CostBasisStatus;

    if (
      currentPos &&
      currentPos.costBasisStatus === 'KNOWN' &&
      currentPos.averageCost &&
      currentPos.totalCost
    ) {
      // Carried cost is currentAverageCost * transferQuantity
      carriedCost = currentPos.averageCost.multiply(tx.quantity);
      transferCostStatus = 'KNOWN';
    } else {
      carriedCost = undefined;
      transferCostStatus = 'INCOMPLETE';
    }

    // 5. Deduct quantity and proportional cost basis from source account
    const newQty = currentQty.subtract(tx.quantity);
    if (newQty.isZero()) {
      accountAssets.delete(assetKey);
    } else {
      if (transferCostStatus === 'KNOWN' && currentPos?.totalCost && carriedCost) {
        const newTotalCost = currentPos.totalCost.subtract(carriedCost);
        accountAssets.set(assetKey, {
          quantity: newQty,
          totalCost: newTotalCost,
          averageCost: currentPos.averageCost, // Average cost unchanged upon outbound transfer
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

    // 6. If matched, update or initialize runtimeTransferState
    if (isMatched && tx.transferGroupId) {
      const existingState = ctx.runtimeTransferState.get(tx.transferGroupId);
      if (existingState) {
        existingState.outProcessed = true;
        if (existingState.carriedCost === undefined && carriedCost !== undefined) {
          existingState.carriedCost = carriedCost;
          existingState.costBasisStatus = transferCostStatus;
        }
      } else {
        ctx.runtimeTransferState.set(tx.transferGroupId, {
          carriedCost,
          costBasisStatus: transferCostStatus,
          outProcessed: true,
          inProcessed: false,
        });
      }
    }

    // 7. Emit AppliedTransfer audit record
    const transferStatus: TransferStatus = isMatched ? 'MATCHED' : 'UNMATCHED_OUT';
    ctx.recordAppliedTransfer(
      Object.freeze({
        transferGroupId: tx.transferGroupId,
        type: 'TRANSFER_OUT',
        status: transferStatus,
        transactionId: tx.id,
        accountId: tx.accountId,
        counterpartyAccountId: pair?.inLeg?.accountId,
        assetId: tx.assetId,
        tradeDate: tx.tradeDate,
        quantity: tx.quantity,
        carriedCost,
        costBasisStatus: transferCostStatus,
      }),
    );

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

    // 8. Record audit cash flow event (dual-dimension: capital return cash inflow)
    ctx.recordCashFlowEvent(
      Object.freeze({
        transactionId: tx.id,
        portfolioId: ctx.portfolioId,
        accountId: tx.accountId,
        tradeDate: tx.tradeDate,
        type: 'AMORTIZATION',
        direction: 'INFLOW',
        category: 'CAPITAL_RETURN',
        amount: tx.amount,
        currency: tx.currency,
        relatedAssetId: tx.assetId,
      }),
    );

    ctx.appliedTransactions.push(tx);
  },
};

const incomeHandler: TransactionHandler<IncomeTransaction> = {
  handle(ctx, tx) {
    // 1. Amount validation
    if (!tx.amount.isPositive()) {
      throw new InvalidIncomeAmountError(String(tx.id), tx.type, tx.amount.amount);
    }
    if (tx.amount.currency !== tx.currency) {
      throw new CurrencyMismatchError(tx.currency, tx.amount.currency);
    }

    // 2. Ensure account existence is tracked
    ctx.getOrCreateAccountAssets(String(tx.accountId));

    // 3. Record income event
    ctx.recordIncomeEvent(
      Object.freeze({
        transactionId: tx.id,
        portfolioId: ctx.portfolioId,
        accountId: tx.accountId,
        assetId: tx.assetId,
        tradeDate: tx.tradeDate,
        type: tx.type,
        amount: tx.amount,
        grossAmount: tx.amount,
        currency: tx.currency,
        status: 'KNOWN',
      }),
    );

    ctx.appliedTransactions.push(tx);
  },
};

const cashMovementHandler: TransactionHandler<CashMovementTransaction> = {
  handle(ctx, tx) {
    // 1. Amount validation
    if (!tx.amount.isPositive()) {
      throw new InvalidCashFlowAmountError(String(tx.id), tx.type, tx.amount.amount);
    }
    if (tx.amount.currency !== tx.currency) {
      throw new CurrencyMismatchError(tx.currency, tx.amount.currency);
    }

    // 2. Ensure account existence is tracked
    ctx.getOrCreateAccountAssets(String(tx.accountId));

    // 3. Classify direction and category
    const isDeposit = tx.type === 'DEPOSIT';
    const direction: CashFlowDirection = isDeposit ? 'INFLOW' : 'OUTFLOW';
    const category: CashFlowCategory = isDeposit ? 'EXTERNAL_CONTRIBUTION' : 'EXTERNAL_WITHDRAWAL';

    // 4. Record cash flow event
    ctx.recordCashFlowEvent(
      Object.freeze({
        transactionId: tx.id,
        portfolioId: ctx.portfolioId,
        accountId: tx.accountId,
        tradeDate: tx.tradeDate,
        type: tx.type,
        direction,
        category,
        amount: tx.amount,
        currency: tx.currency,
      }),
    );

    ctx.appliedTransactions.push(tx);
  },
};

const expenseHandler: TransactionHandler<ExpenseTransaction> = {
  handle(ctx, tx) {
    // 1. Amount validation
    if (!tx.amount.isPositive()) {
      throw new InvalidCashFlowAmountError(String(tx.id), tx.type, tx.amount.amount);
    }
    if (tx.amount.currency !== tx.currency) {
      throw new CurrencyMismatchError(tx.currency, tx.amount.currency);
    }

    // 2. Ensure account existence is tracked
    ctx.getOrCreateAccountAssets(String(tx.accountId));

    // 3. Classify category (direction is always OUTFLOW)
    const category: CashFlowCategory = tx.type === 'FEE' ? 'OPERATIONAL_EXPENSE' : 'TAX_PAYMENT';

    // 4. Record cash flow event
    ctx.recordCashFlowEvent(
      Object.freeze({
        transactionId: tx.id,
        portfolioId: ctx.portfolioId,
        accountId: tx.accountId,
        tradeDate: tx.tradeDate,
        type: tx.type,
        direction: 'OUTFLOW',
        category,
        amount: tx.amount,
        currency: tx.currency,
        relatedAssetId: tx.assetId,
      }),
    );

    ctx.appliedTransactions.push(tx);
  },
};

const subscriptionHandler: TransactionHandler<SubscriptionTransaction> = {
  handle(ctx, tx) {
    // 1. Quantity validation
    if (!tx.quantity.isPositive()) {
      throw new SubscriptionCostBasisError(
        String(tx.id),
        `SUBSCRIPTION transaction requires quantity > 0, received '${tx.quantity.value}'`,
      );
    }

    // 2. UnitPrice validation (Phase 1F hardening: unitPrice > 0 strictly enforced)
    if (!tx.unitPrice.isPositive()) {
      throw new SubscriptionCostBasisError(
        String(tx.id),
        `SUBSCRIPTION transaction requires unitPrice > 0, received '${tx.unitPrice.amount}'`,
      );
    }
    if (tx.unitPrice.currency !== tx.currency) {
      throw new CurrencyMismatchError(tx.currency, tx.unitPrice.currency);
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const assetKey = String(tx.assetId);
    const currentPos = accountAssets.get(assetKey);

    // 3. Multi-currency safety
    if (currentPos && currentPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(currentPos.currency, tx.currency);
    }

    // 4. Compute acquisition cost (unitPrice * quantity)
    const acquisitionCost = tx.unitPrice.multiply(tx.quantity);

    // 5. Update position state
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
      // Incomplete cost basis remains INCOMPLETE upon subsequent subscriptions
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

/**
 * Cross-asset receipt conversion (e.g. SNEL13 receipt → SNEL11 parent).
 *
 * Moves quantity AND carried cost from the source (receipt) position to the
 * target (parent) position within the same account. Ownership is unchanged:
 * zero disposals, zero proceeds, zero gain. Cost rules mirror the transfer
 * merge matrix conservatively — any INCOMPLETE side yields INCOMPLETE.
 */
const receiptConversionHandler: TransactionHandler<ReceiptConversionTransaction> = {
  handle(ctx, tx) {
    const txId = String(tx.id);
    // 1. Structural invariants (defense in depth; factory validates first).
    if (String(tx.assetId) === String(tx.targetAssetId)) {
      throw new ReceiptConversionInvalidError(txId, 'source and target assets must differ');
    }
    if (!tx.quantity.isPositive() || !tx.targetQuantity.isPositive()) {
      throw new ReceiptConversionInvalidError(txId, 'source and target quantities must be > 0');
    }
    if (!tx.conversionRatio.isPositive()) {
      throw new ReceiptConversionInvalidError(txId, 'conversion ratio must be > 0');
    }
    if (!tx.quantity.multiply(tx.conversionRatio).equals(tx.targetQuantity)) {
      throw new ReceiptConversionInvalidError(
        txId,
        `targetQuantity '${tx.targetQuantity.value}' != sourceQuantity '${tx.quantity.value}' × ratio '${tx.conversionRatio.value}'`,
      );
    }

    const accountAssets = ctx.getOrCreateAccountAssets(String(tx.accountId));
    const sourceKey = String(tx.assetId);
    const targetKey = String(tx.targetAssetId);
    const sourcePos = accountAssets.get(sourceKey);
    const targetPos = accountAssets.get(targetKey);
    const sourceQty = sourcePos?.quantity ?? Quantity.zero();

    // 2. Long-only invariant on the source side (never negative).
    if (tx.quantity.compare(sourceQty) > 0) {
      throw new ReceiptConversionInsufficientSourceError(
        txId,
        tx.quantity.value,
        sourceQty.toString(),
      );
    }
    if (!sourcePos) {
      throw new ReceiptConversionInsufficientSourceError(txId, tx.quantity.value, '0');
    }

    // 3. Currency compatibility (source, target and event must agree).
    if (sourcePos.currency !== tx.currency) {
      throw new CurrencyMismatchError(sourcePos.currency, tx.currency);
    }
    if (targetPos && targetPos.currency !== tx.currency) {
      throw new CurrencyMismatchError(targetPos.currency, tx.currency);
    }

    // 4. Capture source cost state for the converted slice.
    const beforeSourceQty = sourcePos.quantity;
    const afterSourceQty = beforeSourceQty.subtract(tx.quantity);
    const beforeSourceTotal = sourcePos.totalCost;
    const beforeSourceAverage = sourcePos.averageCost;
    let carriedCost: Money | undefined;
    let carriedStatus: CostBasisStatus;
    let afterSourceTotal: Money | undefined;
    if (sourcePos.costBasisStatus === 'KNOWN' && beforeSourceTotal && beforeSourceAverage) {
      carriedCost = beforeSourceAverage.multiply(tx.quantity);
      carriedStatus = 'KNOWN';
      afterSourceTotal = beforeSourceTotal.subtract(carriedCost);
    } else {
      carriedCost = undefined;
      carriedStatus = 'INCOMPLETE';
      afterSourceTotal = undefined;
    }
    const afterSourceAverage =
      carriedStatus === 'KNOWN' && !afterSourceQty.isZero()
        ? (afterSourceTotal as Money).divide(afterSourceQty)
        : undefined;

    // 5. Update source position (close-out when fully converted).
    if (afterSourceQty.isZero()) {
      accountAssets.delete(sourceKey);
    } else {
      accountAssets.set(sourceKey, {
        quantity: afterSourceQty,
        totalCost: afterSourceTotal,
        averageCost: afterSourceAverage,
        currency: sourcePos.currency,
        costBasisStatus: carriedStatus,
      });
    }

    // 6. Merge into target position (PART N matrix).
    const beforeTargetQty = targetPos?.quantity ?? Quantity.zero();
    const afterTargetQty = beforeTargetQty.add(tx.targetQuantity);
    let afterTargetTotal: Money | undefined;
    let afterTargetAverage: Money | undefined;
    let targetStatus: CostBasisStatus;
    if (
      carriedStatus === 'KNOWN' &&
      carriedCost &&
      (!targetPos || targetPos.costBasisStatus === 'KNOWN') &&
      (!targetPos || targetPos.totalCost)
    ) {
      const prevTotal = targetPos?.totalCost ?? Money.zero(tx.currency);
      afterTargetTotal = prevTotal.add(carriedCost);
      afterTargetAverage = afterTargetTotal.divide(afterTargetQty);
      targetStatus = 'KNOWN';
    } else {
      afterTargetTotal = undefined;
      afterTargetAverage = undefined;
      targetStatus = 'INCOMPLETE';
    }
    accountAssets.set(targetKey, {
      quantity: afterTargetQty,
      totalCost: afterTargetTotal,
      averageCost: afterTargetAverage,
      currency: targetPos?.currency ?? tx.currency,
      costBasisStatus: targetStatus,
    });

    // 7. Audit record (source before/after + target side). Zero disposals.
    ctx.recordAppliedCorporateAction({
      transactionId: tx.id,
      type: 'RECEIPT_CONVERSION',
      accountId: tx.accountId,
      assetId: tx.assetId,
      targetAssetId: tx.targetAssetId,
      targetQuantity: tx.targetQuantity,
      conversionRatio: tx.conversionRatio,
      convertedQuantity: tx.quantity,
      tradeDate: tx.tradeDate,
      beforeQuantity: beforeSourceQty,
      afterQuantity: afterSourceQty,
      beforeTotalCost: beforeSourceTotal,
      afterTotalCost: afterSourceTotal,
      beforeAverageCost: beforeSourceAverage,
      afterAverageCost: afterSourceAverage,
      status: carriedStatus,
    });

    ctx.appliedTransactions.push(tx);
  },
};

/**
 * Dispatcher function evaluating a single transaction against the replay context.
 * All 16 transaction types are now exhaustively handled.
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
    case 'JCP':
    case 'FII_INCOME':
      incomeHandler.handle(ctx, tx as IncomeTransaction);
      break;

    case 'SUBSCRIPTION':
      subscriptionHandler.handle(ctx, tx as SubscriptionTransaction);
      break;

    case 'RECEIPT_CONVERSION':
      receiptConversionHandler.handle(ctx, tx as ReceiptConversionTransaction);
      break;

    case 'DEPOSIT':
    case 'WITHDRAWAL':
      cashMovementHandler.handle(ctx, tx as CashMovementTransaction);
      break;

    case 'FEE':
    case 'TAX':
      expenseHandler.handle(ctx, tx as ExpenseTransaction);
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
