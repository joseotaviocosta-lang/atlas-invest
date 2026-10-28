export interface MarketAssetDetailQuoteDto {
  price: string;
  currency: string;
  tradingDate: string;
  provider: string;
  freshness: 'FRESH' | 'STALE';
}

export interface MarketAssetHeldPortfolioDto {
  id: string;
  name: string;
}

export interface MarketAssetProviderLimitationDto {
  status: 'UNAVAILABLE';
  providerStatus: 'MARKET_DATA_PROVIDER_GAP';
  message: string;
}

export interface MarketAssetDetailDto {
  id: string;
  ticker: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  quote: MarketAssetDetailQuoteDto | null;
  quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED';
  isWatched: boolean;
  isHeld: boolean;
  heldInPortfolios: MarketAssetHeldPortfolioDto[];
  fundamentals: MarketAssetProviderLimitationDto;
  news: MarketAssetProviderLimitationDto;
}
