import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import { BenchmarkDataProvider, BenchmarkId, BENCHMARK_DEFINITIONS } from '@atlas/benchmark-engine';
import {
  alignBenchmarkRelativeReturns,
  buildPortfolioIntervals,
  buildBenchmarkIntervals,
  calculateBenchmarkRelativeRisk,
  RiskSubperiodReturn,
  RelativeRiskBenchmarkLevel,
} from '@atlas/risk-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { HISTORICAL_MARKET_DATA_PROVIDER, BENCHMARK_DATA_PROVIDER } from '../../market-data/tokens';
import { PortfolioBenchmarkRelativeRiskReadModel } from './relative-risk-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_RELATIVE_RISK_PERIOD_DAYS = 5 * 366;

/** Market benchmarks supported by benchmark-relative risk in phase 3K. */
export const RELATIVE_RISK_MARKET_BENCHMARKS = ['IBOV'] as const;
export type RelativeRiskMarketBenchmark = (typeof RELATIVE_RISK_MARKET_BENCHMARKS)[number];

function daysBetweenCivil(a: LocalDate, b: LocalDate): number {
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function todayCivil(): LocalDate {
  const now = new Date();
  return LocalDate.fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

function addDaysCivil(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * GetPortfolioBenchmarkRelativeRiskUseCase (3K, ADR-138–ADR-142).
 *
 * Beta, Pearson correlation and tracking error between portfolio TWR returns
 * and a market benchmark (IBOV only), computed over IDENTICAL economic
 * intervals. Reuses the shared 3I calculation context (replay + price
 * resolution) and the existing 3F Yahoo benchmark provider via a SINGLE range
 * fetch (never one request per day). CDI is not a market-relative benchmark
 * and is rejected. USD is UNAVAILABLE (no FX). No Alpha/Information Ratio,
 * no rolling metrics, no prediction.
 */
@Injectable()
export class GetPortfolioBenchmarkRelativeRiskUseCase {
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
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    benchmark?: string;
  }): Promise<PortfolioBenchmarkRelativeRiskReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // Benchmark is MANDATORY in 3K, and only a market benchmark is accepted.
    if (!params.benchmark) {
      throw new BadRequestException({
        message: `Missing required benchmark. Supported: ${RELATIVE_RISK_MARKET_BENCHMARKS.join(', ')}`,
        code: 'RELATIVE_RISK.BENCHMARK_REQUIRED',
      });
    }
    if (!(RELATIVE_RISK_MARKET_BENCHMARKS as readonly string[]).includes(params.benchmark)) {
      throw new BadRequestException({
        message: `Unsupported benchmark '${params.benchmark}'. Supported: ${RELATIVE_RISK_MARKET_BENCHMARKS.join(', ')}`,
        code: 'RELATIVE_RISK.UNSUPPORTED_BENCHMARK',
      });
    }
    const benchmarkId = params.benchmark as BenchmarkId;
    const benchmarkDef = BENCHMARK_DEFINITIONS[benchmarkId];

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

    const periodStart = start ?? LocalDate.from('2026-08-20');
    const periodEnd = end ?? LocalDate.from('2026-09-20');

    if (periodEnd.compare(todayCivil()) > 0) {
      throw new BadRequestException({
        message: `Invalid period: endDate '${periodEnd.toString()}' must not be in the future`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_RELATIVE_RISK_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: relative-risk range exceeds ${MAX_RELATIVE_RISK_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

    // Same Layer-A methodology dates as the 3I risk endpoint (ADR-131):
    // every civil date + flow dates. Never chart display samples.
    const riskDateKeys = new Set<string>();
    let cursor = effectiveStart;
    while (cursor.compare(effectiveEnd) <= 0) {
      riskDateKeys.add(cursor.toString());
      cursor = addDaysCivil(cursor, 1);
    }
    for (const t of transactions) {
      if (t.type !== 'DEPOSIT' && t.type !== 'WITHDRAWAL') continue;
      if (t.tradeDate.compare(effectiveStart) >= 0 && t.tradeDate.compare(effectiveEnd) <= 0) {
        riskDateKeys.add(t.tradeDate.toString());
      }
    }
    const calcDates = Array.from(riskDateKeys)
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

    // Single benchmark range fetch for the whole period (never one call per
    // day / per pair). Failure → UNAVAILABLE (never a zero/IBOV fallback).
    const benchmarkLevels: RelativeRiskBenchmarkLevel[] = [];
    let benchmarkAvailable = false;
    try {
      const observations = await this.benchmarkProvider.getObservations(
        benchmarkId,
        effectiveStart,
        effectiveEnd,
      );
      for (const o of observations) {
        benchmarkLevels.push({ date: o.date, level: o.value });
      }
      benchmarkAvailable = benchmarkLevels.length > 0;
    } catch {
      benchmarkAvailable = false;
    }

    const currenciesRecord: PortfolioBenchmarkRelativeRiskReadModel['currencies'] = {};
    let anyAvailable = false;
    let anyPartial = false;
    let anyUnavailable = false;

    for (const ctx of context.perCurrency) {
      if (ctx.currency !== 'BRL') {
        // USD (or any non-BRL): no compatible market benchmark in 3K. No FX.
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          status: 'UNAVAILABLE',
          alignment: null,
          beta: null,
          correlation: null,
          trackingError: null,
        };
        continue;
      }
      if (!benchmarkAvailable) {
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          status: 'UNAVAILABLE',
          alignment: null,
          beta: null,
          correlation: null,
          trackingError: null,
        };
        continue;
      }

      const twr = calculateTWR({
        observations: ctx.observations as never,
        cashFlows: ctx.cashFlows as never,
        period: { startDate: effectiveStart, endDate: effectiveEnd },
        currency: ctx.currency,
      });
      const twrSubperiods: RiskSubperiodReturn[] = twr.subperiods.map((s) => ({
        date: s.endDate,
        returnPercentage: s.returnPercentage,
      }));

      // Portfolio economic boundaries (ADR-132): period anchor + dates with an
      // EXACT valuation. Weekend/holiday PREVIOUS_TRADING_DAY dates and
      // flow-only non-market dates never become boundaries.
      const portfolioBoundaries: LocalDate[] = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) portfolioBoundaries.push(LocalDate.from(dateStr));
      }

      // Benchmark economic boundaries: dates with a legitimate index level.
      const benchmarkBoundaries: LocalDate[] = benchmarkLevels.map((l) => l.date);

      const portfolioIntervals = buildPortfolioIntervals({
        boundaries: portfolioBoundaries,
        subperiodReturns: twrSubperiods,
      });
      const benchmarkIntervals = buildBenchmarkIntervals({
        boundaries: benchmarkBoundaries,
        levels: benchmarkLevels,
      });

      // Upstream portfolio quality, evaluated on economic dates only.
      const usedDates = new Set(
        ctx.observations
          .map((o) => o.date.toString())
          .filter((d) => d === effectiveStart.toString() || ctx.exactPriceByDate[d] === true),
      );
      let partialUpstream = false;
      for (const [dateStr, availability] of Object.entries(ctx.availabilityByDate)) {
        if (availability === 'PARTIAL' && usedDates.has(dateStr)) {
          partialUpstream = true;
          break;
        }
      }
      if (!partialUpstream) {
        for (const dateStr of Object.keys(ctx.availabilityByDate)) {
          if (ctx.availabilityByDate[dateStr] === 'UNAVAILABLE') {
            const d = LocalDate.from(dateStr);
            if (d.compare(effectiveStart) > 0 && d.compare(effectiveEnd) <= 0) {
              partialUpstream = true;
              break;
            }
          }
        }
      }

      const alignment = alignBenchmarkRelativeReturns({
        portfolioIntervals,
        benchmarkIntervals,
        partial: partialUpstream,
      });

      const risk = calculateBenchmarkRelativeRisk({
        currency: ctx.currency,
        observations: alignment.observations,
        frequency: 'DAILY',
        partial: partialUpstream,
      });

      const status =
        alignment.pairedObservationCount < 2 || risk.status === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : risk.status === 'PARTIAL' || alignment.status === 'PARTIAL'
            ? 'PARTIAL'
            : 'AVAILABLE';
      if (status === 'AVAILABLE') anyAvailable = true;
      else if (status === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        status,
        alignment: {
          portfolioIntervalCount: alignment.portfolioIntervalCount,
          benchmarkIntervalCount: alignment.benchmarkIntervalCount,
          pairedObservationCount: alignment.pairedObservationCount,
          droppedPortfolioIntervalCount: alignment.droppedPortfolioIntervalCount,
          droppedBenchmarkIntervalCount: alignment.droppedBenchmarkIntervalCount,
        },
        beta: risk.beta ? risk.beta.toString() : null,
        correlation: risk.correlation ? risk.correlation.toString() : null,
        trackingError:
          status === 'UNAVAILABLE'
            ? null
            : {
                frequency: risk.trackingError.frequency,
                observationCount: risk.trackingError.observationCount,
                samplePercentage: risk.trackingError.samplePercentage
                  ? risk.trackingError.samplePercentage.value
                  : null,
                annualizedPercentage: risk.trackingError.annualizedPercentage
                  ? risk.trackingError.annualizedPercentage.value
                  : null,
                annualizationFactor: risk.trackingError.annualizationFactor,
                status: risk.trackingError.status,
              },
      };
    }

    let status = 'AVAILABLE';
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
      benchmark: {
        id: benchmarkDef.id,
        name: benchmarkDef.name,
        currency: benchmarkDef.currency,
      },
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
