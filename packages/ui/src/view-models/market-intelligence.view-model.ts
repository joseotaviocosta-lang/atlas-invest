export interface WatchlistAssetQuoteVM {
  readonly price: string;
  readonly currency: string;
  readonly tradingDate: string;
  readonly provider: string;
  readonly freshness: 'FRESH' | 'STALE';
}

export interface WatchlistItemVM {
  readonly id: string;
  readonly assetId: string;
  readonly ticker: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly exchange: string;
  readonly addedAt: string;
  readonly quote: WatchlistAssetQuoteVM | null;
  readonly quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED';
}

export interface MarketAssetDetailQuoteVM {
  readonly price: string;
  readonly currency: string;
  readonly tradingDate: string;
  readonly provider: string;
  readonly freshness: 'FRESH' | 'STALE';
}

export interface MarketAssetHeldPortfolioVM {
  readonly id: string;
  readonly name: string;
}

export interface MarketAssetProviderLimitationVM {
  readonly status: 'UNAVAILABLE';
  readonly providerStatus: 'MARKET_DATA_PROVIDER_GAP';
  readonly message: string;
}

export interface MarketAssetDetailVM {
  readonly id: string;
  readonly ticker: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly exchange: string;
  readonly quote: MarketAssetDetailQuoteVM | null;
  readonly quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED';
  readonly isWatched: boolean;
  readonly isHeld: boolean;
  readonly heldInPortfolios: readonly MarketAssetHeldPortfolioVM[];
  readonly fundamentals: MarketAssetProviderLimitationVM;
  readonly news: MarketAssetProviderLimitationVM;
}

export function watchlistQueryKey(): readonly string[] {
  return ['watchlist'];
}

export function marketAssetDetailQueryKey(assetId: string): readonly [string, string] {
  return ['market-asset-detail', assetId];
}
