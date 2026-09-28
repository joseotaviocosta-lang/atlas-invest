export type MarketIntelligenceSourceType =
  | 'NEWS'
  | 'CORPORATE_ANNOUNCEMENT'
  | 'MATERIAL_FACT'
  | 'REGULATORY_FILING'
  | 'EXCHANGE_NOTICE'
  | 'OTHER_TRUSTED_MARKET_SOURCE';

export type MarketIntelligenceItemCategory =
  | 'MACRO'
  | 'COMPANY_NEWS'
  | 'CORPORATE_ANNOUNCEMENT'
  | 'MATERIAL_FACT'
  | 'EARNINGS'
  | 'GOVERNANCE'
  | 'REGULATORY'
  | 'DIVIDENDS'
  | 'OTHER';

export type MarketIntelligenceItemStatus = 'ACTIVE' | 'RETRACTED' | 'SUPERSEDED';

export type MarketIntelligenceItemId = string;

/**
 * Normalized raw DTO produced by trusted source adapters before ingestion & deduplication.
 */
export interface MarketIntelligenceSourceItem {
  readonly sourceProvider: string;
  readonly sourceType: MarketIntelligenceSourceType;
  readonly sourceItemId: string;
  readonly headline: string;
  readonly excerpt?: string;
  readonly canonicalUrl?: string;
  readonly publishedAt: Date;
  readonly category: MarketIntelligenceItemCategory;
  readonly language?: string;
  readonly rawSymbols?: readonly string[];
  readonly status?: MarketIntelligenceItemStatus;
}

/**
 * Canonical domain representation of an ingested, deduplicated external market item.
 */
export interface MarketIntelligenceItem {
  readonly id: MarketIntelligenceItemId;
  readonly sourceProvider: string;
  readonly sourceType: MarketIntelligenceSourceType;
  readonly sourceItemId: string;
  readonly headline: string;
  readonly excerpt?: string;
  readonly canonicalUrl?: string;
  readonly publishedAt: Date;
  readonly retrievedAt: Date;
  readonly category: MarketIntelligenceItemCategory;
  readonly language: string;
  readonly status: MarketIntelligenceItemStatus;
  readonly linkedAssetIds: readonly string[];
}

/**
 * Provider-neutral trusted source interface.
 * Zero provider-specific types leak into domain or application contracts.
 */
export interface MarketIntelligenceSource {
  readonly providerName: string;
  fetchItems(params?: { since?: Date; until?: Date; cursor?: string; limit?: number }): Promise<{
    items: readonly MarketIntelligenceSourceItem[];
    nextCursor?: string;
  }>;
}
