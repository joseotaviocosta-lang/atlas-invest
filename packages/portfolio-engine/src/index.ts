import { Transaction, PortfolioId, AssetId, LocalDate, Money, Quantity } from '@atlas/domain';

export const PORTFOLIO_ENGINE_VERSION = '0.1.0';

/**
 * Placeholder interface for derived Position (derived state, not source of truth).
 */
export interface PositionSummary {
  assetId: AssetId;
  quantity: Quantity;
  averageCost: Money;
  totalCost: Money;
}

export interface PortfolioSummary {
  portfolioId: PortfolioId;
  positions: PositionSummary[];
  updatedAt: Date;
}

/**
 * Future Portfolio Engine contract.
 * Pure interface contract - zero calculation logic in Phase 0B.
 */
export interface PortfolioEngineContract {
  applyTransaction(currentState: PortfolioSummary, transaction: Transaction): PortfolioSummary;
  calculatePosition(transactions: Transaction[], assetId: AssetId): PositionSummary;
  calculatePortfolio(transactions: Transaction[], portfolioId: PortfolioId): PortfolioSummary;
  calculatePortfolioAt(
    transactions: Transaction[],
    portfolioId: PortfolioId,
    date: LocalDate,
  ): PortfolioSummary;
  calculateAverageCost(transactions: Transaction[], assetId: AssetId): Money;
  calculateCashFlow(transactions: Transaction[], portfolioId: PortfolioId): Money;
  rebuildPortfolio(transactions: Transaction[], portfolioId: PortfolioId): PortfolioSummary;
}
