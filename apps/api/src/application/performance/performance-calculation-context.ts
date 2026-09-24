import { ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Money, Currency } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { Transaction } from '@atlas/domain';
import {
  HistoricalValuationBuilder,
  HistoricalValuationObservation,
} from './historical-valuation.builder';

export interface CalculationObservation {
  date: LocalDate;
  value: Money;
  currency: Currency;
}

export interface CalculationCashFlow {
  date: LocalDate;
  amount: Money;
  direction: 'INFLOW' | 'OUTFLOW';
}

export interface CurrencyCalculationContext {
  currency: Currency;
  observations: CalculationObservation[];
  cashFlows: CalculationCashFlow[];
  availabilityByDate: Record<string, 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE'>;
  /**
   * Dates with ≥1 position valued at an EXACT price (priceDate === date).
   * Dates resolved purely via PREVIOUS_TRADING_DAY carry no new market
   * information: valid TWR calculation boundaries, but not economic risk
   * observations (ADR-132).
   */
  exactPriceByDate: Record<string, boolean>;
}

export interface PerformanceCalculationContext {
  effectiveStart: LocalDate;
  effectiveEnd: LocalDate;
  currencies: Currency[];
  externalFlowDates: LocalDate[];
  perCurrency: CurrencyCalculationContext[];
}

/**
 * Clamps a requested civil period to the ledger inception (earliest
 * tradeDate), mirroring 3E/3H semantics: risk/series are never computed
 * before the portfolio's real economic start.
 */
export function clampPeriodToInception(
  transactions: Transaction[],
  start: LocalDate,
  end: LocalDate,
): { effectiveStart: LocalDate; effectiveEnd: LocalDate } {
  let effectiveStart = start;
  let effectiveEnd = end;
  if (transactions.length > 0) {
    const sortedTx = [...transactions].sort((a, b) => a.tradeDate.compare(b.tradeDate));
    const inceptionLd = sortedTx[0]!.tradeDate;
    if (effectiveStart.compare(inceptionLd) < 0) effectiveStart = inceptionLd;
    if (effectiveEnd.compare(inceptionLd) < 0) effectiveEnd = inceptionLd;
  }
  return { effectiveStart, effectiveEnd };
}

/**
 * Shared financial calculation context for performance-derived read models
 * (3H series, 3I risk). Builds, per currency:
 *
 * - historical valuation observations at the caller-provided calculation
 *   dates (with per-date AVAILABLE/PARTIAL/UNAVAILABLE tracking), and
 * - external cash flows (DEPOSIT/WITHDRAWAL) for TWR neutralization.
 *
 * Callers choose calculation dates per methodology: the series endpoint uses
 * display dates ∪ flow dates (ADR-124); the risk endpoint uses every civil
 * date ∪ flow dates (ADR-131). Replay, price resolution and flow collection
 * are implemented once, here — never duplicated per endpoint.
 */
export class PerformanceCalculationContextBuilder {
  constructor(
    private readonly transactionRepository: ITransactionRepository,
    private readonly assetRepository: IAssetRepository,
    private readonly historicalProvider: HistoricalMarketDataProvider,
  ) {}

  async build(params: {
    portfolioId: string;
    transactions: Transaction[];
    start: LocalDate;
    end: LocalDate;
    calcDates: LocalDate[];
  }): Promise<PerformanceCalculationContext> {
    const { portfolioId, transactions } = params;

    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      params.start,
      params.end,
    );

    let currencies: Currency[] = ['BRL' as Currency];
    try {
      const result = replayPortfolio({ portfolioId, transactions });
      const allCurrencies = new Set<Currency>();
      for (const pos of result.state.assets.values()) {
        if (pos.currency) allCurrencies.add(pos.currency as Currency);
      }
      if (allCurrencies.size > 0) {
        currencies = Array.from(allCurrencies);
      }
    } catch {
      // ignore: fall back to BRL-only
    }

    const externalFlows = transactions.filter(
      (t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL',
    );
    const externalFlowDates = externalFlows
      .map((t) => t.tradeDate)
      .filter((d) => d.compare(effectiveStart) >= 0 && d.compare(effectiveEnd) <= 0);

    const builder = new HistoricalValuationBuilder(
      this.transactionRepository,
      this.assetRepository,
      this.historicalProvider,
    );

    const perCurrency: CurrencyCalculationContext[] = [];
    for (const cur of currencies) {
      const availabilityByDate: Record<string, 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE'> = {};
      const exactPriceByDate: Record<string, boolean> = {};
      const observations: CalculationObservation[] = [];
      // Batched historical timeline: ONE chronological ledger pass for all
      // calculation dates (additive 3P capability). Outputs are identical to
      // the legacy per-date buildObservation path.
      let valuations: HistoricalValuationObservation[];
      try {
        valuations = await builder.buildObservations({
          portfolioId,
          dates: params.calcDates,
          currency: cur,
        });
      } catch {
        valuations = params.calcDates.map((date) => ({
          date,
          value: Money.zero(cur),
          currency: cur,
          status: 'UNAVAILABLE',
          valuedPositions: 0,
          totalPositions: 0,
          exactValuedPositions: 0,
        }));
      }
      for (let i = 0; i < params.calcDates.length; i++) {
        const date = params.calcDates[i]!;
        const valuation = valuations[i]!;
        availabilityByDate[date.toString()] =
          valuation.status === 'COMPLETE'
            ? 'AVAILABLE'
            : valuation.status === 'PARTIAL'
              ? 'PARTIAL'
              : 'UNAVAILABLE';
        if (valuation.status !== 'UNAVAILABLE') {
          observations.push({
            date: valuation.date,
            value: valuation.value,
            currency: valuation.currency,
          });
          exactPriceByDate[date.toString()] = valuation.exactValuedPositions > 0;
        }
      }

      const cashFlows: CalculationCashFlow[] = [];
      for (const t of externalFlows) {
        const txCurrency = (t as unknown as { currency?: string }).currency as Currency | undefined;
        if (txCurrency && txCurrency !== cur) continue;
        const amount =
          (t as unknown as { totalAmount?: Money }).totalAmount ??
          (t as unknown as { amount?: Money }).amount;
        if (!amount || amount.currency !== cur) continue;
        cashFlows.push({
          date: t.tradeDate,
          amount,
          direction: t.type === 'DEPOSIT' ? 'INFLOW' : 'OUTFLOW',
        });
      }

      perCurrency.push({
        currency: cur,
        observations,
        cashFlows,
        availabilityByDate,
        exactPriceByDate,
      });
    }

    return { effectiveStart, effectiveEnd, currencies, externalFlowDates, perCurrency };
  }
}
