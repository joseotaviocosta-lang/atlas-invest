import { DomainError } from '@atlas/domain';

/**
 * Base class for all Portfolio Engine errors.
 */
export class PortfolioReplayError extends DomainError {
  constructor(message: string, code = 'PORTFOLIO_ENGINE.REPLAY_ERROR') {
    super(message, code);
  }
}

/**
 * Thrown when a transaction provided to replay belongs to a different portfolio.
 */
export class CrossPortfolioTransactionError extends PortfolioReplayError {
  readonly targetPortfolioId: string;
  readonly transactionId: string;
  readonly transactionPortfolioId: string;

  constructor(targetPortfolioId: string, transactionId: string, transactionPortfolioId: string) {
    super(
      `Cross-portfolio transaction rejected: transaction '${transactionId}' belongs to portfolio '${transactionPortfolioId}', but replay was requested for portfolio '${targetPortfolioId}'`,
      'PORTFOLIO_ENGINE.CROSS_PORTFOLIO_TRANSACTION',
    );
    this.targetPortfolioId = targetPortfolioId;
    this.transactionId = transactionId;
    this.transactionPortfolioId = transactionPortfolioId;
  }
}

/**
 * Thrown when duplicate transaction IDs are detected in the input collection.
 */
export class DuplicateTransactionError extends PortfolioReplayError {
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(
      `Duplicate transaction ID detected in replay stream: '${transactionId}' cannot be processed more than once`,
      'PORTFOLIO_ENGINE.DUPLICATE_TRANSACTION_ID',
    );
    this.transactionId = transactionId;
  }
}

/**
 * Thrown when a SELL or TRANSFER_OUT transaction produces a negative asset position.
 * Project Atlas enforces a strict long-only invariant (short selling is disallowed in Phase 1A).
 */
export class NegativePositionError extends PortfolioReplayError {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly currentQuantity: string;
  readonly attemptedDeduction: string;
  readonly resultingQuantity: string;

  constructor(props: {
    portfolioId: string;
    accountId: string;
    assetId: string;
    currentQuantity: string;
    attemptedDeduction: string;
    resultingQuantity: string;
  }) {
    super(
      `Negative position violation: Account '${props.accountId}' holds '${props.currentQuantity}' units of asset '${props.assetId}', but transaction attempted to deduct '${props.attemptedDeduction}', resulting in invalid negative quantity '${props.resultingQuantity}'. Long-only policy violated.`,
      'PORTFOLIO_ENGINE.NEGATIVE_POSITION',
    );
    this.portfolioId = props.portfolioId;
    this.accountId = props.accountId;
    this.assetId = props.assetId;
    this.currentQuantity = props.currentQuantity;
    this.attemptedDeduction = props.attemptedDeduction;
    this.resultingQuantity = props.resultingQuantity;
  }
}

/**
 * Thrown when an unexpected or unsupported transaction state is encountered.
 */
export class UnsupportedTransactionStateError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly transactionType: string;

  constructor(transactionId: string, transactionType: string, reason: string) {
    super(
      `Unsupported transaction state for transaction '${transactionId}' (type '${transactionType}'): ${reason}`,
      'PORTFOLIO_ENGINE.UNSUPPORTED_STATE',
    );
    this.transactionId = transactionId;
    this.transactionType = transactionType;
  }
}

/**
 * Thrown when transactions for the same asset position have conflicting currencies.
 * Multi-currency FX is deferred to future phases (ADR-040).
 */
export class CurrencyMismatchError extends PortfolioReplayError {
  readonly expectedCurrency: string;
  readonly receivedCurrency: string;

  constructor(expectedCurrency: string, receivedCurrency: string) {
    super(
      `Currency mismatch for position: expected currency '${expectedCurrency}', but received transaction with currency '${receivedCurrency}'. Multi-currency positions are not supported without FX conversion.`,
      'PORTFOLIO_ENGINE.CURRENCY_MISMATCH',
    );
    this.expectedCurrency = expectedCurrency;
    this.receivedCurrency = receivedCurrency;
  }
}

/**
 * Thrown when a BUY transaction contains an invalid cost basis (e.g. unitPrice <= 0).
 */
export class InvalidBuyCostError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly unitPrice: string;

  constructor(
    transactionId: string,
    unitPrice: string,
    reason = 'unitPrice must be greater than zero',
  ) {
    super(
      `Invalid BUY transaction cost for '${transactionId}': ${reason} (received '${unitPrice}')`,
      'PORTFOLIO_ENGINE.INVALID_BUY_COST',
    );
    this.transactionId = transactionId;
    this.unitPrice = unitPrice;
  }
}

/**
 * Thrown when a SELL transaction contains an invalid execution price (e.g. unitPrice <= 0).
 */
export class InvalidSellPriceError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly unitPrice: string;

  constructor(
    transactionId: string,
    unitPrice: string,
    reason = 'unitPrice must be greater than zero',
  ) {
    super(
      `Invalid SELL transaction price for '${transactionId}': ${reason} (received '${unitPrice}')`,
      'PORTFOLIO_ENGINE.INVALID_SELL_PRICE',
    );
    this.transactionId = transactionId;
    this.unitPrice = unitPrice;
  }
}

/**
 * Thrown when explicit selling costs (fees or taxes) contain negative values.
 */
export class InvalidSellingCostError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly field: string;
  readonly amount: string;

  constructor(transactionId: string, field: string, amount: string) {
    super(
      `Invalid selling cost '${field}' for transaction '${transactionId}': cost cannot be negative (received '${amount}')`,
      'PORTFOLIO_ENGINE.INVALID_SELLING_COST',
    );
    this.transactionId = transactionId;
    this.field = field;
    this.amount = amount;
  }
}

/**
 * Thrown when a calculation requires a known cost basis but the position cost basis is incomplete.
 */
export class IncompleteCostBasisError extends PortfolioReplayError {
  readonly assetId: string;
  readonly accountId?: string;

  constructor(assetId: string, accountId?: string) {
    super(
      `Incomplete cost basis for asset '${assetId}'${accountId ? ` in account '${accountId}'` : ''}: position includes inbound transfers or events without verifiable acquisition costs.`,
      'PORTFOLIO_ENGINE.INCOMPLETE_COST_BASIS',
    );
    this.assetId = assetId;
    this.accountId = accountId;
  }
}

/**
 * Thrown when a SPLIT or REVERSE_SPLIT specifies an invalid factor (e.g. factor <= 0 or factor == 1).
 */
export class InvalidCorporateActionFactorError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly factor: string;

  constructor(
    transactionId: string,
    factor: string,
    reason = 'Factor must be greater than zero and cannot be 1 (no-op)',
  ) {
    super(
      `Invalid corporate action factor for '${transactionId}': ${reason} (received '${factor}')`,
      'PORTFOLIO_ENGINE.INVALID_CA_FACTOR',
    );
    this.transactionId = transactionId;
    this.factor = factor;
  }
}

/**
 * Thrown when a BONUS transaction specifies an invalid bonus quantity (e.g. quantity <= 0).
 */
export class InvalidBonusQuantityError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly quantity: string;

  constructor(transactionId: string, quantity: string) {
    super(
      `Invalid BONUS quantity for '${transactionId}': quantity must be greater than zero (received '${quantity}')`,
      'PORTFOLIO_ENGINE.INVALID_BONUS_QUANTITY',
    );
    this.transactionId = transactionId;
    this.quantity = quantity;
  }
}

/**
 * Thrown when an AMORTIZATION amount exceeds the carried total cost of the position.
 */
export class AmortizationExceedsCostError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly amortizationAmount: string;
  readonly currentTotalCost: string;

  constructor(transactionId: string, amortizationAmount: string, currentTotalCost: string) {
    super(
      `AMORTIZATION amount '${amortizationAmount}' exceeds current carried total cost '${currentTotalCost}' for transaction '${transactionId}'. Negative cost basis is strictly disallowed.`,
      'PORTFOLIO_ENGINE.AMORTIZATION_EXCEEDS_COST',
    );
    this.transactionId = transactionId;
    this.amortizationAmount = amortizationAmount;
    this.currentTotalCost = currentTotalCost;
  }
}

/**
 * Thrown when an AMORTIZATION is attempted on a position with INCOMPLETE cost basis.
 */
export class IncompleteAmortizationCostError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly accountId: string;
  readonly assetId: string;

  constructor(transactionId: string, accountId: string, assetId: string) {
    super(
      `Cannot apply AMORTIZATION '${transactionId}' for asset '${assetId}' in account '${accountId}': position cost basis is INCOMPLETE. Amortization requires a verifiable carried cost basis.`,
      'PORTFOLIO_ENGINE.INCOMPLETE_AMORTIZATION_COST',
    );
    this.transactionId = transactionId;
    this.accountId = accountId;
    this.assetId = assetId;
  }
}

/**
 * Thrown when a corporate action is applied to an account that has no active custody/shares of the target asset.
 */
export class EmptyPositionCorporateActionError extends PortfolioReplayError {
  readonly transactionId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly corporateActionType: string;

  constructor(
    transactionId: string,
    accountId: string,
    assetId: string,
    corporateActionType: string,
  ) {
    super(
      `Cannot apply corporate action '${corporateActionType}' ('${transactionId}') for asset '${assetId}' in account '${accountId}': account holds no active position for this asset.`,
      'PORTFOLIO_ENGINE.EMPTY_POSITION_CORPORATE_ACTION',
    );
    this.transactionId = transactionId;
    this.accountId = accountId;
    this.assetId = assetId;
    this.corporateActionType = corporateActionType;
  }
}
