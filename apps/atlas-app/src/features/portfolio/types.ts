/**
 * Canonical types and DTOs for Portfolio read models in Atlas Desktop.
 * Strictly adheres to decimal strings for all monetary/quantity values.
 */

export interface ValuationMoneyJSON {
  amount: string;
  currency: string;
}

export interface PortfolioDto {
  id: string;
  name: string;
  type?: string;
  description?: string;
  baseCurrency?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PositionQuoteDto {
  assetId: string;
  price: string;
  currency: string;
  asOf: string;
  receivedAt: string;
  source: string;
  status: string;
  freshness: string;
  providerSymbol: string;
}

export interface PositionValuationDto {
  assetId: string;
  accountId: string | null;
  ticker?: string | null;
  assetType?: string | null;
  quantity: string;
  currency: string;
  totalCost: ValuationMoneyJSON | null;
  averageCost: ValuationMoneyJSON | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  quote: PositionQuoteDto | null;
  marketValue: ValuationMoneyJSON | null;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  status: string;
  quoteFreshness: string | null;
  quoteStatus: string | null;
}

export interface CurrencyValuationTotalsDto {
  currency: string;
  marketValue: ValuationMoneyJSON;
  costBasis: ValuationMoneyJSON;
  knownCost: ValuationMoneyJSON;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  valuedPositionsCount: number;
  unvaluedPositionsCount: number;
  stalePositionsCount: number;
}

export interface PortfolioValuationData {
  portfolioId: string;
  asOf: string | null;
  engineVersion: string;
  valuationVersion: string;
  positions: PositionValuationDto[];
  totalsByCurrency: Record<string, CurrencyValuationTotalsDto>;
  completeness: string;
  summary: {
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    unavailablePositions: number;
    incompleteCostPositions: number;
    stalePositions: number;
    mismatchPositions: number;
    valuationCoveragePercent: string;
    currencies: string[];
  };
  quoteSummary: {
    totalQuotesRequested: number;
    quotesAvailable: number;
    quotesUnavailable: number;
    quotesStale: number;
    marketDataState?: string;
    provider?: string;
  };
}

export interface PortfolioValuationResponse {
  data: PortfolioValuationData;
}

export interface AllocationItem {
  assetId: string;
  ticker?: string;
  assetType?: string;
  currency: string;
  marketValue: ValuationMoneyJSON;
  allocationPercent: string;
  quoteFreshness: string | null;
}

export interface AssetClassAllocationItem {
  assetClass: string;
  currency: string;
  marketValue: ValuationMoneyJSON;
  allocationPercent: string;
  assetCount: number;
}

export interface UnvaluedAssetItem {
  assetId: string;
  ticker?: string;
  assetType?: string;
  currency: string;
  reason: string;
}

export interface CurrencyAllocationBucket {
  currency: string;
  totalMarketValue: ValuationMoneyJSON;
  byAsset: AllocationItem[];
  byAssetClass: AssetClassAllocationItem[];
  unvaluedAssets: UnvaluedAssetItem[];
}

export interface PortfolioAllocationData {
  portfolioId: string;
  asOf: string | null;
  status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  valuationCoveragePercent: string;
  currencies: Record<string, CurrencyAllocationBucket>;
}

export interface PortfolioAllocationResponse {
  data: PortfolioAllocationData;
}

export interface CurrencyPerformanceDto {
  currency: string;
  twr: string | null;
  xirr: string | null;
  twrStatus: string;
  xirrStatus: string;
  status: string;
  dataAvailability: string;
  benchmark?: {
    id: string;
    name: string;
    currency: string;
    return: string | null;
    status: string;
    dataAvailability: string;
  } | null;
  differencePercentagePoints?: string | null;
}

export interface PortfolioPerformanceData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<string, CurrencyPerformanceDto>;
  status: string;
  dataAvailability: string;
}

export interface PortfolioPerformanceResponse {
  data: PortfolioPerformanceData;
}

export interface PortfolioHistoryItemDto {
  id: string;
  type: string;
  tradeDate: string;
  currency: string;
  accountId?: string;
  assetId?: string;
  ticker?: string;
  quantity?: string;
  unitPrice?: string | ValuationMoneyJSON;
  totalAmount?: string | ValuationMoneyJSON;
  notes?: string;
}

export interface PortfolioHistoryResponse {
  data: PortfolioHistoryItemDto[];
  meta?: {
    limit: number;
    cursor?: string;
    nextCursor?: string | null;
    hasMore: boolean;
  };
}

export interface IngestionReceiptDto {
  portfolioId?: string;
  requestedAt: string;
  completedAt: string;
  quotesRequested: number;
  quotesUpdated: number;
  quotesFailed: number;
  quotesStale: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'EMPTY';
  message?: string;
}
