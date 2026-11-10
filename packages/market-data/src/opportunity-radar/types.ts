/**
 * Project Atlas — Opportunity Radar Domain Types (APP-16F)
 *
 * Deterministic scoring and explainability models for Daily Opportunity Radar.
 * Model version: opportunity-v1
 */

export const OPPORTUNITY_MODEL_VERSION = 'opportunity-v1';

export type OpportunityAssetType = 'STOCK' | 'FII';

export type OpportunityConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type OpportunitySentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';

export type OpportunityFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface OpportunityNewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAt: string; // ISO-8601
  canonicalUrl?: string;
  sentiment: OpportunitySentiment;
  relevance: number; // 0..1
}

export interface OpportunityScoreComponents {
  portfolioFit: number; // 0..100
  valuation: number; // 0..100
  momentum: number; // 0..100 (or trend for FII)
  priceOpportunity: number; // 0..100 (or incomeQuality for FII)
  news: number; // 0..100
  outlook: number; // 0..100
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

  // Historical trend & range
  change5dPercent?: number | null;
  change21dPercent?: number | null;
  change63dPercent?: number | null;
  drawdownFromHighPercent?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;

  // Fundamentals — Equities
  priceEarnings?: number | null; // P/L
  priceToBook?: number | null; // P/VP
  dividendYield?: number | null; // DY (%)
  returnOnEquity?: number | null; // ROE (%)
  debtToEquity?: number | null;

  // Fundamentals — FIIs
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
  updatedAt: string; // ISO-8601
}

export interface OpportunityRadarResult {
  portfolioId: string;
  analysisDate: string; // YYYY-MM-DD
  updatedAt: string; // ISO-8601
  modelVersion: string;
  totalEligible: number;
  totalRanked: number;
  items: readonly OpportunityRadarItem[];
  disclaimer: string;
}
