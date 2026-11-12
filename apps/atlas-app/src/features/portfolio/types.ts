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
// Opportunity Radar (APP-16F / APP-16H / APP-16I / APP-16I-R1 / APP-16I-R2)
// ---------------------------------------------------------------------------

export type FiiDividendEventStatusDto = 'ANNOUNCED' | 'HISTORICAL_PATTERN' | 'PAID' | 'UNKNOWN';
export type FiiDividendEligibilityStatusDto = 'ELIGIBLE' | 'RECORD_DATE_TODAY' | 'EX_DIVIDEND' | 'UNKNOWN';
export type FiiReinvestmentChainTypeDto = 'AVAILABLE_CASH_CHAIN' | 'PLANNED_FUTURE_CHAIN';

export interface FiiCashSourceEventDto {
  ticker: string;
  paymentDate: string;
  amountPerShare: number | null;
  source: string;
  paidRecently: boolean;
  estimatedCashReceived?: number | null;
}

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
  reinvestmentEstimatedCash?: number | null;
  reinvestmentOtherSourcesCount?: number;
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
  estimatedCashReceived?: number | null;
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

export interface NewsSourceRefDto {
  name: string;
  url: string;
  publishedAt?: string;
}

export type PortfolioNewsEventStateType = 'NEW' | 'UPDATED' | 'SEEN' | 'UNCHANGED';

export type NewsEventUpdateReason =
  | 'OFFICIAL_SOURCE_ADDED'
  | 'MATERIALITY_CHANGED'
  | 'SENTIMENT_CHANGED'
  | 'NEW_DOCUMENT_VERSION'
  | 'NEW_MATERIAL_INFORMATION'
  | 'SOURCE_SET_CHANGED';

export interface PortfolioNewsEventDto {
  id: string;
  canonicalEventId: string;
  headline: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  importance: 1 | 2 | 3 | 4 | 5;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNKNOWN';
  sentimentScore: number;
  sentimentMethod: string;
  eventType: string;
  assets: string[];
  primaryTickers: string[];
  secondaryTickers: string[];
  sources: NewsSourceRefDto[];
  provider: string;
  sourceType: string;
  official: boolean;
  freshness: 'BREAKING' | 'VERY_RECENT' | 'RECENT' | 'CURRENT' | 'CONTEXT' | 'EXPIRED';
  decayWeight: number;
  materiality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  materialityScore?: number;
  materialityReason?: string;
  state?: PortfolioNewsEventStateType;
  firstSeenAt?: string;
  lastObservedAt?: string;
  lastSeenByUserAt?: string | null;
  eventVersionFingerprint?: string;
  isNew?: boolean;
  isUpdated?: boolean;
  isSeen?: boolean;
  updateReasons?: NewsEventUpdateReason[];
}

export interface DailyNewsDigestItemDto {
  id: string;
  canonicalEventId: string;
  ticker: string;
  assets: string[];
  headline: string;
  summary: string;
  eventType: string;
  materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  materialityScore: number;
  materialityReason: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNKNOWN';
  sentimentScore: number;
  official: boolean;
  publishedAt: string;
  sourceName: string;
  canonicalUrl?: string;
  sourcesCount: number;
  sources: NewsSourceRefDto[];
  radarImpact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  state?: PortfolioNewsEventStateType;
  isNew?: boolean;
  isUpdated?: boolean;
  isSeen?: boolean;
  updateReasons?: NewsEventUpdateReason[];
}

export interface PortfolioDailyNewsDigestDto {
  date: string;
  totalEvents: number;
  materialEventsCount: number;
  attentionEventsCount?: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  routineCount: number;
  affectedAssetsCount: number;
  affectedAssets: string[];
  items: DailyNewsDigestItemDto[];
  newEventsCount?: number;
  newMaterialEventsCount?: number;
  updatedEventsCount?: number;
  seenEventsCount?: number;
}

export interface PortfolioNewsInboxMetricsDto {
  breakingCount: number;
  recentCount: number;
  officialCount: number;
  highImportanceCount: number;
  materialCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  routineCount?: number;
  newEventsCount?: number;
  newMaterialEventsCount?: number;
  updatedEventsCount?: number;
  seenEventsCount?: number;
  totalAuditedAssets: number;
  assetsWithNews: number;
  assetsWithoutNews: number;
  officialCoverageCount?: number;
  providerStatus: {
    brapiNewsAvailable: boolean;
    brapiNewsStatus: string;
    officialStatus?: string;
    cvmStatus?: string;
    fnetStatus?: string;
    fallbackActive: boolean;
    providersUsed: string[];
  };
}

export interface PortfolioNewsAlertCandidateDto {
  portfolioId: string;
  canonicalEventId: string;
  eventVersionFingerprint: string;
  alertIdentityKey: string;
  state: 'NEW' | 'UPDATED';
  materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  ticker: string;
  headline: string;
  materialityReason?: string;
  official: boolean;
  officialSourceLabel?: string;
  publishedAt: string;
}

export interface PortfolioNewsAlertsMetaDto {
  baselineInitializedAt: string | null;
  pendingEligibleCount: number;
  eligibleEvents: PortfolioNewsAlertCandidateDto[];
}

export type PortfolioNewsAlertHistoryStatusDto =
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED'
  | 'UNAVAILABLE';

export type PortfolioNewsAlertTypeDto =
  | 'CRITICAL_NEW'
  | 'CRITICAL_UPDATE'
  | 'MATERIAL_NEW'
  | 'MATERIAL_UPDATE'
  | 'MATERIAL_BATCH_SUMMARY';

export interface PortfolioNewsAlertAuditItemDto {
  canonicalEventId: string;
  eventVersionFingerprint: string;
  ticker?: string;
  eventState?: 'NEW' | 'UPDATED';
  materiality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  alertType?: PortfolioNewsAlertTypeDto;
  headlineSnapshot?: string;
  materialityReasonSnapshot?: string | null;
  sourceLabelSnapshot?: string | null;
  claimedAt?: string | null;
  attemptedAt?: string;
  deliveredAt?: string | null;
  notificationId?: string | null;
  batchEventCount?: number;
  batchTickers?: string[];
  alertAttemptId?: string;
  deliveryStatus?: PortfolioNewsAlertHistoryStatusDto;
  failureReason?: string | null;
}

export interface PortfolioNewsAlertHistoryItemDto {
  id: string;
  alertAttemptId: string;
  ticker: string;
  canonicalEventId: string;
  eventVersionFingerprint: string;
  eventState: 'NEW' | 'UPDATED';
  materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
  alertType: PortfolioNewsAlertTypeDto;
  deliveryStatus: PortfolioNewsAlertHistoryStatusDto;
  headline: string;
  materialityReason: string | null;
  sourceLabel: string | null;
  notificationId: string | null;
  batchEventCount: number;
  batchTickers: string[];
  claimedAt: string | null;
  attemptedAt: string;
  deliveredAt: string | null;
  failureReason: string | null;
}

export interface PortfolioNewsAlertHistoryMetricsDto {
  totalCount: number;
  deliveredCount: number;
  failedCount: number;
  criticalCount: number;
  highCount: number;
}

export interface PortfolioNewsAlertHistoryResponseDto {
  items: PortfolioNewsAlertHistoryItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
  metrics: PortfolioNewsAlertHistoryMetricsDto;
  historyAvailableSince: string | null;
}

export interface PortfolioNewsStateSummaryDto {
  initialized: boolean;
  initializedAt: string | null;
  lastRefreshedAt: string | null;
  alertsInitializedAt?: string | null;
  newEventsCount: number;
  newMaterialEventsCount: number;
  updatedEventsCount: number;
  seenEventsCount: number;
}

export interface PortfolioNewsInboxResponseDto {
  events: PortfolioNewsEventDto[];
  totalEvents: number;
  byAssetCount: Record<string, number>;
  metrics: PortfolioNewsInboxMetricsDto;
  digest?: PortfolioDailyNewsDigestDto;
  assetDailyStatus?: Record<string, string>;
  newsState?: PortfolioNewsStateSummaryDto;
  alertsMeta?: PortfolioNewsAlertsMetaDto;
  asOf: string;
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
  effectiveNewsEvents?: PortfolioNewsEventDto[];
  dividendCalendar?: FiiDividendCalendarEventDto;
  recentPaidDividends?: FiiCashSourceEventDto[];
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
  allRecentPaidSources?: FiiCashSourceEventDto[];
  dividendCalendarStrategyEnabled?: boolean;
  lowConfidenceItems?: OpportunityRadarItemDto[];
  overallCoveragePercent?: number;
  disclaimer: string;
}

export type DecisionTierDto =
  | 'HIGH_PRIORITY'
  | 'REVIEW'
  | 'WATCH'
  | 'INSUFFICIENT_DATA';

export type DecisionChangeTypeDto =
  | 'SCORE_UP'
  | 'SCORE_DOWN'
  | 'RANK_UP'
  | 'RANK_DOWN'
  | 'NEW_MATERIAL_NEWS'
  | 'UPDATED_MATERIAL_NEWS'
  | 'CONFIDENCE_CHANGED'
  | 'CALENDAR_CHANGED';

export interface DecisionRecentChangeDto {
  type: DecisionChangeTypeDto;
  label: string;
  source?: string;
  isOfficial?: boolean;
  canonicalUrl?: string;
}

export interface PortfolioDecisionPriorityItemDto {
  rank: number;
  assetId: string;
  ticker: string;
  name: string;
  assetType: 'STOCK' | 'FII';
  opportunityScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  decisionTier: DecisionTierDto;
  whyNow: string[];
  cautions: string[];
  dataGaps: string[];
  recentChanges: DecisionRecentChangeDto[];
  allocationContext?: {
    portfolioWeight: number;
    classWeight?: number;
    targetWeight?: number;
    gapPercent?: number;
  };
  dividendContext?: {
    recordDate: string | null;
    paymentDate: string | null;
    eligibilityStatus: string;
    amountPerShare: number | null;
    estimatedRecentCash: number | null;
  };
  newsContext?: {
    headline: string;
    source: string;
    isOfficial: boolean;
    aggregator?: string;
    canonicalUrl?: string;
    materiality?: string;
    state?: string;
  };
}

export interface FiiCashRotationBriefDto {
  hasRecentPaidCash: boolean;
  estimatedRecentCashTotal: number | null;
  sourceTickers: string[];
  targetTicker: string | null;
  targetRecordDate: string | null;
  targetPaymentDate: string | null;
  summaryText: string;
}

export interface DecisionBriefContributionContextDto {
  plannedAmount: string | null;
  currency: string;
  source: 'CONTRIBUTION_GOAL' | 'USER_SIMULATION' | 'NONE';
  simulationNote: string | null;
}

export interface DecisionBriefDataQualityDto {
  label: 'BOA' | 'PARCIAL' | 'LIMITADA';
  sufficientCount: number;
  incompleteCount: number;
  totalAssets: number;
  priceCoveragePercent: number;
  fundamentalsCoveragePercent: number;
  newsCoveragePercent: number;
  officialProviderStatus?: string | null;
}

export interface PortfolioDailyDecisionBriefDto {
  portfolioId: string;
  asOf: string;
  generatedAt: string;
  modelVersion: string;
  comparisonBasis: 'PREVIOUS_ANALYSIS' | 'INITIAL_BASELINE';
  summary: string[];
  topPriorities: PortfolioDecisionPriorityItemDto[];
  allEvaluatedCount: number;
  fiiRotation?: FiiCashRotationBriefDto;
  recentMaterialChanges: Array<{
    ticker: string;
    type: DecisionChangeTypeDto;
    label: string;
    isOfficial: boolean;
    source?: string;
    canonicalUrl?: string;
  }>;
  contributionContext: DecisionBriefContributionContextDto;
  dataQuality: DecisionBriefDataQualityDto;
}
