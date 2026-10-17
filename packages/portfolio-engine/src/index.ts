export * from './version';
export * from './errors';
export * from './types';
export * from './ordering';
export * from './dispatcher';
export * from './engine';
export * from './performance-universe';

import { Transaction, PortfolioId, AssetId, LocalDate, Money, Quantity } from '@atlas/domain';
import { PortfolioState } from './types';

/**
 * Placeholder interface for derived Position (derived state, not source of truth).
 * Maintained for forward contract compatibility.
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
 * High-level Portfolio Engine contract.
 * Reflects core replay capabilities established in Phase 1A.
 */
export interface PortfolioEngineContract {
  calculatePortfolio(transactions: Transaction[], portfolioId: PortfolioId): PortfolioState;
  calculatePortfolioAt(
    transactions: Transaction[],
    portfolioId: PortfolioId,
    date: LocalDate,
  ): PortfolioState;
  rebuildPortfolio(transactions: Transaction[], portfolioId: PortfolioId): PortfolioState;
}
