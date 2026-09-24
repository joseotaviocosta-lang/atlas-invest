import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';
import {
  MarketDataService,
  InMemoryMarketDataProvider,
  StooqProviderAdapter,
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
} from '../../database/tokens';
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
  ) {
    const config = readMarketDataConfigFromEnv(process.env as Record<string, string | undefined>);
    const cache = new InMemoryQuoteCache();
    const provider =
      config.provider === 'STOOQ'
        ? new StooqProviderAdapter({ timeoutMs: config.timeoutMs })
        : new InMemoryMarketDataProvider();
    this.marketDataService = new MarketDataService({ provider, cache, config });
  }

  setMarketDataService(service: MarketDataService): void {
    this.marketDataService = service;
  }

  seedQuoteForTesting(seed: {
    providerSymbol: string;
    price: string;
    currency: string;
    status?: string;
  }): void {
    const svc = this.marketDataService as unknown as { provider: { seed?: (s: unknown) => void } };
    if (svc.provider && typeof svc.provider.seed === 'function') {
      svc.provider.seed(seed);
    }
  }

  clearQuotesForTesting(): void {
    const svc = this.marketDataService as unknown as {
      provider: { seeds?: Map<string, unknown>; clear?: () => void };
    };
    if (svc.provider && svc.provider.seeds instanceof Map) {
      svc.provider.seeds.clear();
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

    const consolidatedPositions: PositionValuationInput[] = [];
    const accountPositions = new Map<string, PositionValuationInput[]>();

    for (const assetState of replayResult.state.assets.values()) {
      consolidatedPositions.push({
        assetId: String(assetState.assetId),
        accountId: null,
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
        list.push({
          assetId: String(assetState.assetId),
          accountId: String(acc.accountId),
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

    const assetMap = new Map<
      string,
      { ticker: string; exchange: string; currency: string; type: string }
    >();
    for (const pos of consolidatedPositions) {
      const asset = await this.assetRepository.findById(pos.assetId);
      if (asset) {
        assetMap.set(pos.assetId, {
          ticker: asset.ticker,
          exchange: asset.exchange,
          currency: asset.currency,
          type: asset.type,
        });
      }
    }

    const refs: Array<{
      assetId: string;
      ticker: string;
      exchange: string;
      currency: string;
      assetType: string;
    }> = [];
    for (const pos of consolidatedPositions) {
      const meta = assetMap.get(pos.assetId);
      if (!meta) continue;
      refs.push({
        assetId: pos.assetId as never,
        ticker: meta.ticker,
        exchange: meta.exchange,
        currency: meta.currency,
        assetType: meta.type as never,
      });
    }

    const quotesMap = new Map<string, ValuationQuote>();
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
        // total failure → all unavailable
      }
    }

    const valuation = valuePortfolio({
      portfolioId: params.portfolioId,
      positions: consolidatedPositions,
      accountPositions,
      quotes: quotesMap,
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
      completeness: v.completeness,
      summary: v.summary,
      quoteSummary: v.quoteSummary,
    };
  }
}
