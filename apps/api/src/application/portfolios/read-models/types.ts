/**
 * Application Read Models for the Portfolio Engine boundary (Fase 1G).
 *
 * Strict boundary rules (ADR-062, ADR-065):
 * 1. Zero exposure of @atlas/portfolio-engine internal types (PortfolioState, AssetState, etc.).
 * 2. All financial values (amounts, quantities, percentages) are serialized as strings.
 * 3. Incomplete / unknown costs are serialized as null, never 0 or "0".
 * 4. Dates are serialized as YYYY-MM-DD or ISO strings.
 */

export interface MoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface PortfolioPositionReadModel {
  readonly assetId: string;
  readonly quantity: string;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly currency?: string;
  readonly totalCost: MoneyReadModel | null;
  readonly averageCost: MoneyReadModel | null;
}

export interface RealizedSummaryReadModel {
  readonly currency: string;
  readonly status: 'KNOWN' | 'INCOMPLETE';
  readonly grossProceeds: MoneyReadModel;
  readonly sellingCosts: MoneyReadModel;
  readonly netProceeds: MoneyReadModel;
  readonly costBasisRemoved: MoneyReadModel | null;
  readonly realizedGainLoss: MoneyReadModel | null;
  readonly realizedReturnPercentage: string | null;
  readonly disposalCount: number;
}

export interface IncomeSummaryReadModel {
  readonly currency: string;
  readonly totalDividends: MoneyReadModel;
  readonly totalJcp: MoneyReadModel;
  readonly totalFiiIncome: MoneyReadModel;
  readonly totalIncome: MoneyReadModel;
}

export interface CashFlowSummaryReadModel {
  readonly currency: string;
  readonly totalInflows: MoneyReadModel;
  readonly totalOutflows: MoneyReadModel;
  readonly netExternalFlow: MoneyReadModel;
  readonly totalExternalContributions: MoneyReadModel;
  readonly totalExternalWithdrawals: MoneyReadModel;
  readonly totalCapitalReturns: MoneyReadModel;
  readonly totalFees: MoneyReadModel;
  readonly totalTaxes: MoneyReadModel;
}

export interface AccountStateReadModel {
  readonly accountId: string;
  readonly positions: readonly PortfolioPositionReadModel[];
  readonly realizedSummaries: readonly RealizedSummaryReadModel[];
  readonly incomeSummaries: readonly IncomeSummaryReadModel[];
  readonly cashFlowSummaries: readonly CashFlowSummaryReadModel[];
}

export interface ReplayMetadataReadModel {
  readonly engineVersion: string;
  readonly asOfDate: string | null;
  readonly processedTransactionCount: number;
  readonly appliedTransactionCount: number;
  readonly deferredTransactionCount: number;
  readonly hasIncompleteCostBasis: boolean;
}

export interface PortfolioCompletenessReadModel {
  readonly costBasis: 'COMPLETE' | 'INCOMPLETE';
}

export interface PortfolioStateReadModel {
  readonly portfolioId: string;
  readonly asOfDate: string | null;
  readonly engineVersion: string;
  readonly completeness: PortfolioCompletenessReadModel;
  readonly positions: readonly PortfolioPositionReadModel[];
  readonly accounts: readonly AccountStateReadModel[];
  readonly realizedSummaries: readonly RealizedSummaryReadModel[];
  readonly incomeSummaries: readonly IncomeSummaryReadModel[];
  readonly cashFlowSummaries: readonly CashFlowSummaryReadModel[];
  readonly replayMetadata: ReplayMetadataReadModel;
}

export interface PortfolioPositionsReadModel {
  readonly portfolioId: string;
  readonly accountId: string | null;
  readonly asOfDate: string | null;
  readonly positions: readonly PortfolioPositionReadModel[];
}

export type PortfolioHistoryKind =
  'REALIZED_DISPOSAL' | 'INCOME' | 'CASH_FLOW' | 'CORPORATE_ACTION' | 'TRANSFER';

export interface PortfolioHistoryItemReadModel {
  readonly id: string;
  readonly kind: PortfolioHistoryKind;
  readonly transactionId: string;
  readonly tradeDate: string;
  readonly accountId: string;
  readonly assetId: string | null;
  readonly currency: string | null;
  readonly details: Record<string, unknown>;
  readonly rectification?: {
    readonly status: 'SUPERSEDED' | 'CORRECTION';
    readonly replacementTransactionId: string | null;
    readonly originalTransactionId: string | null;
    readonly reason: string | null;
    readonly decidedAt: string;
  } | null;
}

export interface PortfolioHistoryPaginationMeta {
  readonly limit: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly totalCount: number;
}

export interface PortfolioHistoryReadModel {
  readonly items: readonly PortfolioHistoryItemReadModel[];
  readonly meta: PortfolioHistoryPaginationMeta;
}
