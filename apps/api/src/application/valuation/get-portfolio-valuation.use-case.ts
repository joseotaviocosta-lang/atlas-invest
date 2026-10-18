import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  IPortfolioRepository,
  ITransactionRepository,
  IAssetRepository,
  IMarketQuoteRepository,
} from '@atlas/database';
import { Quantity } from '@atlas/domain';
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';

import {
  classifyEodQuoteFreshness,
  MarketDataService,
  InMemoryMarketDataProvider,
  InMemoryQuoteCache,
  readMarketDataConfigFromEnv,
} from '@atlas/market-data';
import {
  valuePortfolio,
  ValuationQuote,
  PositionValuationInput,
  PortfolioValuation,
} from '@atlas/valuation-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
  FX_OBSERVATION_REPOSITORY,
} from '../../database/tokens';
import { IFxObservationRepository } from '@atlas/database';
import { ValuationFxRate } from '@atlas/valuation-engine';
import { PortfolioValuationReadModel } from './read-models';

@Injectable()
export class GetPortfolioValuationUseCase {
  private marketDataService: MarketDataService;

  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly marketQuoteRepository: IMarketQuoteRepository,
    @Inject(FX_OBSERVATION_REPOSITORY)
    private readonly fxObservationRepository: IFxObservationRepository,
  ) {
    const cfg = readMarketDataConfigFromEnv({
      MARKET_DATA_PROVIDER: 'IN_MEMORY',
    } as unknown as Record<string, string>);
    const provider = new InMemoryMarketDataProvider();
    this.marketDataService = new MarketDataService({
      provider,
      cache: new InMemoryQuoteCache(),
      config: cfg,
    });
  }

  /**
   * Backward compatibility / test helper to allow testing legacy overrides if needed.
   */
  setMarketDataService(service: MarketDataService): void {
    this.marketDataService = service;
  }

  seedQuoteForTesting(seed: {
    providerSymbol: string;
    price: string;
    currency: string;
    status?: string;
  }): void {
    if (!this.marketDataService) {
      const cfg = readMarketDataConfigFromEnv({
        MARKET_DATA_PROVIDER: 'IN_MEMORY',
      } as unknown as Record<string, string>);
      const provider = new InMemoryMarketDataProvider();
      this.marketDataService = new MarketDataService({
        provider,
        cache: new InMemoryQuoteCache(),
        config: cfg,
      });
    }
    const svc = this.marketDataService as unknown as { provider: { seed?: (s: unknown) => void } };
    if (svc.provider && typeof svc.provider.seed === 'function') {
      svc.provider.seed(seed);
    }
  }

  clearQuotesForTesting(): void {
    if (this.marketDataService) {
      const svc = this.marketDataService as unknown as {
        provider: { seeds?: Map<string, unknown>; clear?: () => void };
      };
      if (svc.provider && svc.provider.seeds instanceof Map) {
        svc.provider.seeds.clear();
      }
    }
  }

  async execute(params: {
    portfolioId: string;
    userId: string;
  }): Promise<PortfolioValuationReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);

    let replayResult;
    try {
      replayResult = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
      });
    } catch (err: unknown) {
      if (err instanceof PortfolioReplayError) {
        throw new UnprocessableEntityException({
          message: err.message,
          code: 'PORTFOLIO.REPLAY_FAILED',
        });
      }
      throw err;
    }

    const assetIds = Array.from(replayResult.state.assets.keys()).map(String);
    const assets = await this.assetRepository.findByIds(assetIds);
    const assetMap = new Map<
      string,
      { ticker: string; exchange: string; currency: string; type: string }
    >(
      assets.map((a) => [
        a.id,
        {
          ticker: a.ticker,
          exchange: a.exchange,
          currency: a.currency,
          type: a.type,
        },
      ]),
    );

    const consolidatedPositions: PositionValuationInput[] = [];
    const accountPositions = new Map<string, PositionValuationInput[]>();

    for (const assetState of replayResult.state.assets.values()) {
      const assetIdStr = String(assetState.assetId);
      const meta = assetMap.get(assetIdStr);
      consolidatedPositions.push({
        assetId: assetIdStr,
        accountId: null,
        ticker: meta?.ticker,
        assetType: meta?.type,
        quantity: assetState.quantity.value,
        currency: assetState.currency as never,
        totalCost: assetState.totalCost ? assetState.totalCost.amount : null,
        averageCost: assetState.averageCost ? assetState.averageCost.amount : null,
        costBasisStatus: assetState.costBasisStatus,
      });
    }

    for (const acc of replayResult.state.accounts.values()) {
      const list: PositionValuationInput[] = [];
      for (const assetState of acc.assets.values()) {
        const assetIdStr = String(assetState.assetId);
        const meta = assetMap.get(assetIdStr);
        list.push({
          assetId: assetIdStr,
          accountId: String(acc.accountId),
          ticker: meta?.ticker,
          assetType: meta?.type,
          quantity: assetState.quantity.value,
          currency: assetState.currency as never,
          totalCost: assetState.totalCost ? assetState.totalCost.amount : null,
          averageCost: assetState.averageCost ? assetState.averageCost.amount : null,
          costBasisStatus: assetState.costBasisStatus,
        });
      }
      accountPositions.set(String(acc.accountId), list);
    }

    if (consolidatedPositions.length === 0) {
      const emptyValuation = valuePortfolio({
        portfolioId: params.portfolioId,
        positions: [],
        accountPositions: new Map(),
        quotes: new Map(),
      });
      return this.toReadModel(emptyValuation);
    }

    const quotesMap = new Map<string, ValuationQuote>();

    // 1. Primary lookup: Persisted EOD quotes from database (Single batch query)
    const persistedQuotes = await this.marketQuoteRepository.findLatestByAssets(assetIds);

    for (const assetId of assetIds) {
      const persisted = persistedQuotes.get(assetId);
      if (persisted) {
        const freshnessStatus = classifyEodQuoteFreshness({
          quote: {
            tradingDate: persisted.tradingDate,
          },
        });

        const quoteFreshness = freshnessStatus === 'FRESH' ? 'FRESH' : 'STALE';
        const quoteStatus = freshnessStatus === 'FRESH' ? 'EOD' : 'STALE';

        quotesMap.set(assetId, {
          assetId,
          price: persisted.close,
          currency: persisted.currency as never,
          asOf: persisted.tradingDate.toString(),
          receivedAt: persisted.lastFetchedAt.toISOString(),
          source: persisted.provider,
          status: quoteStatus,
          freshness: quoteFreshness,
          providerSymbol: persisted.providerSymbol,
        });
      }
    }

    // 2. Fallback / Test service lookup (only if injected or seeded for testing)
    if (this.marketDataService) {
      const unquotedAssetIds = assetIds.filter((id) => !quotesMap.has(id));
      if (unquotedAssetIds.length > 0) {
        const refs = unquotedAssetIds
          .map((id) => {
            const meta = assetMap.get(id);
            if (!meta) return null;
            return {
              assetId: id as never,
              ticker: meta.ticker,
              exchange: meta.exchange,
              currency: meta.currency,
              assetType: meta.type as never,
            };
          })
          .filter(Boolean);

        if (refs.length > 0) {
          try {
            const batch = await this.marketDataService.getQuotes(refs as never);
            for (const q of batch.quotes) {
              quotesMap.set(String(q.assetId), {
                assetId: String(q.assetId),
                price: q.price.amount,
                currency: q.currency as never,
                asOf: q.asOf,
                receivedAt: q.receivedAt,
                marketTime: q.marketTime,
                source: q.source,
                status: q.status as never,
                freshness: q.freshness as never,
                providerSymbol: q.providerSymbol,
              });
            }
          } catch {
            // ignore fallback failure
          }
        }
      }
    }

    // 3. Multi-Currency FX Rates Lookup (Phase 5C)
    const distinctCurrencies = Array.from(new Set(consolidatedPositions.map((p) => p.currency)));
    const reportingCurrency = (portfolio.baseCurrency ?? 'BRL') as never;
    const fxRatesMap = new Map<string, ValuationFxRate>();

    for (const cur of distinctCurrencies) {
      if (cur === reportingCurrency) continue;

      // Find latest persisted FX observation for cur/reportingCurrency
      const directObs = await this.fxObservationRepository.findLatest(cur, reportingCurrency);
      if (directObs) {
        fxRatesMap.set(`${cur}::${reportingCurrency}`, {
          baseCurrency: cur as never,
          quoteCurrency: reportingCurrency as never,
          rate: directObs.rate,
          rateDate: directObs.observationDate.toString(),
          source: directObs.source,
          isInverted: false,
        });
      } else {
        // Try inverse (e.g. reportingCurrency/cur)
        const invObs = await this.fxObservationRepository.findLatest(reportingCurrency, cur);
        if (invObs) {
          try {
            const one = Quantity.from('1');
            const invRate = one.divide(Quantity.from(invObs.rate));
            fxRatesMap.set(`${cur}::${reportingCurrency}`, {
              baseCurrency: cur as never,
              quoteCurrency: reportingCurrency as never,
              rate: invRate.value,
              rateDate: invObs.observationDate.toString(),
              source: `${invObs.source}_INVERTED`,
              isInverted: true,
            });
          } catch {
            // ignore inversion error
          }
        }
      }
    }

    const valuation = valuePortfolio({
      portfolioId: params.portfolioId,
      positions: consolidatedPositions,
      accountPositions,
      quotes: quotesMap,
      reportingCurrency,
      fxRates: fxRatesMap,
    });

    const enrichedPositions = valuation.positions.map((p) => {
      const meta = assetMap.get(p.assetId);
      return meta ? { ...p, ticker: meta.ticker, assetType: meta.type } : p;
    });
    const enrichedAccounts = valuation.accounts.map((acc) => ({
      ...acc,
      positions: acc.positions.map((p) => {
        const meta = assetMap.get(p.assetId);
        return meta ? { ...p, ticker: meta.ticker, assetType: meta.type } : p;
      }),
    }));

    const enrichedValuation: PortfolioValuation = {
      ...valuation,
      positions: enrichedPositions,
      accounts: enrichedAccounts,
    } as PortfolioValuation;

    return this.toReadModel(enrichedValuation);
  }

  private toReadModel(v: PortfolioValuation): PortfolioValuationReadModel {
    return {
      portfolioId: v.portfolioId,
      asOf: v.asOf,
      engineVersion: v.engineVersion,
      valuationVersion: v.valuationVersion,
      positions: v.positions.map((p) => ({
        assetId: p.assetId,
        accountId: p.accountId,
        ticker: (p as { ticker?: string }).ticker ?? null,
        assetType: (p as { assetType?: string }).assetType ?? null,
        quantity: p.quantity,
        currency: p.currency,
        totalCost: p.totalCost,
        averageCost: p.averageCost,
        costBasisStatus: p.costBasisStatus,
        quote: p.quote,
        marketValue: p.marketValue,
        unrealizedGainLoss: p.unrealizedGainLoss,
        unrealizedGainLossPercent: p.unrealizedGainLossPercent,
        status: p.status,
        quoteFreshness: p.quoteFreshness,
        quoteStatus: p.quoteStatus,
      })),
      accounts: v.accounts.map((a) => ({
        accountId: a.accountId,
        positions: a.positions.map((p) => ({
          assetId: p.assetId,
          accountId: p.accountId,
          ticker: (p as { ticker?: string }).ticker ?? null,
          assetType: (p as { assetType?: string }).assetType ?? null,
          quantity: p.quantity,
          currency: p.currency,
          totalCost: p.totalCost,
          averageCost: p.averageCost,
          costBasisStatus: p.costBasisStatus,
          quote: p.quote,
          marketValue: p.marketValue,
          unrealizedGainLoss: p.unrealizedGainLoss,
          unrealizedGainLossPercent: p.unrealizedGainLossPercent,
          status: p.status,
          quoteFreshness: p.quoteFreshness,
          quoteStatus: p.quoteStatus,
        })),
        totalsByCurrency: a.totalsByCurrency,
        valuedPositionsCount: a.valuedPositionsCount,
        unavailablePositionsCount: a.unavailablePositionsCount,
        stalePositionsCount: a.stalePositionsCount,
        incompleteCostPositionsCount: a.incompleteCostPositionsCount,
        mismatchPositionsCount: a.mismatchPositionsCount,
      })),
      totalsByCurrency: v.totalsByCurrency,
      ...(v.translatedSummary ? { translatedSummary: v.translatedSummary } : {}),
      completeness: v.completeness,
      summary: v.summary,
      quoteSummary: v.quoteSummary,
    };
  }
}
