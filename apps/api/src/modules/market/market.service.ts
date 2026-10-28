import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IAssetRepository,
  IMarketQuoteRepository,
  IWatchlistRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { classifyEodQuoteFreshness } from '@atlas/market-data';
import {
  ASSET_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
  WATCHLIST_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import {
  MarketAssetDetailDto,
  MarketAssetDetailQuoteDto,
  MarketAssetHeldPortfolioDto,
} from './dto/market-asset-detail.dto';

@Injectable()
export class MarketService {
  constructor(
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepo: IAssetRepository,
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly marketQuoteRepo: IMarketQuoteRepository,
    @Inject(WATCHLIST_REPOSITORY)
    private readonly watchlistRepo: IWatchlistRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepo: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepo: ITransactionRepository,
  ) {}

  async getAssetDetail(assetId: string, userId: string): Promise<MarketAssetDetailDto> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: 'COMMON.NOT_FOUND',
        message: `Asset ${assetId} not found`,
      });
    }

    const [persistedQuote, isWatched, userPortfolios] = await Promise.all([
      this.marketQuoteRepo.findLatest(assetId),
      this.watchlistRepo.isWatched(userId, assetId),
      this.portfolioRepo.findByUserId(userId),
    ]);

    let quote: MarketAssetDetailQuoteDto | null = null;
    let quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED' = 'UNVALUED';

    if (persistedQuote) {
      const freshnessStatus = classifyEodQuoteFreshness({
        quote: { tradingDate: persistedQuote.tradingDate },
      });
      const freshness = freshnessStatus === 'FRESH' ? 'FRESH' : 'STALE';
      quoteFreshness = freshness;
      quote = {
        price: persistedQuote.close,
        currency: persistedQuote.currency,
        tradingDate: persistedQuote.tradingDate.toString(),
        provider: persistedQuote.provider,
        freshness,
      };
    }

    // Determine if asset is held in any user portfolio
    const heldInPortfolios: MarketAssetHeldPortfolioDto[] = [];
    for (const portfolio of userPortfolios) {
      const transactions = await this.transactionRepo.findByPortfolioId(portfolio.id);
      if (transactions.length > 0) {
        try {
          const replay = replayPortfolio({
            portfolioId: portfolio.id,
            transactions,
          });
          if (replay.state.assets.has(assetId)) {
            heldInPortfolios.push({
              id: portfolio.id,
              name: portfolio.name,
            });
          }
        } catch {
          // If replay fails on an edge case, isolate partial failure gracefully
        }
      }
    }

    return {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      exchange: asset.exchange,
      quote,
      quoteFreshness,
      isWatched,
      isHeld: heldInPortfolios.length > 0,
      heldInPortfolios,
      fundamentals: {
        status: 'UNAVAILABLE',
        providerStatus: 'MARKET_DATA_PROVIDER_GAP',
        message:
          'Dados fundamentalistas detalhados exigem conector com provedor de dados de mercado homologado.',
      },
      news: {
        status: 'UNAVAILABLE',
        providerStatus: 'MARKET_DATA_PROVIDER_GAP',
        message: 'Feed de notícias corporativas em tempo real exige integração externa homologada.',
      },
    };
  }
}
