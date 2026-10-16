import { ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Money, Currency } from '@atlas/domain';
import { replayPortfolio, replayPortfolioTimeline, PortfolioState } from '@atlas/portfolio-engine';
import { HistoricalMarketDataProvider, MarketDataAssetRef } from '@atlas/market-data';
import { valuePosition } from '@atlas/valuation-engine';

export interface HistoricalValuationObservation {
  date: LocalDate;
  value: Money;
  currency: Currency;
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  valuedPositions: number;
  totalPositions: number;
  /**
   * Positions valued with an EXACT price for `date` (priceDate === date),
   * as opposed to PREVIOUS_TRADING_DAY resolution. A valuation that only
   * reuses Friday's price on a Saturday carries no new market information:
   * it is a valid TWR calculation boundary but NOT an economic risk
   * observation (ADR-132).
   */
  exactValuedPositions: number;
}

export class HistoricalValuationBuilder {
  constructor(
    private readonly transactionRepository: ITransactionRepository,
    private readonly assetRepository: IAssetRepository,
    private readonly historicalProvider: HistoricalMarketDataProvider,
  ) {}

  async buildObservation(params: {
    portfolioId: string;
    date: LocalDate;
    currency: Currency;
  }): Promise<HistoricalValuationObservation> {
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: params.date,
    });

    const result = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions,
      asOfDate: params.date,
    });

    return this.valueStatePositions({
      portfolioId: params.portfolioId,
      state: result.state,
      date: params.date,
      currency: params.currency,
    });
  }

  /**
   * Batched historical valuations over many dates with ONE chronological
   * ledger pass (additive 3P performance capability). Uses
   * `replayPortfolioTimeline` once for all requested dates, then resolves
   * prices per date/position exactly as `buildObservation` does. If the
   * timeline replay throws (invalid ledger), falls back to the legacy
   * per-date path so per-date error semantics are preserved exactly.
   */
  async buildObservations(params: {
    portfolioId: string;
    dates: LocalDate[];
    currency: Currency;
  }): Promise<HistoricalValuationObservation[]> {
    if (params.dates.length === 0) return [];

    const sortedDates = [...params.dates].sort((a, b) => a.compare(b));
    const maxDate = sortedDates[sortedDates.length - 1]!;
    const indexByDate = new Map(params.dates.map((date, i) => [date.toString(), i] as const));

    try {
      const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
        endDate: maxDate,
      });
      const timeline = replayPortfolioTimeline({
        portfolioId: params.portfolioId,
        transactions,
        asOfDates: sortedDates,
      });
      const stateByDate = new Map(
        timeline.snapshots.map((s) => [s.asOfDate.toString(), s.state] as const),
      );
      const out: HistoricalValuationObservation[] = new Array(params.dates.length);
      for (const date of params.dates) {
        const state = stateByDate.get(date.toString());
        if (!state) {
          out[indexByDate.get(date.toString())!] = {
            date,
            value: Money.zero(params.currency),
            currency: params.currency,
            status: 'UNAVAILABLE',
            valuedPositions: 0,
            totalPositions: 0,
            exactValuedPositions: 0,
          };
          continue;
        }
        out[indexByDate.get(date.toString())!] = await this.valueStatePositions({
          portfolioId: params.portfolioId,
          state,
          date,
          currency: params.currency,
        });
      }
      return out;
    } catch {
      // Invalid ledger: preserve exact per-date error semantics via the legacy path.
      const out: HistoricalValuationObservation[] = [];
      for (const date of params.dates) {
        try {
          out.push(
            await this.buildObservation({
              portfolioId: params.portfolioId,
              date,
              currency: params.currency,
            }),
          );
        } catch {
          out.push({
            date,
            value: Money.zero(params.currency),
            currency: params.currency,
            status: 'UNAVAILABLE',
            valuedPositions: 0,
            totalPositions: 0,
            exactValuedPositions: 0,
          });
        }
      }
      return out;
    }
  }

  private async valueStatePositions(params: {
    portfolioId: string;
    state: PortfolioState;
    date: LocalDate;
    currency: Currency;
  }): Promise<HistoricalValuationObservation> {
    const positions = Array.from(params.state.assets.values()).filter(
      (p) => p.currency === params.currency,
    );
    if (positions.length === 0) {
      return {
        date: params.date,
        value: Money.zero(params.currency),
        currency: params.currency,
        status: 'UNAVAILABLE',
        valuedPositions: 0,
        totalPositions: 0,
        exactValuedPositions: 0,
      };
    }

    let totalValue = Money.zero(params.currency);
    let valuedCount = 0;
    let exactCount = 0;

    for (const pos of positions) {
      const asset = await this.assetRepository.findById(String(pos.assetId));
      if (!asset) continue;
      const ref: MarketDataAssetRef = {
        assetId: String(pos.assetId) as never,
        ticker: asset.ticker,
        exchange: asset.exchange,
        currency: asset.currency as never,
        assetType: asset.type as never,
      };
      try {
        const histPrice = await this.historicalProvider.getDailyPrice(ref, params.date);
        if (histPrice.status === 'UNAVAILABLE') continue;
        // Reuse valuation-engine logic (quantity × price, currency mismatch, partial)
        const valuation = valuePosition(
          {
            assetId: String(pos.assetId),
            accountId: null,
            quantity: pos.quantity.value,
            currency: params.currency,
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
        if (!valuation.marketValue) continue;
        const mv = Money.from(valuation.marketValue.amount, valuation.marketValue.currency);
        if (mv.currency !== params.currency) continue;
        totalValue = totalValue.add(mv);
        valuedCount++;
        if (histPrice.status === 'EXACT') exactCount++;
      } catch {
        // Price not available within lookback, skip
      }
    }

    const totalPositions = positions.length;
    let status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
    if (valuedCount === 0) status = 'UNAVAILABLE';
    else if (valuedCount < totalPositions) status = 'PARTIAL';

    return {
      date: params.date,
      value: totalValue,
      currency: params.currency,
      status,
      valuedPositions: valuedCount,
      totalPositions,
      exactValuedPositions: exactCount,
    };
  }

  async buildObservationsForPeriod(params: {
    portfolioId: string;
    startDate: LocalDate;
    endDate: LocalDate;
    currencies: Currency[];
    externalFlowDates: LocalDate[];
  }): Promise<HistoricalValuationObservation[]> {
    const allDates = new Set<string>();
    allDates.add(params.startDate.toString());
    allDates.add(params.endDate.toString());
    for (const d of params.externalFlowDates) {
      if (d.compare(params.startDate) >= 0 && d.compare(params.endDate) <= 0) {
        allDates.add(d.toString());
      }
    }
    const sortedDates = Array.from(allDates)
      .map((s) => LocalDate.from(s))
      .sort((a, b) => a.compare(b));

    const observations: HistoricalValuationObservation[] = [];
    for (const date of sortedDates) {
      for (const currency of params.currencies) {
        const obs = await this.buildObservation({
          portfolioId: params.portfolioId,
          date,
          currency,
        });
        if (obs.status !== 'UNAVAILABLE') {
          observations.push(obs);
        }
      }
    }
    return observations;
  }
}
