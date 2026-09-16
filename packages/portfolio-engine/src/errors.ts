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
