/**
 * Project Atlas — Portfolio News Intelligence Types (APP-16J)
 *
 * Canonical model, provider hierarchy, event types, freshness windows,
 * sentiment methods, and portfolio news inbox contracts.
 */

export type NewsEventType =
  | 'FACT_RELEVANT'      // Fato Relevante (CVM / Companhia)
  | 'MARKET_NOTICE'      // Comunicado ao Mercado
  | 'EARNINGS'           // Divulgação de Resultados / Balanço
  | 'DIVIDEND'           // Proventos / Dividendos / JCP / Rendimentos
  | 'CAPITAL_EVENT'      // Aumento de Capital / Subscrição / Bonificação / Desdobramento
  | 'ACQUISITION'        // Aquisição / M&A
  | 'SALE'               // Venda de Ativos / Desinvestimento
  | 'ASSEMBLY'           // Assembleia Geral / AGE / AGO
  | 'MANAGEMENT_REPORT'  // Relatório Gerencial de FII
  | 'REGULATORY'         // Decisão Regulatória / CVM / B3
  | 'OTHER';             // Notícias Gerais de Negócios / Mercado

export type NewsSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNKNOWN';

export type SentimentMethod =
  | 'BRAPI_AI_AGGREGATED'
  | 'HEADLINE_KEYWORD_HEURISTIC'
  | 'EVENT_HEADLINE_RULE'
  | 'HEADLINE_EVENT_RULE'
  | 'OFFICIAL_EVENT_RULE'
  | 'UNKNOWN';

export type NewsFreshness =
  | 'BREAKING'     // <= 24h
  | 'VERY_RECENT'  // <= 3d
  | 'RECENT'       // <= 7d
  | 'CURRENT'      // <= 30d
  | 'CONTEXT'      // <= 90d
  | 'EXPIRED';     // > 90d

export type NewsImportance = 1 | 2 | 3 | 4 | 5;

export type NewsMateriality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';

export interface MaterialityClassification {
  level: NewsMateriality;
  score: number; // 0 to 100
  reasons: string[];
  primaryReason: string;
}

export type AssetNewsDailyStatus =
  | 'MATERIAL_EVENT'
  | 'RECENT_NEWS'
  | 'ROUTINE_ONLY'
  | 'NO_RECENT_NEWS'
  | 'PROVIDER_UNAVAILABLE';

export interface DailyNewsDigestItem {
  id: string;
  canonicalEventId: string;
  ticker: string;
  assets: string[];
  headline: string;
  summary: string;
  eventType: NewsEventType;
  materiality: NewsMateriality;
  materialityScore: number;
  materialityReason: string;
  sentiment: NewsSentiment;
  sentimentScore: number;
  official: boolean;
  publishedAt: string; // ISO 8601
  sourceName: string;
  canonicalUrl?: string;
  sourcesCount: number;
  sources: NewsSourceRef[];
  radarImpact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface PortfolioDailyNewsDigest {
  date: string; // YYYY-MM-DD
  totalEvents: number;
  materialEventsCount: number; // CRITICAL + HIGH + MEDIUM
  attentionEventsCount?: number; // CRITICAL + HIGH (APP-16L-R1)
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  routineCount: number;
  affectedAssetsCount: number;
  affectedAssets: string[];
  items: DailyNewsDigestItem[];
}

export type SourceTrustLevel =
  | 'OFFICIAL'
  | 'TRUSTED_MEDIA'
  | 'AGGREGATOR'
  | 'UNKNOWN';

export type NewsProvider =
  | 'BRAPI_NEWS'
  | 'GOOGLE_NEWS'
  | 'OFFICIAL_REGULATORY'
  | 'FINANCIAL_MEDIA'
  | 'CVM'
  | 'B3'
  | 'CORPORATE_IR'
  | 'FUND_MANAGER_IR';

export type NewsSourceType =
  | 'OFFICIAL_REGULATORY'
  | 'CORPORATE_IR'
  | 'BRAPI_NEWS_AGGREGATED'
  | 'TRUSTED_FINANCIAL_MEDIA'
  | 'GOOGLE_NEWS_RSS_FALLBACK'
  | 'AGGREGATOR'
  | 'UNKNOWN';

export interface NewsSourceRef {
  name: string;
  url: string;
  publishedAt?: string;
}

export interface PortfolioNewsEvent {
  id: string;
  canonicalEventId: string;
  headline: string;
  summary: string;
  publishedAt: string; // ISO 8601
  updatedAt?: string;
  importance: NewsImportance;
  sentiment: NewsSentiment;
  sentimentScore: number; // -1.0 to 1.0
  sentimentMethod: SentimentMethod;
  eventType: NewsEventType;
  assets: string[];
  primaryTickers: string[];
  secondaryTickers: string[];
  sources: NewsSourceRef[];
  provider: NewsProvider;
  sourceType: NewsSourceType;
  official: boolean;
  freshness: NewsFreshness;
  decayWeight: number; // 0.0 to 1.0
  materiality?: NewsMateriality;
  materialityScore?: number;
  materialityReason?: string;
}

export interface RawNewsInput {
  id?: string;
  headline: string;
  summary?: string;
  url?: string;
  sourceName?: string;
  publishedAt: string | Date;
  ticker: string;
  provider?: NewsProvider;
  sourceType?: NewsSourceType;
  importance?: NewsImportance;
  sentiment?: NewsSentiment;
  sentimentMethod?: SentimentMethod;
  official?: boolean;
}

export interface RegulatoryIssuerIdentity {
  ticker: string;
  assetType: 'STOCK' | 'FII' | 'BDR';
  legalName: string;
  cnpj: string;
  cvmCode?: string;
  fundIdentifier?: string;
  source: 'CVM_CAD' | 'CVM_IPE' | 'FNET_B3' | 'MANUAL_OFFICIAL_REGISTRY';
}

export type OfficialComponentStatus =
  | 'AVAILABLE'
  | 'NO_EVENTS'
  | 'UNAVAILABLE'
  | 'STALE_CACHE'
  | 'NOT_APPLICABLE';

export type OfficialProviderStatus =
  | 'OFFICIAL_PROVIDER_AVAILABLE'
  | 'OFFICIAL_PROVIDER_PARTIAL'
  | 'OFFICIAL_PROVIDER_UNAVAILABLE'
  | 'OFFICIAL_PROVIDER_STALE_CACHE'
  | 'UNRESOLVED_REGULATORY_IDENTITY'
  | 'NO_OFFICIAL_EVENTS';

export interface OfficialProviderFetchResult {
  articles: RawNewsInput[];
  resolvedCount: number;
  unresolvedCount: number;
  overallStatus: OfficialProviderStatus;
  cvm: {
    status: OfficialComponentStatus;
    fetched: number;
    fromCache: boolean;
    error?: string;
  };
  fnet: {
    status: OfficialComponentStatus;
    fetched: number;
    error?: string;
  };
  perAssetStatus?: Record<
    string,
    'OFFICIAL_SOURCE_OK' | 'NO_OFFICIAL_EVENTS' | 'IDENTITY_NOT_RESOLVED' | 'PROVIDER_UNAVAILABLE'
  >;
}

export interface PortfolioNewsInboxMetrics {
  breakingCount: number; // <= 24h
  recentCount: number;   // <= 7d
  officialCount: number;
  highImportanceCount: number; // >= 4
  materialCount?: number;      // CRITICAL + HIGH
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  routineCount?: number;
  totalAuditedAssets: number; // 36
  assetsWithNews: number;
  assetsWithoutNews: number;
  officialCoverageCount: number; // Number of assets with resolved regulatory identity
  providerStatus: {
    brapiNewsAvailable: boolean;
    brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE' | 'BRAPI_NEWS_PRO_UNAVAILABLE';
    officialStatus: OfficialProviderStatus;
    cvmStatus?: OfficialComponentStatus;
    fnetStatus?: OfficialComponentStatus;
    fallbackActive: boolean;
    providersUsed: string[];
  };
}

export interface PortfolioNewsInboxResult {
  events: PortfolioNewsEvent[];
  totalEvents: number;
  byAssetCount: Record<string, number>;
  metrics: PortfolioNewsInboxMetrics;
  digest?: PortfolioDailyNewsDigest;
  assetDailyStatus?: Record<string, AssetNewsDailyStatus>;
  asOf: string;
}
