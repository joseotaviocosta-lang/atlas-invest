import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IWatchlistRepository, IAssetRepository, IMarketQuoteRepository } from '@atlas/database';
import { classifyEodQuoteFreshness } from '@atlas/market-data';
import {
  WATCHLIST_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
} from '../../database/tokens';
import { WatchlistItemDto, WatchlistAssetQuoteDto } from './dto/watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(
    @Inject(WATCHLIST_REPOSITORY)
    private readonly watchlistRepo: IWatchlistRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepo: IAssetRepository,
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly marketQuoteRepo: IMarketQuoteRepository,
  ) {}

  async list(userId: string): Promise<WatchlistItemDto[]> {
    const items = await this.watchlistRepo.listByUser(userId);
    if (items.length === 0) return [];

    const assetIds = items.map((i) => i.assetId);
    const quotesMap = await this.marketQuoteRepo.findLatestByAssets(assetIds);

    return items.map((item) => {
      const persisted = quotesMap.get(item.assetId);
      let quote: WatchlistAssetQuoteDto | null = null;
      let quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED' = 'UNVALUED';

      if (persisted) {
        const freshnessStatus = classifyEodQuoteFreshness({
          quote: { tradingDate: persisted.tradingDate },
        });
        const freshness = freshnessStatus === 'FRESH' ? 'FRESH' : 'STALE';
        quoteFreshness = freshness;
        quote = {
          price: persisted.close,
          currency: persisted.currency,
          tradingDate: persisted.tradingDate.toString(),
          provider: persisted.provider,
          freshness,
        };
      }

      return {
        id: item.id,
        assetId: item.assetId,
        ticker: item.asset?.ticker ?? '',
        name: item.asset?.name ?? '',
        type: item.asset?.type ?? '',
        currency: item.asset?.currency ?? 'BRL',
        exchange: item.asset?.exchange ?? '',
        addedAt: item.createdAt.toISOString(),
        quote,
        quoteFreshness,
      };
    });
  }

  async add(userId: string, assetId: string): Promise<WatchlistItemDto> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: 'COMMON.NOT_FOUND',
        message: `Asset ${assetId} not found`,
      });
    }

    const item = await this.watchlistRepo.add(userId, assetId);
    const persisted = await this.marketQuoteRepo.findLatest(assetId);

    let quote: WatchlistAssetQuoteDto | null = null;
    let quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED' = 'UNVALUED';

    if (persisted) {
      const freshnessStatus = classifyEodQuoteFreshness({
        quote: { tradingDate: persisted.tradingDate },
      });
      const freshness = freshnessStatus === 'FRESH' ? 'FRESH' : 'STALE';
      quoteFreshness = freshness;
      quote = {
        price: persisted.close,
        currency: persisted.currency,
        tradingDate: persisted.tradingDate.toString(),
        provider: persisted.provider,
        freshness,
      };
    }

    return {
      id: item.id,
      assetId: item.assetId,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      exchange: asset.exchange,
      addedAt: item.createdAt.toISOString(),
      quote,
      quoteFreshness,
    };
  }

  async remove(userId: string, assetId: string): Promise<{ removed: boolean }> {
    const existing = await this.watchlistRepo.findByUserAndAsset(userId, assetId);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: 'COMMON.NOT_FOUND',
        message: `Watchlist item for asset ${assetId} not found`,
      });
    }

    await this.watchlistRepo.remove(userId, assetId);
    return { removed: true };
  }
}
