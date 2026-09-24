import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Percentage, Quantity } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import { RateBenchmarkDataProvider, RateBenchmarkObservation } from '@atlas/benchmark-engine';
import {
  calculateSharpeRatio,
  calculateSortinoRatio,
  alignRiskFreeObservations,
  selectRiskStatisticalReturns,
  RiskSubperiodReturn,
  RiskFreeDailyObservation,
} from '@atlas/risk-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import {
  HISTORICAL_MARKET_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../market-data/tokens';
import { PortfolioRiskAdjustedReadModel } from './risk-adjusted-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_RISK_ADJUSTED_PERIOD_DAYS = 5 * 366;

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
 * Converts a 3G rate observation into a percent-point daily return for the
 * risk engine. Unit-explicit: DAILY_PERCENT means "percent per day"
 * (0.05 → +0.05%/day); DAILY_FACTOR is a raw multiplicative factor.
 * Unknown units are never compounded silently — they are dropped (missing).
 */
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
 * GetPortfolioRiskAdjustedMetricsUseCase (3J, ADR-133–ADR-137).
 *
 * Sharpe/Sortino over Layer-B statistical TWR subperiods intersected with
 * real CDI daily observations (single range fetch, never one call per day).
 * CDI is an explicit BRL-only proxy ("Referência usada: CDI"), never a
 * literal risk-free guarantee, never zero-filled, never applied to USD.
 * No benchmark-relative risk, no FX, no prediction.
 */
@Injectable()
export class GetPortfolioRiskAdjustedMetricsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
    @Inject(RATE_BENCHMARK_DATA_PROVIDER)
    private readonly rateBenchmarkProvider: RateBenchmarkDataProvider,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PortfolioRiskAdjustedReadModel> {
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
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_RISK_ADJUSTED_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: risk-adjusted range exceeds ${MAX_RISK_ADJUSTED_PERIOD_DAYS} days`,
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

    // Single CDI range fetch for the whole period (never one call per day).
    // Provider failure → BRL risk-adjusted UNAVAILABLE (no zero/IBOV fallback).
    const cdiDailyByDate = new Map<string, RiskFreeDailyObservation>();
    let cdiAvailable = false;
    try {
      const cdiObservations = await this.rateBenchmarkProvider.getRateObservations(
        'CDI',
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

    const currenciesRecord: PortfolioRiskAdjustedReadModel['currencies'] = {};
    let anyAvailable = false;
    let anyPartial = false;
    let anyUnavailable = false;

    for (const ctx of context.perCurrency) {
      if (ctx.currency !== 'BRL') {
        // USD (or any non-BRL): no compatible reference in 3J. CDI is never
        // applied cross-currency; no FX.
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          frequency: 'DAILY',
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
          riskFreeProxy: null,
          sharpe: null,
          sortino: null,
        };
        continue;
      }
      if (!cdiAvailable) {
        // BRL without CDI data: the proxy is CDI (methodology), but there is
        // nothing to compute with — UNAVAILABLE, never a zero fallback.
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          frequency: 'DAILY',
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
          riskFreeProxy: 'CDI',
          sharpe: null,
          sortino: null,
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

      // Layer B (ADR-132): economic dates only.
      const economicDates = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) economicDates.push(LocalDate.from(dateStr));
      }
      const statistical = selectRiskStatisticalReturns({
        subperiodReturns: twrSubperiods,
        economicDates,
      });

      // Intersection with real CDI observations (ADR-137). Missing CDI is
      // never zero-filled; it narrows the sample and marks PARTIAL.
      const referenceReturns = Array.from(cdiDailyByDate.values());
      const { aligned, portfolioDatesWithoutReference } = alignRiskFreeObservations({
        portfolioReturns: statistical,
        referenceReturns,
      });

      // Upstream quality: portfolio PARTIAL valuations/gaps, or CDI gaps on
      // statistical dates, downgrade to PARTIAL (never silent COMPLETE).
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
      if (portfolioDatesWithoutReference.length > 0) partialUpstream = true;
      if (ctx.observations.length === 0) {
        anyUnavailable = true;
        currenciesRecord[ctx.currency] = {
          currency: ctx.currency,
          frequency: 'DAILY',
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
          riskFreeProxy: 'CDI',
          sharpe: null,
          sortino: null,
        };
        continue;
      }

      const sharpe = calculateSharpeRatio({
        observations: aligned,
        frequency: 'DAILY',
        riskFreeProxy: 'CDI',
        partial: partialUpstream,
      });
      const sortino = calculateSortinoRatio({
        observations: aligned,
        frequency: 'DAILY',
        riskFreeProxy: 'CDI',
        partial: partialUpstream,
      });

      const status =
        sharpe.status === 'AVAILABLE' && sortino.status === 'AVAILABLE'
          ? 'AVAILABLE'
          : sharpe.status === 'UNAVAILABLE' && sortino.status === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'PARTIAL';
      if (status === 'AVAILABLE') anyAvailable = true;
      else if (status === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        frequency: 'DAILY',
        status,
        dataAvailability: status === 'AVAILABLE' ? 'AVAILABLE' : status,
        riskFreeProxy: 'CDI',
        sharpe: {
          observationCount: sharpe.observationCount,
          meanDailyExcessPercentage: sharpe.meanDailyExcessPercentage
            ? sharpe.meanDailyExcessPercentage.value
            : null,
          daily: sharpe.dailySharpe ? sharpe.dailySharpe.toString() : null,
          annualized: sharpe.annualizedSharpe ? sharpe.annualizedSharpe.toString() : null,
          annualizationFactor: sharpe.annualizationFactor,
          status: sharpe.status,
        },
        sortino: {
          observationCount: sortino.observationCount,
          downsideObservationCount: sortino.downsideObservationCount,
          downsideDeviationPercentage: sortino.downsideDeviationPercentage
            ? sortino.downsideDeviationPercentage.value
            : null,
          daily: sortino.dailySortino ? sortino.dailySortino.toString() : null,
          annualized: sortino.annualizedSortino ? sortino.annualizedSortino.toString() : null,
          annualizationFactor: sortino.annualizationFactor,
          status: sortino.status,
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
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
