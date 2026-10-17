import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IPortfolioRepository,
  ITransactionRepository,
  IAssetRepository,
  IMarketQuoteRepository,
} from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio, derivePerformanceAssetUniverse } from '@atlas/portfolio-engine';
import {
  MarketDataProvider,
  HistoricalMarketDataProvider,
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
  InMemoryMarketDataProvider,
  InMemoryHistoricalMarketDataProvider,
  assetRefFromAsset,
  normalizeTradingDate,
  daysBetweenLocalDates,
} from '@atlas/market-data';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
} from '../../database/tokens';
import {
  MARKET_DATA_PROVIDER,
  HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
} from '../../market-data/tokens';

export interface IngestionReceipt {
  portfolioId: string;
  provider: string;
  requestedAssets: number;
  resolvedAssets: number;
  skippedAssets: number;
  quotesFetched: number;
  quotesInserted: number;
  quotesUnchanged: number;
  quotesRevised: number;
  authRequiredAssets: string[];
  missingAssets: string[];
  rateLimitedAssets: string[];
  providerErrors: string[];
  startedAt: string;
  finishedAt: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'EMPTY_UNIVERSE' | 'FAILED';
}

export interface UpdatePortfolioMarketDataParams {
  portfolioId: string;
  userId: string;
  lookbackDays?: number;
  from?: string;
  to?: string;
  providerOverride?: 'BRAPI' | 'IN_MEMORY';
}

@Injectable()
export class UpdatePortfolioMarketDataUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly marketQuoteRepository: IMarketQuoteRepository,
    @Inject(MARKET_DATA_PROVIDER)
    private readonly defaultMarketDataProvider: MarketDataProvider,
    @Inject(HISTORICAL_MARKET_DATA_INGESTION_PROVIDER)
    private readonly defaultHistoricalIngestionProvider: HistoricalMarketDataProvider,
  ) {}

  async execute(params: UpdatePortfolioMarketDataParams): Promise<IngestionReceipt> {
    const startedAt = new Date().toISOString();

    // 1. Authorize portfolio ownership (Strict 404 anti-enumeration)
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // Determine providers (support test / dev override)
    let marketDataProvider = this.defaultMarketDataProvider;
    let historicalProvider = this.defaultHistoricalIngestionProvider;

    if (params.providerOverride === 'IN_MEMORY') {
      const inMemory = new InMemoryMarketDataProvider();
      inMemory.seed({ providerSymbol: 'PETR4', price: '38.45', currency: 'BRL', status: 'EOD' });
      inMemory.seed({ providerSymbol: 'VALE3', price: '65.00', currency: 'BRL', status: 'EOD' });
      inMemory.seed({ providerSymbol: 'ITUB4', price: '35.20', currency: 'BRL', status: 'EOD' });
      inMemory.seed({ providerSymbol: 'BBDC4', price: '14.80', currency: 'BRL', status: 'EOD' });
      inMemory.seed({ providerSymbol: 'BBAS3', price: '28.10', currency: 'BRL', status: 'EOD' });
      marketDataProvider = inMemory;

      const inMemoryHist = new InMemoryHistoricalMarketDataProvider();
      inMemoryHist.seed({
        ticker: 'PETR4',
        exchange: 'B3',
        date: '2026-10-13',
        close: '38.00',
        currency: 'BRL',
      });
      inMemoryHist.seed({
        ticker: 'PETR4',
        exchange: 'B3',
        date: '2026-10-14',
        close: '38.25',
        currency: 'BRL',
      });
      inMemoryHist.seed({
        ticker: 'PETR4',
        exchange: 'B3',
        date: '2026-10-15',
        close: '38.50',
        currency: 'BRL',
      });
      historicalProvider = inMemoryHist;
    } else if (params.providerOverride === 'BRAPI') {
      marketDataProvider = new BrapiProviderAdapter();
      historicalProvider = new BrapiHistoricalMarketDataProvider();
    }

    const providerName = marketDataProvider.provider;

    const receipt: IngestionReceipt = {
      portfolioId: params.portfolioId,
      provider: providerName,
      requestedAssets: 0,
      resolvedAssets: 0,
      skippedAssets: 0,
      quotesFetched: 0,
      quotesInserted: 0,
      quotesUnchanged: 0,
      quotesRevised: 0,
      authRequiredAssets: [],
      missingAssets: [],
      rateLimitedAssets: [],
      providerErrors: [],
      startedAt,
      finishedAt: '',
      status: 'COMPLETED',
    };

    const lookback = params.lookbackDays ?? 0;
    const isHistorical = lookback > 0 || Boolean(params.from && params.to);

    let fromDate: LocalDate | undefined;
    let toDate: LocalDate | undefined;

    if (params.from && params.to) {
      fromDate = LocalDate.from(params.from);
      toDate = LocalDate.from(params.to);
      if (fromDate.compare(toDate) > 0) {
        throw new BadRequestException({
          message: `Invalid date range: 'from' (${params.from}) cannot be after 'to' (${params.to})`,
          code: 'VALIDATION.INVALID_DATE_RANGE',
        });
      }
      const days = daysBetweenLocalDates(fromDate, toDate);
      if (days > 365 * 5) {
        throw new BadRequestException({
          message: `Date range exceeds maximum allowed limit of 5 years (requested ${days} days)`,
          code: 'VALIDATION.RANGE_TOO_LARGE',
        });
      }
    } else if (lookback > 0) {
      if (lookback > 365 * 5) {
        throw new BadRequestException({
          message: `Lookback days exceeds maximum allowed limit of 5 years (requested ${lookback} days)`,
          code: 'VALIDATION.RANGE_TOO_LARGE',
        });
      }
      const now = new Date();
      toDate = LocalDate.fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
      const past = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);
      fromDate = LocalDate.fromParts(
        past.getUTCFullYear(),
        past.getUTCMonth() + 1,
        past.getUTCDate(),
      );
    }

    // 2. Discover target asset universe
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    let targetAssetIds: string[];
    if (isHistorical && fromDate && toDate) {
      const universe = derivePerformanceAssetUniverse({
        portfolioId: params.portfolioId,
        transactions,
        from: fromDate,
        to: toDate,
      });
      targetAssetIds = universe.map((id) => String(id));
    } else {
      const replayResult = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
      });
      targetAssetIds = Array.from(replayResult.state.assets.keys()).map((id) => String(id));
    }

    receipt.requestedAssets = targetAssetIds.length;

    if (targetAssetIds.length === 0) {
      receipt.status = isHistorical ? 'EMPTY_UNIVERSE' : 'COMPLETED';
      receipt.finishedAt = new Date().toISOString();
      return receipt;
    }

    // 3. Resolve symbols from asset catalog
    const assets = await this.assetRepository.findByIds(targetAssetIds);
    const assetMap = new Map<string, (typeof assets)[number]>(
      assets.map((a) => [a.id as string, a]),
    );

    // 4. Ingest quotes for each target asset
    for (const assetId of targetAssetIds) {
      const asset = assetMap.get(assetId as unknown as string);
      if (!asset) {
        receipt.skippedAssets++;
        continue;
      }

      const assetRef = assetRefFromAsset(asset);
      receipt.resolvedAssets++;

      if (isHistorical && fromDate && toDate) {
        // Historical backfill path
        try {
          const prices = await historicalProvider.getDailyPrices(assetRef, fromDate, toDate);
          receipt.quotesFetched += prices.length;

          for (const hp of prices) {
            const upsertRes = await this.marketQuoteRepository.upsertQuote({
              assetId: asset.id,
              tradingDate: hp.date,
              currency: hp.currency,
              close: hp.close.amount,
              provider: providerName,
              providerSymbol: asset.ticker,
            });

            if (upsertRes.outcome === 'INSERTED') receipt.quotesInserted++;
            else if (upsertRes.outcome === 'UNCHANGED') receipt.quotesUnchanged++;
            else if (upsertRes.outcome === 'REVISED') receipt.quotesRevised++;
          }
        } catch {
          receipt.providerErrors.push(asset.ticker);
        }
      } else {
        // Latest EOD quote path
        try {
          const quoteResult = await marketDataProvider.getQuotes([assetRef]);

          if (quoteResult.unavailable.length > 0) {
            const un = quoteResult.unavailable[0];
            if (un?.code === 'MARKET_DATA.AUTHENTICATION_REQUIRED') {
              receipt.authRequiredAssets.push(asset.ticker);
            } else if (un?.code === 'MARKET_DATA.RATE_LIMITED') {
              receipt.rateLimitedAssets.push(asset.ticker);
            } else if (un?.code === 'MARKET_DATA.SYMBOL_NOT_FOUND') {
              receipt.missingAssets.push(asset.ticker);
            } else {
              receipt.providerErrors.push(asset.ticker);
            }
          }

          if (quoteResult.quotes.length > 0) {
            const q = quoteResult.quotes[0];
            if (q) {
              receipt.quotesFetched++;
              const tradingDate = normalizeTradingDate(q.marketTime ?? q.asOf);

              const upsertRes = await this.marketQuoteRepository.upsertQuote({
                assetId: asset.id,
                tradingDate,
                currency: q.currency,
                close: q.price.amount,
                provider: providerName,
                providerSymbol: q.providerSymbol,
              });

              if (upsertRes.outcome === 'INSERTED') receipt.quotesInserted++;
              else if (upsertRes.outcome === 'UNCHANGED') receipt.quotesUnchanged++;
              else if (upsertRes.outcome === 'REVISED') receipt.quotesRevised++;
            }
          }
        } catch {
          receipt.providerErrors.push(asset.ticker);
        }
      }
    }

    if (
      receipt.authRequiredAssets.length > 0 ||
      receipt.missingAssets.length > 0 ||
      receipt.rateLimitedAssets.length > 0 ||
      receipt.providerErrors.length > 0
    ) {
      receipt.status = 'COMPLETED_WITH_WARNINGS';
    }

    receipt.finishedAt = new Date().toISOString();
    return receipt;
  }
}
