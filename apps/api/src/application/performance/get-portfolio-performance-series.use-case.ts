import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import {
  HistoricalMarketDataProvider,
  InMemoryHistoricalMarketDataProvider,
} from '@atlas/market-data';
import {
  calculatePerformanceSeries,
  resolveSeriesGranularity,
  selectDisplayDates,
  assertValidSeriesGranularity,
  PerformanceSeriesGranularity,
} from '@atlas/performance-engine';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  calculateBenchmarkReturn,
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
import { PortfolioPerformanceSeriesReadModel } from './series-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_SERIES_PERIOD_DAYS = 5 * 366;

function daysBetweenCivil(a: LocalDate, b: LocalDate): number {
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function todayCivil(): LocalDate {
  const now = new Date();
  return LocalDate.fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

@Injectable()
export class GetPortfolioPerformanceSeriesUseCase {
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

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    benchmark?: string;
    granularity?: string;
  }): Promise<PortfolioPerformanceSeriesReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

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
    let requestedGranularity: PerformanceSeriesGranularity = 'AUTO';
    if (params.granularity) {
      try {
        requestedGranularity = assertValidSeriesGranularity(params.granularity);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message,
          code: 'PERFORMANCE.INVALID_GRANULARITY',
        });
      }
    }

    const periodStart = start ?? LocalDate.from('2026-08-20');
    const periodEnd = end ?? LocalDate.from('2026-09-20');

    if (periodEnd.compare(todayCivil()) > 0) {
      throw new BadRequestException({
        message: `Invalid period: endDate '${periodEnd.toString()}' must not be in the future`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_SERIES_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: series range exceeds ${MAX_SERIES_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);

    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

    const resolvedGranularity = resolveSeriesGranularity({
      startDate: effectiveStart,
      endDate: effectiveEnd,
      requested: requestedGranularity,
    });
    const displayDates = selectDisplayDates({
      startDate: effectiveStart,
      endDate: effectiveEnd,
      granularity: resolvedGranularity,
    });

    const externalFlows = transactions.filter(
      (t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL',
    );
    const flowDates = externalFlows
      .map((t) => t.tradeDate)
      .filter((d) => d.compare(effectiveStart) >= 0 && d.compare(effectiveEnd) <= 0);

    // Calculation dates = display dates + flow dates (ADR-124). Flow-date
    // valuations keep TWR neutralization exact even when granularity skips them.
    const calcDateKeys = new Set<string>(displayDates.map((d) => d.toString()));
    for (const d of flowDates) calcDateKeys.add(d.toString());
    const calcDates = Array.from(calcDateKeys)
      .map((s) => LocalDate.from(s))
      .sort((a, b) => a.compare(b));

    const contextBuilder = new PerformanceCalculationContextBuilder(
      this.transactionRepository,
      this.assetRepository,
      this.historicalProvider,
    );
    const context = await contextBuilder.build({
      portfolioId: params.portfolioId,
      transactions,
      start: effectiveStart,
      end: effectiveEnd,
      calcDates,
    });

    const benchmarkId = params.benchmark ? (params.benchmark as BenchmarkId) : null;
    const benchmarkDef = benchmarkId ? BENCHMARK_DEFINITIONS[benchmarkId] : null;

    // Resolve benchmark anchors once per series (not per point per date).
    let ibovStartLevel: import('@atlas/domain').Quantity | null = null;
    let cdiObservations: import('@atlas/benchmark-engine').RateBenchmarkObservation[] = [];
    if (benchmarkId && benchmarkDef) {
      if (benchmarkDef.type === 'PRICE_INDEX') {
        try {
          const startObs = await this.benchmarkProvider.getObservation(benchmarkId, effectiveStart);
          ibovStartLevel = startObs.value;
        } catch {
          ibovStartLevel = null;
        }
      } else {
        try {
          cdiObservations = await this.rateBenchmarkProvider.getRateObservations(
            benchmarkId,
            effectiveStart,
            effectiveEnd,
          );
        } catch {
          cdiObservations = [];
        }
      }
    }

    const currenciesRecord: PortfolioPerformanceSeriesReadModel['currencies'] = {};
    let anyAvailable = false;
    let anyPartial = false;
    let anyUnavailable = false;

    for (const ctx of context.perCurrency) {
      const cur = ctx.currency;
      const availabilityByDate = ctx.availabilityByDate;
      const observations = ctx.observations;
      const flows = ctx.cashFlows;

      const series = calculatePerformanceSeries({
        observations: observations as never,
        cashFlows: flows as never,
        period: { startDate: effectiveStart, endDate: effectiveEnd },
        currency: cur,
        displayDates,
        granularity: resolvedGranularity,
        availabilityByDate,
      });

      const benchmarkApplies = benchmarkId !== null && cur === 'BRL';
      const points = [];
      for (const point of series.points) {
        let benchmarkReturn: string | null = null;
        if (benchmarkApplies && benchmarkDef && point.cumulativeReturn !== null) {
          if (benchmarkDef.type === 'PRICE_INDEX') {
            if (ibovStartLevel) {
              try {
                const levelObs = await this.benchmarkProvider.getObservation(
                  benchmarkId as BenchmarkId,
                  point.date,
                );
                const ret = calculateBenchmarkReturn({
                  benchmarkId: benchmarkId as BenchmarkId,
                  startLevel: ibovStartLevel,
                  endLevel: levelObs.value,
                });
                benchmarkReturn = ret.value;
              } catch {
                benchmarkReturn = null;
              }
            }
          } else {
            try {
              const rateReturn = calculateRateBenchmarkReturn({
                benchmarkId: benchmarkId as BenchmarkId,
                observations: cdiObservations.filter((o) => o.date.compare(point.date) <= 0),
                startDate: effectiveStart,
                endDate: point.date,
              });
              // CDI period semantics are (start, end]: the start anchor point
              // carries an empty interval, hence exactly "0".
              benchmarkReturn =
                point.date.compare(effectiveStart) === 0
                  ? '0'
                  : (rateReturn.returnPercentage?.value ?? null);
            } catch {
              benchmarkReturn = null;
            }
          }
        }
        points.push({
          date: point.date.toString(),
          portfolioReturn: point.cumulativeReturn ? point.cumulativeReturn.value : null,
          benchmarkReturn,
          status: point.status,
        });
      }

      // Series-level benchmark metadata: AVAILABLE only when the anchor and
      // the end point both resolved; otherwise PARTIAL/UNAVAILABLE.
      let benchmarkMeta: {
        id: string;
        name: string;
        currency: string;
        type: string;
        status: string;
        dataAvailability: string;
      } | null = null;
      if (benchmarkApplies && benchmarkDef) {
        const lastPoint = points[points.length - 1];
        const lastBench = lastPoint?.benchmarkReturn ?? null;
        const benchStatus =
          lastBench !== null
            ? series.dataAvailability === 'PARTIAL'
              ? 'PARTIAL'
              : 'AVAILABLE'
            : points.some((p) => p.benchmarkReturn !== null)
              ? 'PARTIAL'
              : 'UNAVAILABLE';
        benchmarkMeta = {
          id: benchmarkDef.id,
          name: benchmarkDef.name,
          currency: benchmarkDef.currency,
          type: benchmarkDef.type,
          status: benchStatus,
          dataAvailability: benchStatus,
        };
      }

      if (series.dataAvailability === 'AVAILABLE') anyAvailable = true;
      else if (series.dataAvailability === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[cur] = {
        currency: cur,
        granularity: resolvedGranularity,
        status: series.status,
        dataAvailability: series.dataAvailability,
        benchmark: benchmarkMeta,
        points,
      };
    }

    let status = 'COMPLETE';
    let dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' = 'AVAILABLE';
    if (!anyAvailable && !anyPartial) {
      status = 'INSUFFICIENT_DATA';
      dataAvailability = 'UNAVAILABLE';
    } else if (anyPartial || anyUnavailable) {
      status = 'PARTIAL';
      dataAvailability = anyAvailable || anyPartial ? 'PARTIAL' : 'UNAVAILABLE';
    }

    return {
      portfolioId: params.portfolioId,
      period: { startDate: effectiveStart.toString(), endDate: effectiveEnd.toString() },
      requestedGranularity,
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
