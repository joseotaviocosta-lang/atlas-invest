import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Percentage, Quantity } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  BenchmarkId,
  RateBenchmarkObservation,
} from '@atlas/benchmark-engine';
import {
  assertValidRollingWindow,
  calculateRollingVolatility,
  calculateRollingSharpe,
  calculateRollingBeta,
  alignRiskFreeObservations,
  alignBenchmarkRelativeReturns,
  buildPortfolioIntervals,
  buildBenchmarkIntervals,
  selectRiskStatisticalReturns,
  RiskSubperiodReturn,
  RiskFreeDailyObservation,
  RelativeRiskBenchmarkLevel,
  RollingWindow,
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
  PortfolioRollingAnalyticsReadModel,
  RollingCurrencyReadModel,
} from './rolling-analytics-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_ROLLING_PERIOD_DAYS = 5 * 366;
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

function toRiskFreeDaily(observation: RateBenchmarkObservation): RiskFreeDailyObservation | null {
  if (observation.unit === 'DAILY_PERCENT') {
    return { date: observation.date, dailyReturn: Percentage.from(observation.rate.toString()) };
  }
  if (observation.unit === 'DAILY_FACTOR') {
    const factor = observation.rate as Quantity;
    return {
      date: observation.date,
      dailyReturn: Percentage.from(
        factor.subtract(Quantity.from('1')).multiply(Quantity.from('100')).toString(),
      ),
    };
  }
  return null;
}

/**
 * GetPortfolioRollingAnalyticsUseCase (3M, ADR-148–ADR-152).
 *
 * Rolling volatility, rolling Sharpe and rolling Beta over 20/60/120 VALID
 * ECONOMIC OBSERVATIONS (never calendar days). Reuses the canonical source
 * series verbatim: 3I Layer-B returns for volatility, 3J aligned portfolio/CDI
 * observations for Sharpe, 3K paired intervals for Beta — no formula is
 * duplicated and no alignment is redone. One portfolio context build, one IBOV
 * range fetch and one CDI range fetch per request (no per-point I/O). BRL gets
 * all three metrics; any non-BRL currency gets rolling volatility only (no FX).
 * No partial windows, no NaN/Infinity, no prediction.
 */
@Injectable()
export class GetPortfolioRollingAnalyticsUseCase {
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
    window?: string;
  }): Promise<PortfolioRollingAnalyticsReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // Window is MANDATORY in 3M: no silent default.
    if (!params.window) {
      throw new BadRequestException({
        message: 'Missing required window. Supported: 20, 60, 120',
        code: 'ROLLING_ANALYTICS.INVALID_WINDOW',
      });
    }
    let window: RollingWindow;
    try {
      window = assertValidRollingWindow(params.window);
    } catch (err: unknown) {
      throw new BadRequestException({
        message: (err as Error).message,
        code: 'ROLLING_ANALYTICS.INVALID_WINDOW',
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
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_ROLLING_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: rolling-analytics range exceeds ${MAX_ROLLING_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

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

    // ONE portfolio context build for the whole request (ADR-148/§40).
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

    // ONE IBOV range fetch and ONE CDI range fetch per request.
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

    const cdiDailyByDate = new Map<string, RiskFreeDailyObservation>();
    let cdiAvailable = false;
    try {
      const cdiObservations = await this.rateBenchmarkProvider.getRateObservations(
        RISK_FREE_PROXY,
        effectiveStart,
        effectiveEnd,
      );
      for (const observation of cdiObservations) {
        const daily = toRiskFreeDaily(observation);
        if (daily && !cdiDailyByDate.has(daily.date.toString())) {
          cdiDailyByDate.set(daily.date.toString(), daily);
        }
      }
      cdiAvailable = cdiDailyByDate.size > 0;
    } catch {
      cdiAvailable = false;
    }

    const currenciesRecord: Record<string, RollingCurrencyReadModel> = {};
    let anyAvailable = false;
    let anyPartial = false;
    let anyUnavailable = false;

    for (const ctx of context.perCurrency) {
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

      // Layer B (ADR-132): economic dates only.
      const economicDates = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) economicDates.push(LocalDate.from(dateStr));
      }
      const statistical = selectRiskStatisticalReturns({
        subperiodReturns: twrSubperiods,
        economicDates,
      });

      // Upstream valuation quality (partial propagation).
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

      // --- Rolling volatility (3I source) — always available (all currencies)
      const volatility = calculateRollingVolatility({
        returns: statistical,
        window,
        frequency: 'DAILY',
        partial: partialUpstream,
      });

      let sharpe: ReturnType<typeof calculateRollingSharpe> = Object.freeze({
        window,
        frequency: 'DAILY' as const,
        status: 'UNAVAILABLE' as const,
        points: Object.freeze([]) as never,
      });
      let beta: ReturnType<typeof calculateRollingBeta> = Object.freeze({
        window,
        status: 'UNAVAILABLE' as const,
        points: Object.freeze([]) as never,
      });

      if (ctx.currency === 'BRL') {
        // --- Rolling Sharpe (3J aligned source; CDI never zero-filled) ------
        const referenceReturns = Array.from(cdiDailyByDate.values());
        const { aligned, portfolioDatesWithoutReference } = alignRiskFreeObservations({
          portfolioReturns: statistical,
          referenceReturns,
        });
        const sharpePartial = partialUpstream || portfolioDatesWithoutReference.length > 0;
        sharpe = calculateRollingSharpe({
          observations: aligned,
          window,
          frequency: 'DAILY',
          partial: sharpePartial,
        });

        // --- Rolling Beta (3K paired source; no realignment) ---------------
        const portfolioBoundaries: LocalDate[] = [effectiveStart];
        for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
          if (exact) portfolioBoundaries.push(LocalDate.from(dateStr));
        }
        const portfolioIntervals = buildPortfolioIntervals({
          boundaries: portfolioBoundaries,
          subperiodReturns: twrSubperiods,
        });
        const benchmarkIntervals = buildBenchmarkIntervals({
          boundaries: benchmarkLevels.map((l) => l.date),
          levels: benchmarkLevels,
        });
        const alignment = alignBenchmarkRelativeReturns({
          portfolioIntervals,
          benchmarkIntervals,
          partial: partialUpstream,
        });
        beta = calculateRollingBeta({
          observations: alignment.observations,
          window,
          partial: partialUpstream || alignment.status === 'PARTIAL',
        });
      } else {
        // Non-BRL: rolling volatility only; Sharpe/Beta UNAVAILABLE (no FX).
        void cdiAvailable;
        void benchmarkAvailable;
      }

      const currencyStatus = [volatility.status, sharpe.status, beta.status];
      if (currencyStatus.includes('AVAILABLE')) anyAvailable = true;
      if (currencyStatus.includes('PARTIAL')) anyPartial = true;
      if (currencyStatus.every((s) => s === 'UNAVAILABLE')) anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        rollingVolatility: {
          window: volatility.window,
          frequency: volatility.frequency,
          status: volatility.status,
          points: volatility.points.map((p) => ({
            windowStartDate: p.windowStartDate.toString(),
            endDate: p.endDate.toString(),
            observationCount: p.observationCount,
            annualizedPercentage: p.annualizedPercentage ? p.annualizedPercentage.value : null,
            status: p.status,
          })),
        },
        rollingSharpe: {
          window: sharpe.window,
          frequency: sharpe.frequency,
          status: sharpe.status,
          points: sharpe.points.map((p) => ({
            windowStartDate: p.windowStartDate.toString(),
            endDate: p.endDate.toString(),
            observationCount: p.observationCount,
            annualized: p.annualized ? p.annualized.toString() : null,
            status: p.status,
          })),
        },
        rollingBeta: {
          window: beta.window,
          status: beta.status,
          points: beta.points.map((p) => ({
            windowStartDate: p.windowStartDate.toString(),
            endDate: p.endDate.toString(),
            observationCount: p.observationCount,
            beta: p.beta ? p.beta.toString() : null,
            status: p.status,
          })),
        },
      };
    }

    let status = 'AVAILABLE';
    let dataAvailability: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
    if (!anyAvailable && !anyPartial) {
      status = 'UNAVAILABLE';
      dataAvailability = 'UNAVAILABLE';
    } else if (anyPartial || anyUnavailable) {
      status = 'PARTIAL';
      dataAvailability = 'PARTIAL';
    }

    return {
      portfolioId: params.portfolioId,
      period: { startDate: effectiveStart.toString(), endDate: effectiveEnd.toString() },
      window,
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
