import { ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Money, Currency } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { HistoricalMarketDataProvider, MarketDataAssetRef } from '@atlas/market-data';
import { valuePosition } from '@atlas/valuation-engine';
import { ScenarioPortfolioSnapshot, ScenarioPosition } from '@atlas/scenario-engine';

function todayCivil(): LocalDate {
  const now = new Date();
  return LocalDate.fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/**
 * Builds a market-value snapshot per currency for deterministic scenario
 * analysis (3O). Reuses the valuation pipeline (portfolio replay + historical
 * price resolution + valuation-engine). Positions without a resolvable quote
 * are included with `marketValue = null` so the scenario engine reports
 * PARTIAL instead of an implicit zero (ADR-165). Never uses cost basis.
 */
export class ScenarioSnapshotBuilder {
  constructor(
    private readonly transactionRepository: ITransactionRepository,
    private readonly assetRepository: IAssetRepository,
    private readonly historicalProvider: HistoricalMarketDataProvider,
  ) {}

  async build(params: {
    portfolioId: string;
    asOf?: LocalDate;
  }): Promise<ScenarioPortfolioSnapshot[]> {
    const asOf = params.asOf ?? todayCivil();
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: asOf,
    });

    const result = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions,
      asOfDate: asOf,
    });

    const byCurrency = new Map<string, ScenarioPosition[]>();
    for (const pos of result.state.assets.values()) {
      const currency = pos.currency as Currency;
      const asset = await this.assetRepository.findById(String(pos.assetId));

      let marketPrice: Money | null = null;
      let marketValue: Money | null = null;
      if (asset) {
        const ref: MarketDataAssetRef = {
          assetId: String(pos.assetId) as never,
          ticker: asset.ticker,
          exchange: asset.exchange,
          currency: asset.currency as never,
          assetType: asset.type as never,
        };
        try {
          const histPrice = await this.historicalProvider.getDailyPrice(ref, asOf);
          const valuation = valuePosition(
            {
              assetId: String(pos.assetId),
              accountId: null,
              quantity: pos.quantity.value,
              currency,
              totalCost: pos.totalCost ? pos.totalCost.amount : null,
              averageCost: pos.averageCost ? pos.averageCost.amount : null,
              costBasisStatus: pos.costBasisStatus,
            },
            {
              assetId: String(pos.assetId),
              price: histPrice.close.amount,
              currency: histPrice.currency as Currency,
              asOf: histPrice.date.toString(),
              receivedAt: new Date().toISOString(),
              source: histPrice.source as never,
              status: 'LIVE' as never,
              freshness: 'FRESH' as never,
              providerSymbol: `${asset.ticker}.${asset.exchange}`,
            },
          );
          if (valuation.marketValue && valuation.marketValue.currency === currency) {
            marketPrice = Money.from(histPrice.close.amount, histPrice.currency);
            marketValue = Money.from(valuation.marketValue.amount, valuation.marketValue.currency);
          }
        } catch {
          marketPrice = null;
          marketValue = null;
        }
      }

      const list = byCurrency.get(currency) ?? [];
      list.push(
        Object.freeze({
          assetId: String(pos.assetId),
          assetClass: asset ? String(asset.type) : 'UNKNOWN',
          quantity: pos.quantity,
          marketPrice,
          marketValue,
          currency,
          // No canonical modified duration exists in the domain; never inferred.
          modifiedDuration: null,
        }),
      );
      byCurrency.set(currency, list);
    }

    return Array.from(byCurrency.entries()).map(([currency, positions]) =>
      Object.freeze({
        portfolioId: params.portfolioId,
        asOf: asOf.toString(),
        currency: currency as Currency,
        positions: Object.freeze(positions) as readonly ScenarioPosition[],
      }),
    );
  }
}
