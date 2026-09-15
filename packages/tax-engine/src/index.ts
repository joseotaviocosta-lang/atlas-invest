import { PortfolioId, AssetId, Money, Quantity, Transaction } from '@atlas/domain';

export const TAX_ENGINE_VERSION = '0.1.0';

export interface TaxPosition {
  assetId: AssetId;
  totalCost: Money;
  accumulatedLoss: Money;
}

export interface TaxPeriodSummary {
  month: number;
  year: number;
  grossSales: Money;
  realizedGain: Money;
  exemptGain: Money;
  taxableGain: Money;
  darfDue: Money;
}

/**
 * Future Tax Engine contract for Brazilian capital market rules.
 * Pure interface contract - zero tax calculations in Phase 0B.
 * Strict boundary: never depends on @atlas/ai-engine or UI.
 */
export interface TaxEngineContract {
  calculateTaxPosition(transactions: Transaction[], assetId: AssetId): TaxPosition;
  calculateRealizedGain(sellTransaction: Transaction, averageCost: Money): Money;
  calculateTaxLoss(transactions: Transaction[], period: { month: number; year: number }): Money;
  calculateCompensation(grossGain: Money, accumulatedLoss: Money): Money;
  simulateSale(
    assetId: AssetId,
    quantity: Quantity,
    simulatedUnitPrice: Money,
  ): { estimatedTax: Money; netProceeds: Money };
  calculateTaxPeriod(portfolioId: PortfolioId, year: number, month: number): TaxPeriodSummary;
}
