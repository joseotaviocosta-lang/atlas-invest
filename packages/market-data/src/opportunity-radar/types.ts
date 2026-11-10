/**
 * Project Atlas — Opportunity Radar Domain Types (APP-16F / APP-16G / APP-16G-R1)
 *
 * Deterministic scoring, data quality normalization, and explainability models.
 * Model version: opportunity-v1
 */

export const OPPORTUNITY_MODEL_VERSION = 'opportunity-v1';

export type OpportunityAssetType = 'STOCK' | 'FII';

export type OpportunityConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type OpportunitySentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';

export type OpportunityFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export type OpportunityNewsSourceType = 'OFFICIAL_REGULATORY' | 'CORPORATE_IR' | 'FINANCIAL_MEDIA';

export interface OpportunityNewsItem {
  id: string;
  headline: string;
  source: string; // Publisher: e.g. 'InfoMoney', 'Valor Econômico', 'B3', 'CVM'
  aggregator?: string; // Aggregator: e.g. 'GOOGLE_NEWS_RSS', 'DIRECT'
  publishedAt: string; // ISO-8601
  canonicalUrl?: string;
  sentiment: OpportunitySentiment;
  sentimentMethod?: 'HEADLINE_KEYWORD_HEURISTIC' | 'OFFICIAL_FILING' | 'MANUAL';
  sourceType?: OpportunityNewsSourceType;
  relevance: number; // 0..1
}

export interface OpportunityScoreComponents {
  portfolioFit: number; // 0..100
  valuation: number | null; // 0..100 or null if UNKNOWN
  momentum: number | null; // 0..100 or null if UNKNOWN
  priceOpportunity: number | null; // 0..100 or null if UNKNOWN
  news: number | null; // 0..100 or null if UNKNOWN
  outlook: number | null; // 0..100 or null if UNKNOWN
}

export interface OpportunityDataProvenance {
  sources: readonly string[]; // e.g. ['BRAPI', 'B3', 'Google News RSS (Agregador)']
  coveragePercent: number; // 0..100
  knownDimensionsCount: number;
  totalDimensionsCount: number;
  hasRealFundamentals: boolean;
  hasPriceHistory: boolean;
  hasVerifiedNews: boolean;
}

export interface OpportunityAssetInput {
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  currency: string;

  // Portfolio context
  quantity: string;
  marketValue: string;
  portfolioWeight: number; // 0..100 (%)
  classWeight: number; // 0..100 (%)
  targetWeight?: number; // 0..100 (%)

  // Current quote & movement
  currentPrice: string;
  dailyChangePercent?: number | null;
  quoteFreshness?: OpportunityFreshness;
  quoteAsOf?: string;

  // Historical trend & range (Market Data — NOT fundamentals)
  change5dPercent?: number | null;
  change21dPercent?: number | null;
  change63dPercent?: number | null;
  drawdownFromHighPercent?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;

  // True Fundamentals — Equities
  priceEarnings?: number | null; // P/L
  priceToBook?: number | null; // P/VP
  dividendYield?: number | null; // DY (%)
  returnOnEquity?: number | null; // ROE (%)
  debtToEquity?: number | null;

  // True Fundamentals — FIIs
  fiiPriceToBook?: number | null; // P/VP
  fiiDividendYield?: number | null; // DY (%)
  fiiSegment?: string | null;
  fiiLiquidity?: number | null;

  // News & Events
  recentNews?: OpportunityNewsItem[];
  corporateEventsCount?: number | null;
  analystConsensus?: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
  targetPriceRatio?: number | null; // (targetPrice - currentPrice) / currentPrice
}

export interface OpportunityRadarItem {
  ticker: string;
  name: string;
  assetId: string;
  assetType: OpportunityAssetType;
  currentPrice: string;
  dailyChangePercent: number | null;
  portfolioWeight: number;
  portfolioQuantity: string;
  marketValue: string;
  score: number; // 0..100
  confidence: OpportunityConfidence;
  components: OpportunityScoreComponents;
  positives: readonly string[];
  risks: readonly string[];
  news: readonly OpportunityNewsItem[];
  dataFreshness: OpportunityFreshness;
  dataProvenance?: OpportunityDataProvenance;
  updatedAt: string; // ISO-8601
}

export interface OpportunityRadarResult {
  portfolioId: string;
  analysisDate: string; // YYYY-MM-DD
  updatedAt: string; // ISO-8601
  modelVersion: string;
  totalEligible: number;
  totalRanked: number;
  items: readonly OpportunityRadarItem[]; // Top Geral (max 5)
  fiiItems: readonly OpportunityRadarItem[]; // Top FIIs (max 5)
  fiiCoveragePercent: number; // Specific coverage for analyzed FIIs
  totalFiiEligible: number;
  totalFiiRanked: number;
  lowConfidenceItems?: readonly OpportunityRadarItem[];
  allEvaluatedItems?: readonly OpportunityRadarItem[];
  overallCoveragePercent?: number;
  disclaimer: string;
}
