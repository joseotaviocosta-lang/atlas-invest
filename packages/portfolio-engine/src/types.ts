import {
  PortfolioId,
  AccountId,
  AssetId,
  TransactionId,
  LocalDate,
  Money,
  Quantity,
  Percentage,
  Transaction,
  TransactionType,
  Currency,
} from '@atlas/domain';

/**
 * Status of the cost basis for a derived asset position.
 * - 'KNOWN': The cost basis is complete and mathematically known.
 * - 'INCOMPLETE': The cost basis cannot be determined completely (e.g. inbound transfer without acquisition cost).
 * Unknown cost basis is NEVER represented as zero (ADR-043).
 */
export type CostBasisStatus = 'KNOWN' | 'INCOMPLETE';

/**
 * Status of an economic realized disposal result.
 * - 'KNOWN': Cost basis is known, gain/loss and return percentage are fully computed.
 * - 'INCOMPLETE': Pre-sale cost basis was incomplete, gain/loss cannot be fabricated.
 */
export type RealizedResultStatus = 'KNOWN' | 'INCOMPLETE';

/**
 * Economic disposal record produced by a SELL transaction.
 * Represents economic disposal results, NOT a tax event (ADR-044, ADR-047).
 */
export interface RealizedDisposal {
  readonly transactionId: TransactionId;
  readonly portfolioId: PortfolioId;
  readonly accountId: AccountId;
  readonly assetId: AssetId;
  readonly tradeDate: LocalDate;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly grossProceeds: Money;
  readonly sellingCosts: Money;
  readonly netProceeds: Money;
  readonly costBasisRemoved?: Money;
  readonly realizedGainLoss?: Money;
  readonly realizedReturnPercentage?: Percentage;
  readonly currency: Currency;
  readonly status: RealizedResultStatus;
}

/**
 * Summary of aggregated realized disposal results for a specific currency (ADR-045).
 */
export interface RealizedSummary {
  readonly currency: Currency;
  readonly status: RealizedResultStatus;
  readonly grossProceeds: Money;
  readonly sellingCosts: Money;
  readonly netProceeds: Money;
  readonly costBasisRemoved?: Money;
  readonly realizedGainLoss?: Money;
  readonly realizedReturnPercentage?: Percentage;
  readonly disposalCount: number;
}

/**
 * Derived state for a specific asset within an account or aggregated in a portfolio.
 * In Phase 1B, this tracks quantity, carried total cost, unit average cost, and cost basis status.
 */
export interface AssetState {
  readonly assetId: AssetId;
  readonly quantity: Quantity;
  readonly totalCost?: Money;
  readonly averageCost?: Money;
  readonly currency?: Currency;
  readonly costBasisStatus: CostBasisStatus;
}

/**
 * Derived structural state for an account belonging to a portfolio.
 */
export interface AccountState {
  readonly accountId: AccountId;
  readonly assets: ReadonlyMap<string, AssetState>;
  readonly realizedDisposals: readonly RealizedDisposal[];
  readonly realizedSummary: ReadonlyMap<Currency, RealizedSummary>;
}

/**
 * Derived immutable state of an entire portfolio as of an optional historical date.
 */
export interface PortfolioState {
  readonly portfolioId: PortfolioId;
  readonly asOfDate?: LocalDate;
  readonly accounts: ReadonlyMap<string, AccountState>;
  readonly assets: ReadonlyMap<string, AssetState>;
  readonly realizedDisposals: readonly RealizedDisposal[];
  readonly realizedSummary: ReadonlyMap<Currency, RealizedSummary>;
  readonly processedTransactionCount: number;
  readonly appliedTransactionCount: number;
  readonly deferredTransactionCount: number;
}

/**
 * Record of a recognized transaction whose financial semantics are formally deferred.
 * Ensures zero silent drops and full audit transparency.
 */
export interface DeferredPortfolioEvent {
  readonly transactionId: TransactionId;
  readonly type: TransactionType;
  readonly reason: string;
  readonly tradeDate: LocalDate;
  readonly assetId?: AssetId;
  readonly amount?: Money;
  readonly quantity?: Quantity;
}

/**
 * Full deterministic replay output containing the derived state, audit lists, and engine metadata.
 */
export interface ReplayResult {
  readonly engineVersion: string;
  readonly state: PortfolioState;
  readonly appliedTransactions: readonly Transaction[];
  readonly deferredEvents: readonly DeferredPortfolioEvent[];
  readonly totalProcessedCount: number;
}

/**
 * Input arguments for replaying a portfolio ledger.
 */
export interface ReplayOptions {
  readonly portfolioId: PortfolioId | string;
  readonly transactions: readonly Transaction[];
  readonly asOfDate?: LocalDate | string;
}
