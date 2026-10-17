import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Currency } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  HistoricalMarketDataProvider,
  InMemoryHistoricalMarketDataProvider,
} from '@atlas/market-data';
import { calculatePortfolioPerformance } from '@atlas/performance-engine';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  calculateBenchmarkReturn,
  calculateExcessReturn,
  calculateRateBenchmarkReturn,
  BENCHMARK_DEFINITIONS,
  BENCHMARK_IDS,
  BenchmarkId,
} from '@atlas/benchmark-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import {
  HISTORICAL_MARKET_DATA_PROVIDER,
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../market-data/tokens';
import { PortfolioPerformanceReadModel } from './read-models';
import { HistoricalValuationBuilder } from './historical-valuation.builder';

@Injectable()
export class GetPortfolioPerformanceUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
    @Inject(BENCHMARK_DATA_PROVIDER)
    private readonly benchmarkProvider: BenchmarkDataProvider,
    @Inject(RATE_BENCHMARK_DATA_PROVIDER)
    private readonly rateBenchmarkProvider: RateBenchmarkDataProvider,
  ) {}

  // For testing: allow injecting historical prices
  seedHistoricalPriceForTesting(seed: {
    ticker: string;
    exchange: string;
    date: string;
    close: string;
    currency: string;
  }): void {
    const provider = this.historicalProvider as InMemoryHistoricalMarketDataProvider;
    if (typeof provider.seed === 'function') {
      provider.seed(seed);
    }
  }

  seedRateBenchmarkForTesting(seed: {
    benchmarkId: string;
    date: string;
    rate: string;
    unit?: string;
  }): void {
    const provider = this.rateBenchmarkProvider as unknown as {
      seed?: (d: unknown) => void;
    };
    if (typeof provider.seed === 'function') {
      provider.seed(seed);
    }
  }

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    benchmark?: string;
  }): Promise<PortfolioPerformanceReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // Validate period
    let start: LocalDate | undefined;
    let end: LocalDate | undefined;
    if (params.startDate) {
      try {
        start = LocalDate.from(params.startDate);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message,
          code: 'PERFORMANCE.INVALID_PERIOD',
        });
      }
    }
    if (params.endDate) {
      try {
        end = LocalDate.from(params.endDate);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message,
          code: 'PERFORMANCE.INVALID_PERIOD',
        });
      }
    }
    if (start && end && start.compare(end) > 0) {
      throw new BadRequestException({
        message: `Invalid period: startDate '${params.startDate}' must be <= endDate '${params.endDate}'`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (params.benchmark && !(BENCHMARK_IDS as readonly string[]).includes(params.benchmark)) {
      throw new BadRequestException({
        message: `Unsupported benchmark '${params.benchmark}'. Supported: ${BENCHMARK_IDS.join(', ')}`,
        code: 'PERFORMANCE.INVALID_BENCHMARK',
      });
    }

    const periodStart = start ?? LocalDate.from('2026-08-20');
    const periodEnd = end ?? LocalDate.from('2026-09-20');

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    // Compute inception as earliest tradeDate (real economic start)
    let inceptionDate: string | null = null;
    if (transactions.length > 0) {
      const sortedTx = [...transactions].sort((a, b) => a.tradeDate.compare(b.tradeDate));
      inceptionDate = sortedTx[0]!.tradeDate.toString();
    }
    let effectiveStart = periodStart;
    let effectiveEnd = periodEnd;
    if (inceptionDate) {
      const inceptionLd = LocalDate.from(inceptionDate);
      if (effectiveStart.compare(inceptionLd) < 0) effectiveStart = inceptionLd;
      if (effectiveEnd.compare(inceptionLd) < 0) effectiveEnd = inceptionLd;
    }

    let currencies: Currency[] = ['BRL' as Currency];
    try {
      const result = replayPortfolio({ portfolioId: params.portfolioId, transactions });
      const allCurrencies = new Set<Currency>();
      for (const pos of result.state.assets.values()) {
        if (pos.currency) allCurrencies.add(pos.currency as Currency);
      }
      if (allCurrencies.size > 0) {
        currencies = Array.from(allCurrencies);
      }
    } catch {
      // ignore
    }

    // Collect external flow dates for TWR boundaries
    const externalFlows = transactions.filter(
      (t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL',
    );
    const flowDates = externalFlows
      .map((t) => t.tradeDate)
      .filter((d) => d.compare(effectiveStart) >= 0 && d.compare(effectiveEnd) <= 0);

    // Try to build historical observations
    const builder = new HistoricalValuationBuilder(
      this.transactionRepository,
      this.assetRepository,
      this.historicalProvider,
    );

    const observationsByCurrency: Record<
      string,
      Array<{ date: LocalDate; value: import('@atlas/domain').Money; currency: Currency }>
    > = {};
    const cashFlowsByCurrency: Record<
      string,
      Array<{
        date: LocalDate;
        amount: import('@atlas/domain').Money;
        direction: 'INFLOW' | 'OUTFLOW';
      }>
    > = {};

    // Tracks whether any historical valuation used for a currency was PARTIAL
    // (some positions lacked a price). This propagates into the benchmark
    // comparison status, so a partial series is never labelled complete.
    const valuationPartialByCurrency: Record<string, boolean> = {};

    for (const cur of currencies) {
      const obs: Array<{
        date: LocalDate;
        value: import('@atlas/domain').Money;
        currency: Currency;
      }> = [];
      const flows: Array<{
        date: LocalDate;
        amount: import('@atlas/domain').Money;
        direction: 'INFLOW' | 'OUTFLOW';
      }> = [];

      const dates = new Set<string>([
        effectiveStart.toString(),
        effectiveEnd.toString(),
        ...flowDates.map((d) => d.toString()),
      ]);
      for (const dateStr of Array.from(dates).sort()) {
        const date = LocalDate.from(dateStr);
        try {
          const valuation = await builder.buildObservation({
            portfolioId: params.portfolioId,
            date,
            currency: cur,
          });
          if (valuation.status !== 'UNAVAILABLE') {
            obs.push({
              date: valuation.date,
              value: valuation.value,
              currency: valuation.currency,
            });
          }
          if (valuation.status === 'PARTIAL') {
            valuationPartialByCurrency[cur] = true;
          }
        } catch {
          // ignore
        }
      }

      // Build cash flows for this currency
      for (const t of externalFlows) {
        // Check if transaction currency matches (via asset? use totalAmount currency)
        // For simplicity, use t.currency if exists, else cur
        const txCurrency = (t as unknown as { currency?: string }).currency as Currency | undefined;
        if (txCurrency && txCurrency !== cur) continue;
        // Extract amount: for DEPOSIT/WITHDRAWAL, amount is totalAmount
        const amount =
          (t as unknown as { totalAmount?: import('@atlas/domain').Money }).totalAmount ??
          (t as unknown as { amount?: import('@atlas/domain').Money }).amount;
        if (!amount || amount.currency !== cur) continue;
        flows.push({
          date: t.tradeDate,
          amount,
          direction: t.type === 'DEPOSIT' ? 'INFLOW' : 'OUTFLOW',
        });
      }

      observationsByCurrency[cur] = obs;
      cashFlowsByCurrency[cur] = flows;
    }

    // If no observations at all, return UNAVAILABLE
    const totalObs = Object.values(observationsByCurrency).reduce(
      (acc, v) => acc + (v as unknown as Array<unknown>).length,
      0,
    );
    if (totalObs < 2) {
      const currenciesRecord: Record<
        string,
        {
          currency: string;
          twr: string | null;
          xirr: string | null;
          twrStatus: string;
          xirrStatus: string;
          status: string;
          dataAvailability: string;
        }
      > = {};
      for (const cur of currencies) {
        currenciesRecord[cur] = {
          currency: cur,
          twr: null,
          xirr: null,
          twrStatus: 'INSUFFICIENT_DATA',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        };
      }
      return {
        portfolioId: params.portfolioId,
        period: { startDate: effectiveStart.toString(), endDate: effectiveEnd.toString() },
        inceptionDate,
        currencies: currenciesRecord,
        status: 'INSUFFICIENT_DATA',
        dataAvailability: 'UNAVAILABLE',
      };
    }

    const perf = calculatePortfolioPerformance({
      period: { startDate: effectiveStart, endDate: effectiveEnd },
      observationsByCurrency: observationsByCurrency as never,
      cashFlowsByCurrency: cashFlowsByCurrency as never,
    });

    const currenciesRecord2: Record<
      string,
      {
        currency: string;
        twr: string | null;
        xirr: string | null;
        twrStatus: string;
        xirrStatus: string;
        status: string;
        dataAvailability: string;
      }
    > = {};
    for (const [cur, data] of Object.entries(perf.currencies) as Array<
      [string, import('@atlas/performance-engine').PerformanceByCurrency]
    >) {
      const base: {
        currency: string;
        twr: string | null;
        xirr: string | null;
        twrStatus: string;
        xirrStatus: string;
        status: string;
        dataAvailability: string;
        benchmark?: {
          id: string;
          name: string;
          currency: string;
          type: string;
          return: string | null;
          status: string;
          dataAvailability: string;
          observationCount?: number;
        } | null;
        differencePercentagePoints?: string | null;
      } = {
        currency: cur,
        twr: data.twr ? data.twr.returnPercentage.value : null,
        xirr: data.xirr?.returnPercentage ? data.xirr.returnPercentage.value : null,
        twrStatus: data.twr?.status ?? 'INSUFFICIENT_DATA',
        xirrStatus: data.xirr?.status ?? 'INSUFFICIENT_DATA',
        status: data.status,
        dataAvailability: data.dataAvailability,
      };

      // Benchmark comparison. Routed by benchmark type (ADR-117):
      //   PRICE_INDEX -> BenchmarkDataProvider + calculateBenchmarkReturn
      //   RATE_SERIES -> RateBenchmarkDataProvider + calculateRateBenchmarkReturn
      // BRL-only in 3G: no FX, no cross-currency benchmark.
      if (params.benchmark && cur !== 'BRL') {
        base.benchmark = null;
        base.differencePercentagePoints = null;
      } else if (params.benchmark && cur === 'BRL' && data.twr) {
        const benchmarkId = params.benchmark as BenchmarkId;
        const def = BENCHMARK_DEFINITIONS[benchmarkId];
        // A PARTIAL portfolio performance series makes the whole comparison
        // PARTIAL, even when the benchmark series itself is complete.
        const portfolioPartial =
          data.dataAvailability === 'PARTIAL' || valuationPartialByCurrency[cur] === true;

        if (def.type === 'PRICE_INDEX') {
          try {
            const startObs = await this.benchmarkProvider.getObservation(benchmarkId, periodStart);
            const endObs = await this.benchmarkProvider.getObservation(benchmarkId, periodEnd);
            const benchRet = calculateBenchmarkReturn({
              benchmarkId,
              startLevel: startObs.value,
              endLevel: endObs.value,
            });
            const excess = calculateExcessReturn({
              portfolioTwr: data.twr.returnPercentage,
              benchmarkReturn: benchRet,
            });
            base.benchmark = {
              id: benchmarkId,
              name: def.name,
              currency: def.currency,
              type: def.type,
              return: benchRet.value,
              status: portfolioPartial ? 'PARTIAL' : 'AVAILABLE',
              dataAvailability: portfolioPartial ? 'PARTIAL' : 'AVAILABLE',
            };
            base.differencePercentagePoints = excess.value;
          } catch {
            base.benchmark = {
              id: benchmarkId,
              name: def.name,
              currency: def.currency,
              type: def.type,
              return: null,
              status: 'UNAVAILABLE',
              dataAvailability: 'UNAVAILABLE',
            };
            base.differencePercentagePoints = null;
          }
        } else {
          try {
            const observations = await this.rateBenchmarkProvider.getRateObservations(
              benchmarkId,
              periodStart,
              periodEnd,
            );
            const rateReturn = calculateRateBenchmarkReturn({
              benchmarkId,
              observations,
              startDate: periodStart,
              endDate: periodEnd,
            });
            if (rateReturn.status === 'UNAVAILABLE' || rateReturn.returnPercentage === null) {
              throw new Error('No rate observations for period');
            }
            const excess = calculateExcessReturn({
              portfolioTwr: data.twr.returnPercentage,
              benchmarkReturn: rateReturn.returnPercentage,
            });
            const status = portfolioPartial ? 'PARTIAL' : rateReturn.status;
            base.benchmark = {
              id: benchmarkId,
              name: def.name,
              currency: def.currency,
              type: def.type,
              return: rateReturn.returnPercentage.value,
              status,
              dataAvailability: status,
              observationCount: rateReturn.observationCount,
            };
            base.differencePercentagePoints = excess.value;
          } catch {
            base.benchmark = {
              id: benchmarkId,
              name: def.name,
              currency: def.currency,
              type: def.type,
              return: null,
              status: 'UNAVAILABLE',
              dataAvailability: 'UNAVAILABLE',
            };
            base.differencePercentagePoints = null;
          }
        }
      }

      currenciesRecord2[cur] = base;
    }

    return {
      portfolioId: params.portfolioId,
      period: { startDate: periodStart.toString(), endDate: periodEnd.toString() },
      inceptionDate,
      currencies: currenciesRecord2,
      status: perf.status,
      dataAvailability: perf.dataAvailability,
    };
  }
}
