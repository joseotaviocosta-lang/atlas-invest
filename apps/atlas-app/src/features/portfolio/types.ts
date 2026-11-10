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

// ---------------------------------------------------------------------------
// Opportunity Radar (APP-16F / APP-16H / APP-16I / APP-16I-R1)
// ---------------------------------------------------------------------------

export type FiiDividendEventStatusDto = 'ANNOUNCED' | 'HISTORICAL_PATTERN' | 'UNKNOWN';
export type FiiDividendEligibilityStatusDto = 'ELIGIBLE' | 'RECORD_DATE_TODAY' | 'EX_DIVIDEND' | 'UNKNOWN';
export type FiiReinvestmentChainTypeDto = 'AVAILABLE_CASH_CHAIN' | 'PLANNED_FUTURE_CHAIN';

export interface FiiDividendCalendarEventDto {
  ticker: string;
  recordDate: string | null;
  exDate: string | null;
  paymentDate: string | null;
  amountPerShare: number | null;
  eventStatus: FiiDividendEventStatusDto;
  source: string;
  announcedAt?: string | null;
  eligibilityStatus: FiiDividendEligibilityStatusDto;
  daysUntilRecordDate: number | null;
  daysUntilPayment: number | null;
  sameMonthReinvestmentCandidate?: boolean;
  reinvestmentSourceTicker?: string | null;
  reinvestmentChainType?: FiiReinvestmentChainTypeDto | null;
  cashAvailableNow?: boolean;
  futureCashExpected?: boolean;
  reinvestmentChainTargetTicker?: string | null;
  isPaymentPending?: boolean;
}

export interface FiiReinvestmentChainDto {
  sourceTicker: string;
  sourcePaymentDate: string;
  targetTicker: string;
  targetRecordDate: string;
  daysGap: number;
  sameMonth: boolean;
  chainType: FiiReinvestmentChainTypeDto;
  cashAvailableNow: boolean;
  futureCashExpected: boolean;
}

export interface OpportunityNewsItemDto {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  canonicalUrl?: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';
  relevance: number;
}

export interface OpportunityScoreComponentsDto {
  portfolioFit: number;
  valuation: number | null;
  momentum: number | null;
  priceOpportunity: number | null;
  news: number | null;
  outlook: number | null;
  dividendCalendarFit?: number | null;
}

export interface OpportunityDataProvenanceDto {
  sources: string[];
  coveragePercent: number;
  knownDimensionsCount: number;
  totalDimensionsCount: number;
  hasDividendCalendar?: boolean;
}

export interface OpportunityRadarItemDto {
  ticker: string;
  name: string;
  assetId: string;
  assetType: 'STOCK' | 'FII';
  currentPrice: string;
  dailyChangePercent: number | null;
  portfolioWeight: number;
  portfolioQuantity: string;
  marketValue: string;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  components: OpportunityScoreComponentsDto;
  positives: string[];
  risks: string[];
  news: OpportunityNewsItemDto[];
  dividendCalendar?: FiiDividendCalendarEventDto;
  dataFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  dataProvenance?: OpportunityDataProvenanceDto;
  updatedAt: string;
}

export interface OpportunityRadarResponseDto {
  portfolioId: string;
  analysisDate: string;
  updatedAt: string;
  modelVersion: string;
  totalEligible: number;
  totalRanked: number;
  items: OpportunityRadarItemDto[];
  fiiItems?: OpportunityRadarItemDto[];
  fiiCoveragePercent?: number;
  totalFiiEligible?: number;
  totalFiiRanked?: number;
  reinvestmentChains?: FiiReinvestmentChainDto[];
  dividendCalendarStrategyEnabled?: boolean;
  lowConfidenceItems?: OpportunityRadarItemDto[];
  overallCoveragePercent?: number;
  disclaimer: string;
}
