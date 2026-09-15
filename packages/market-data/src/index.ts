import { Asset, AssetId, LocalDate, Money } from '@atlas/domain';

export const MARKET_DATA_VERSION = '0.1.0';

export interface MarketQuote {
  assetId: AssetId;
  price: Money;
  change: string;
  timestamp: Date;
}

export interface HistoricalPrice {
  date: LocalDate;
  close: Money;
  open?: Money;
  high?: Money;
  low?: Money;
  volume?: string;
}

export interface CorporateAction {
  assetId: AssetId;
  type: 'DIVIDEND' | 'JCP' | 'SPLIT' | 'BONUS';
  approvalDate: LocalDate;
  exDate: LocalDate;
  paymentDate?: LocalDate;
  value: string;
}

/**
 * Future Market Data Provider contract (B3, Yahoo, AlphaVantage, etc.).
 * Pure interface contract - zero concrete SDK integrations in Phase 0B.
 */
export interface MarketDataProvider {
  getQuote(ticker: string, exchange: string): Promise<MarketQuote>;
  getHistoricalPrices(
    ticker: string,
    exchange: string,
    startDate: LocalDate,
    endDate: LocalDate,
  ): Promise<HistoricalPrice[]>;
  getAsset(assetId: AssetId): Promise<Asset | null>;
  searchAssets(query: string): Promise<Asset[]>;
  getFundamentals(ticker: string, exchange: string): Promise<Record<string, string>>;
  getCorporateActions(ticker: string, exchange: string): Promise<CorporateAction[]>;
}
