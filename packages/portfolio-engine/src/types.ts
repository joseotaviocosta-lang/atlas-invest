import {
  PortfolioId,
  AccountId,
  AssetId,
  TransactionId,
  LocalDate,
  Money,
  Quantity,
  Transaction,
  TransactionType,
} from '@atlas/domain';

/**
 * Derived structural state for a specific asset within an account or aggregated in a portfolio.
 * In Phase 1A, this tracks purely structural quantity without premature cost basis math.
 */
export interface AssetState {
  readonly assetId: AssetId;
  readonly quantity: Quantity;
}

/**
 * Derived structural state for an account belonging to a portfolio.
 */
export interface AccountState {
  readonly accountId: AccountId;
  readonly assets: ReadonlyMap<string, AssetState>;
}

/**
 * Derived immutable state of an entire portfolio as of an optional historical date.
 */
export interface PortfolioState {
  readonly portfolioId: PortfolioId;
  readonly asOfDate?: LocalDate;
  readonly accounts: ReadonlyMap<string, AccountState>;
  readonly assets: ReadonlyMap<string, AssetState>;
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
