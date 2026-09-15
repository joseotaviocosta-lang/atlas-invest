import { AssetId, LocalDate } from '@atlas/domain';

export const NEWS_DATA_VERSION = '0.1.0';

export interface FinancialNewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: Date;
  relatedAssetIds?: AssetId[];
}

/**
 * Future News Provider contract for financial and macroeconomic feeds.
 * Pure interface contract - zero concrete integrations in Phase 0B.
 */
export interface NewsProvider {
  getNews(limit?: number): Promise<FinancialNewsItem[]>;
  getAssetNews(assetId: AssetId, limit?: number): Promise<FinancialNewsItem[]>;
  getCompanyNews(ticker: string, limit?: number): Promise<FinancialNewsItem[]>;
  getNewsByDate(date: LocalDate): Promise<FinancialNewsItem[]>;
}
