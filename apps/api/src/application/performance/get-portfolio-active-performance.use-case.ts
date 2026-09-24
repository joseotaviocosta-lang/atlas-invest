import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Percentage } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  BenchmarkId,
  calculateBenchmarkReturn,
  calculateRateBenchmarkReturn,
  RateBenchmarkObservation,
} from '@atlas/benchmark-engine';
import {
  alignBenchmarkRelativeReturns,
  buildPortfolioIntervals,
  buildBenchmarkIntervals,
  calculateBeta,
  calculateActivePerformance,
  RiskSubperiodReturn,
  RelativeRiskBenchmarkLevel,
} from '@atlas/risk-engine';
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
import {
  PortfolioActivePerformanceReadModel,
  ActivePerformanceCurrencyReadModel,
} from './active-performance-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_ACTIVE_PERIOD_DAYS = 5 * 366;
const MARKET_BENCHMARK: BenchmarkId = 'IBOV';
const RISK_FREE_PROXY: BenchmarkId = 'CDI';

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
 * GetPortfolioActivePerformanceUseCase (3L, ADR-143–ADR-147).
 *
 * Jensen's Alpha, Information Ratio and Treynor Ratio with STRICTLY
 * period-consistent inputs (ADR-147): portfolio TWR (Rp), CDI accumulated
 * return (Rf) and IBOV return (Rm) all cover the SAME [effectiveStart,
 * effectiveEnd], and Beta / paired daily observations come from that same
 * period (reusing the 3K relative-risk pipeline — no duplicate replay). IBOV is
 * the market benchmark, CDI the BRL risk-free proxy. BRL currencies get metrics,
 * any other currency is UNAVAILABLE (no FX). Metric-specific availability is
 * preserved per currency (ADR-143). No rolling, no attribution, no prediction.
 */
@Injectable()
export class GetPortfolioActivePerformanceUseCase {
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

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PortfolioActivePerformanceReadModel> {
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

    const periodStart = start ?? LocalDate.from('2026-08-20');
    const periodEnd = end ?? LocalDate.from('2026-09-20');

    if (periodEnd.compare(todayCivil()) > 0) {
      throw new BadRequestException({
        message: `Invalid period: endDate '${periodEnd.toString()}' must not be in the future`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_ACTIVE_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: active-performance range exceeds ${MAX_ACTIVE_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    // SINGLE effective period object shared by Rp, Rf, Rm and Beta (ADR-147).
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

    // Same Layer-A methodology dates as 3I/3J/3K (ADR-131).
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

    // --- IBOV: single range fetch over the effective period (never per day) --
    const benchmarkLevels: RelativeRiskBenchmarkLevel[] = [];
    let benchmarkAvailable = false;
    try {
      const observations = await this.benchmarkProvider.getObservations(
        MARKET_BENCHMARK,
        effectiveStart,
        effectiveEnd,
      );
      for (const o of observations) benchmarkLevels.push({ date: o.date, level: o.value });
      benchmarkAvailable = benchmarkLevels.length > 0;
    } catch {
      benchmarkAvailable = false;
    }

    // --- CDI: single range fetch over the effective period ------------------
    let cdiObservations: RateBenchmarkObservation[] = [];
    try {
      cdiObservations = await this.rateBenchmarkProvider.getRateObservations(
        RISK_FREE_PROXY,
        effectiveStart,
        effectiveEnd,
      );
    } catch {
      cdiObservations = [];
    }

    // --- Rm: IBOV return over the effective period --------------------------
    let marketReturn: Percentage | null = null;
    if (benchmarkAvailable && benchmarkLevels.length >= 2) {
      const first = benchmarkLevels[0]!;
      const last = benchmarkLevels[benchmarkLevels.length - 1]!;
      if (!first.level.isZero()) {
        marketReturn = calculateBenchmarkReturn({
          benchmarkId: MARKET_BENCHMARK,
          startLevel: first.level,
          endLevel: last.level,
        });
      }
    }

    // --- Rf: CDI accumulated return over the effective period ---------------
    let riskFreeReturn: Percentage | null = null;
    let ratePartial = false;
    if (cdiObservations.length > 0) {
      const rateReturn = calculateRateBenchmarkReturn({
        benchmarkId: RISK_FREE_PROXY,
        observations: cdiObservations,
        startDate: effectiveStart,
        endDate: effectiveEnd,
      });
      riskFreeReturn = rateReturn.returnPercentage;
      if (rateReturn.status === 'PARTIAL') ratePartial = true;
    }

    const currenciesRecord: Record<string, ActivePerformanceCurrencyReadModel> = {};
    let anyAvailable = false;
    let anyPartial = false;
    let anyUnavailable = false;

    for (const ctx of context.perCurrency) {
      if (ctx.currency !== 'BRL') {
        // Any non-BRL currency: no compatible references in 3L. No FX.
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          status: 'UNAVAILABLE',
          alpha: null,
          informationRatio: null,
          treynor: null,
        };
        continue;
      }

      // --- Rp + Beta + paired observations over the SAME effective period ---
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

      const portfolioBoundaries: LocalDate[] = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) portfolioBoundaries.push(LocalDate.from(dateStr));
      }
      const benchmarkBoundaries = benchmarkLevels.map((l) => l.date);
      const portfolioIntervals = buildPortfolioIntervals({
        boundaries: portfolioBoundaries,
        subperiodReturns: twrSubperiods,
      });
      const benchmarkIntervals = buildBenchmarkIntervals({
        boundaries: benchmarkBoundaries,
        levels: benchmarkLevels,
      });

      const usedDates = new Set(
        ctx.observations
          .map((o) => o.date.toString())
          .filter((d) => d === effectiveStart.toString() || ctx.exactPriceByDate[d] === true),
      );
      let partialUpstream = ratePartial;
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
      if (alignment.status === 'PARTIAL') partialUpstream = true;

      const beta = calculateBeta({ observations: alignment.observations }).beta;

      const active = calculateActivePerformance({
        currency: ctx.currency,
        portfolioReturn: twr.returnPercentage,
        riskFreeReturn,
        marketReturn,
        beta,
        observations: alignment.observations,
        partial: partialUpstream,
      });

      const status =
        active.status === 'AVAILABLE'
          ? 'AVAILABLE'
          : active.status === 'PARTIAL'
            ? 'PARTIAL'
            : 'UNAVAILABLE';
      if (status === 'AVAILABLE') anyAvailable = true;
      else if (status === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        status,
        alpha: active.alpha.periodPercentage
          ? { periodPercentage: active.alpha.periodPercentage.value }
          : null,
        informationRatio: active.informationRatio.daily
          ? {
              observationCount: active.informationRatio.observationCount,
              daily: active.informationRatio.daily.toString(),
              annualized: active.informationRatio.annualized
                ? active.informationRatio.annualized.toString()
                : null,
            }
          : null,
        treynor: active.treynor.periodPercentagePerBeta
          ? { periodPercentagePerBeta: active.treynor.periodPercentagePerBeta.value }
          : null,
      };
    }

    let status = 'AVAILABLE';
    let dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' = 'AVAILABLE';
    if (!anyAvailable && !anyPartial) {
      status = 'UNAVAILABLE';
      dataAvailability = 'UNAVAILABLE';
    } else if (anyPartial || anyUnavailable) {
      status = 'PARTIAL';
      dataAvailability = anyAvailable || anyPartial ? 'PARTIAL' : 'UNAVAILABLE';
    }

    return {
      portfolioId: params.portfolioId,
      period: { startDate: effectiveStart.toString(), endDate: effectiveEnd.toString() },
      marketBenchmark: MARKET_BENCHMARK,
      riskFreeProxy: RISK_FREE_PROXY,
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
