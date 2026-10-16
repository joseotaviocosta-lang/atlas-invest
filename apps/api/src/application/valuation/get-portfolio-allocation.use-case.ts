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
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';
import { classifyEodQuoteFreshness } from '@atlas/market-data';
import {
  valuePortfolio,
  computePortfolioAllocation,
  ValuationQuote,
  PositionValuationInput,
  PortfolioValuation,
} from '@atlas/valuation-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
} from '../../database/tokens';
import { PortfolioAllocationReadModel } from './read-models';

@Injectable()
export class GetPortfolioAllocationUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(MARKET_QUOTE_REPOSITORY)
    private readonly marketQuoteRepository: IMarketQuoteRepository,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
  }): Promise<PortfolioAllocationReadModel> {
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

    if (consolidatedPositions.length === 0) {
      const emptyValuation = valuePortfolio({
        portfolioId: params.portfolioId,
        positions: [],
        accountPositions: new Map(),
        quotes: new Map(),
      });
      const emptyAllocation = computePortfolioAllocation(emptyValuation);
      return emptyAllocation as unknown as PortfolioAllocationReadModel;
    }

    const quotesMap = new Map<string, ValuationQuote>();

    // Primary lookup: Persisted EOD quotes from database (Single batch query)
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

    const valuation = valuePortfolio({
      portfolioId: params.portfolioId,
      positions: consolidatedPositions,
      accountPositions: new Map(),
      quotes: quotesMap,
    });

    const enrichedPositions = valuation.positions.map((p) => {
      const meta = assetMap.get(p.assetId);
      return meta ? { ...p, ticker: meta.ticker, assetType: meta.type } : p;
    });

    const enrichedValuation: PortfolioValuation = {
      ...valuation,
      positions: enrichedPositions,
    } as PortfolioValuation;

    const allocation = computePortfolioAllocation(enrichedValuation);
    return allocation as unknown as PortfolioAllocationReadModel;
  }
}
