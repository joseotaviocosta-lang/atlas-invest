import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Percentage, Quantity } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculatePortfolioPerformance } from '@atlas/performance-engine';
import {
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
  BenchmarkId,
  calculateBenchmarkReturn,
  calculateRateBenchmarkReturn,
  RateBenchmarkObservation,
} from '@atlas/benchmark-engine';
import {
  calculateRiskMetrics,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateBeta,
  calculateCorrelation,
  calculateTrackingError,
  calculateActivePerformance,
  calculateTailRisk,
  alignRiskFreeObservations,
  alignBenchmarkRelativeReturns,
  buildPortfolioIntervals,
  buildBenchmarkIntervals,
  selectRiskStatisticalReturns,
  RiskSubperiodReturn,
  RiskFreeDailyObservation,
  RelativeRiskBenchmarkLevel,
} from '@atlas/risk-engine';
import { applyScenarioToSnapshot, ScenarioDefinition } from '@atlas/scenario-engine';
import {
  buildPortfolioIntelligenceSummary,
  PortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
  IntelligenceStatus,
  IntelligenceBenchmarkBlock,
  IntelligenceDataQualityInput,
} from '@atlas/portfolio-intelligence';
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
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';
import { ScenarioSnapshotBuilder } from './scenario-snapshot.builder';

const MAX_SUMMARY_PERIOD_DAYS = 5 * 366;
const DEFAULT_PERIOD_DAYS = 365;
const MARKET_BENCHMARK: BenchmarkId = 'IBOV';
const RISK_FREE_PROXY: BenchmarkId = 'CDI';
const SUMMARY_TAIL_CONFIDENCE = '95' as const;
const SUMMARY_SCENARIO: ScenarioDefinition = {
  type: 'EQUITY_PRICE_SHOCK',
  shockPercentage: '-10',
};

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

function unavailableStatus(available: boolean, partial: boolean): IntelligenceStatus {
  if (available) return 'AVAILABLE';
  return partial ? 'PARTIAL' : 'UNAVAILABLE';
}

/**
 * GetPortfolioIntelligenceSummaryUseCase (3P, ADR-166–ADR-172).
 *
 * Deterministic consolidation of the approved read models over ONE shared
 * effective period. It reuses the engines' canonical formulas (never
 * duplicates them) and a single portfolio calculation context, a single IBOV
 * range fetch, a single CDI range fetch and a single current market-value
 * snapshot (reused by the summary scenario). It does not call the AI engine,
 * never scores/ranks/recommends, never aggregates currencies and never
 * persists anything.
 */
@Injectable()
export class GetPortfolioIntelligenceSummaryUseCase {
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
  }): Promise<PortfolioIntelligenceSummary> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    const today = todayCivil();
    let start: LocalDate;
    let end: LocalDate;
    try {
      end = params.endDate ? LocalDate.from(params.endDate) : today;
      start = params.startDate
        ? LocalDate.from(params.startDate)
        : addDaysCivil(end, -DEFAULT_PERIOD_DAYS);
    } catch (err: unknown) {
      throw new BadRequestException({
        message: (err as Error).message,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (start.compare(end) > 0) {
      throw new BadRequestException({
        message: `Invalid period: startDate must be <= endDate`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (end.compare(today) > 0) {
      throw new BadRequestException({
        message: `Invalid period: endDate must not be in the future`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }
    if (daysBetweenCivil(start, end) > MAX_SUMMARY_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: summary range exceeds ${MAX_SUMMARY_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(transactions, start, end);

    // ONE shared calculation context (Layer-A dates: every civil date + flows).
    const calcDateKeys = new Set<string>();
    let cursor = effectiveStart;
    while (cursor.compare(effectiveEnd) <= 0) {
      calcDateKeys.add(cursor.toString());
      cursor = addDaysCivil(cursor, 1);
    }
    for (const t of transactions) {
      if (t.type !== 'DEPOSIT' && t.type !== 'WITHDRAWAL') continue;
      if (t.tradeDate.compare(effectiveStart) >= 0 && t.tradeDate.compare(effectiveEnd) <= 0) {
        calcDateKeys.add(t.tradeDate.toString());
      }
    }
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

    // ONE current market-value snapshot at effectiveEnd (reused by the scenario).
    const snapshotBuilder = new ScenarioSnapshotBuilder(
      this.transactionRepository,
      this.assetRepository,
      this.historicalProvider,
    );
    const currentSnapshots = await snapshotBuilder.build({
      portfolioId: params.portfolioId,
      asOf: effectiveEnd,
    });

    // ONE IBOV range fetch and ONE CDI range fetch for the whole summary.
    const benchmarkLevels: RelativeRiskBenchmarkLevel[] = [];
    try {
      const observations = await this.benchmarkProvider.getObservations(
        MARKET_BENCHMARK,
        effectiveStart,
        effectiveEnd,
      );
      for (const o of observations) benchmarkLevels.push({ date: o.date, level: o.value });
    } catch {
      // IBOV unavailable — recorded in dataQuality.
    }

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

    const cdiDailyByDate = new Map<string, RiskFreeDailyObservation>();
    for (const observation of cdiObservations) {
      const daily = toRiskFreeDaily(observation);
      if (daily && !cdiDailyByDate.has(daily.date.toString())) {
        cdiDailyByDate.set(daily.date.toString(), daily);
      }
    }
    const cdiAvailable = cdiDailyByDate.size > 0;
    const ibovAvailable = benchmarkLevels.length >= 2;

    let cdiPeriodReturn: Percentage | null = null;
    let cdiPartial = false;
    if (cdiAvailable) {
      const rateReturn = calculateRateBenchmarkReturn({
        benchmarkId: RISK_FREE_PROXY,
        observations: cdiObservations,
        startDate: effectiveStart,
        endDate: effectiveEnd,
      });
      cdiPeriodReturn = rateReturn.returnPercentage;
      if (rateReturn.status === 'PARTIAL') cdiPartial = true;
    }
    let ibovPeriodReturn: Percentage | null = null;
    if (ibovAvailable) {
      const first = benchmarkLevels[0]!;
      const last = benchmarkLevels[benchmarkLevels.length - 1]!;
      if (!first.level.isZero()) {
        ibovPeriodReturn = calculateBenchmarkReturn({
          benchmarkId: MARKET_BENCHMARK,
          startLevel: first.level,
          endLevel: last.level,
        });
      }
    }

    const currencyInputs: CurrencyIntelligenceInput[] = [];
    const snapshotByCurrency = new Map(currentSnapshots.map((s) => [s.currency, s]));

    for (const ctx of context.perCurrency) {
      const currency = ctx.currency;
      const isBrl = currency === 'BRL';

      const performance = calculatePortfolioPerformance({
        period: { startDate: effectiveStart, endDate: effectiveEnd },
        observationsByCurrency: { [currency]: ctx.observations as never },
        cashFlowsByCurrency: { [currency]: ctx.cashFlows as never },
      });
      const perf = performance.currencies[currency];
      const twr = perf?.twr?.returnPercentage ?? null;
      const xirr = perf?.xirr?.returnPercentage ?? null;

      // --- risk observations (Layer B) -------------------------------------
      const twrResult = perf?.twr ?? null;
      const twrSubperiods: RiskSubperiodReturn[] = (twrResult?.subperiods ?? []).map((s) => ({
        date: s.endDate,
        returnPercentage: s.returnPercentage,
      }));

      const economicDates = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) economicDates.push(LocalDate.from(dateStr));
      }
      const statistical = selectRiskStatisticalReturns({
        subperiodReturns: twrSubperiods,
        economicDates,
      });

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

      const riskMetrics = calculateRiskMetrics({
        currency,
        frequency: 'DAILY',
        startDate: effectiveStart,
        subperiodReturns: statistical,
        dataAvailability: partialUpstream ? 'PARTIAL' : 'AVAILABLE',
      });

      // --- benchmarks ------------------------------------------------------
      const benchmarks: IntelligenceBenchmarkBlock[] = [];
      if (isBrl && ibovPeriodReturn) {
        const difference =
          twr && ibovPeriodReturn
            ? Percentage.from(
                Quantity.from(twr.value).subtract(Quantity.from(ibovPeriodReturn.value)).toString(),
              )
            : null;
        benchmarks.push({
          id: 'IBOV',
          return: ibovPeriodReturn.value,
          differencePercentagePoints: difference ? difference.value : null,
          status: 'AVAILABLE',
        });
      } else if (isBrl) {
        benchmarks.push({
          id: 'IBOV',
          return: null,
          differencePercentagePoints: null,
          status: 'UNAVAILABLE',
        });
      }
      if (isBrl && cdiPeriodReturn) {
        const difference = twr
          ? Percentage.from(
              Quantity.from(twr.value).subtract(Quantity.from(cdiPeriodReturn.value)).toString(),
            )
          : null;
        benchmarks.push({
          id: 'CDI',
          return: cdiPeriodReturn.value,
          differencePercentagePoints: difference ? difference.value : null,
          status: cdiPartial ? 'PARTIAL' : 'AVAILABLE',
        });
      } else {
        benchmarks.push({
          id: 'CDI',
          return: null,
          differencePercentagePoints: null,
          status: isBrl ? 'UNAVAILABLE' : 'UNAVAILABLE',
        });
      }

      // --- risk-adjusted (3J, BRL only) ------------------------------------
      let sharpe: string | null = null;
      let sortino: string | null = null;
      if (isBrl && cdiAvailable) {
        const referenceReturns = Array.from(cdiDailyByDate.values());
        const { aligned, portfolioDatesWithoutReference } = alignRiskFreeObservations({
          portfolioReturns: statistical,
          referenceReturns,
        });
        const raPartial =
          partialUpstream || portfolioDatesWithoutReference.length > 0 || !cdiAvailable;
        const sharpeResult = calculateSharpeRatio({ observations: aligned, partial: raPartial });
        const sortinoResult = calculateSortinoRatio({ observations: aligned, partial: raPartial });
        sharpe = sharpeResult.annualizedSharpe ? sharpeResult.annualizedSharpe.toString() : null;
        sortino = sortinoResult.annualizedSortino
          ? sortinoResult.annualizedSortino.toString()
          : null;
      }

      // --- relative risk (3K, BRL only) ------------------------------------
      let beta: string | null = null;
      let correlation: string | null = null;
      let trackingError: string | null = null;
      const portfolioBoundaries = [effectiveStart];
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
      let betaValue: Quantity | null = null;
      if (isBrl) {
        const betaResult = calculateBeta({ observations: alignment.observations });
        betaValue = betaResult.beta;
        beta = betaResult.beta ? betaResult.beta.toString() : null;
        const corrResult = calculateCorrelation({ observations: alignment.observations });
        correlation = corrResult.correlation ? corrResult.correlation.toString() : null;
        const teResult = calculateTrackingError({ observations: alignment.observations });
        trackingError = teResult.annualizedPercentage ? teResult.annualizedPercentage.value : null;
      }

      // --- active performance (3L, BRL only) -------------------------------
      let alpha: string | null = null;
      let informationRatio: string | null = null;
      let treynor: string | null = null;
      if (isBrl && twr) {
        const active = calculateActivePerformance({
          currency,
          portfolioReturn: twr,
          riskFreeReturn: cdiPeriodReturn,
          marketReturn: ibovPeriodReturn,
          beta: betaValue,
          observations: alignment.observations,
          partial: partialUpstream,
        });
        alpha = active.alpha.periodPercentage ? active.alpha.periodPercentage.value : null;
        informationRatio = active.informationRatio.annualized
          ? active.informationRatio.annualized.toString()
          : null;
        treynor = active.treynor.periodPercentagePerBeta
          ? active.treynor.periodPercentagePerBeta.value
          : null;
      }

      // --- tail risk (3N, 95%) ---------------------------------------------
      const tail = calculateTailRisk({
        currency,
        returns: statistical,
        confidenceLevel: SUMMARY_TAIL_CONFIDENCE,
        frequency: 'DAILY',
        partial: partialUpstream,
      });

      // --- overview + scenario from the single current snapshot ------------
      const snapshot = snapshotByCurrency.get(currency);
      const overview = {
        currentMarketValue: null as string | null,
        positionCount: snapshot ? snapshot.positions.length : 0,
        valuedPositionCount: 0,
        unvaluedPositionCount: 0,
        status: 'UNAVAILABLE' as IntelligenceStatus,
      };
      let scenarioBlock = {
        preset: 'EQUITY_DOWN_10',
        type: 'EQUITY_PRICE_SHOCK' as string,
        baseValue: null as string | null,
        stressedValue: null as string | null,
        absoluteImpact: null as string | null,
        percentageImpact: null as string | null,
        hypothetical: true as const,
        status: 'UNAVAILABLE' as IntelligenceStatus,
      };
      if (snapshot && snapshot.positions.length > 0) {
        const scenario = applyScenarioToSnapshot({
          snapshot,
          scenario: SUMMARY_SCENARIO,
          portfolioBeta: null,
        });
        overview.valuedPositionCount = scenario.valuedPositionCount;
        overview.unvaluedPositionCount = scenario.unvaluedPositionCount;
        overview.currentMarketValue = scenario.baseValue ? scenario.baseValue.amount : null;
        overview.status =
          scenario.valuedPositionCount === 0
            ? 'UNAVAILABLE'
            : scenario.unvaluedPositionCount > 0
              ? 'PARTIAL'
              : 'AVAILABLE';
        scenarioBlock = {
          preset: 'EQUITY_DOWN_10',
          type: 'EQUITY_PRICE_SHOCK',
          baseValue: scenario.baseValue ? scenario.baseValue.amount : null,
          stressedValue: scenario.stressedValue ? scenario.stressedValue.amount : null,
          absoluteImpact: scenario.absoluteImpact ? scenario.absoluteImpact.amount : null,
          percentageImpact: scenario.percentageImpact ? scenario.percentageImpact.value : null,
          hypothetical: true,
          status: scenario.status,
        };
      }

      const dataQuality: IntelligenceDataQualityInput = {
        portfolioStateCompleteness: {
          status: overview.valuedPositionCount > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
          reason: overview.valuedPositionCount > 0 ? null : 'INSUFFICIENT_HISTORY',
        },
        valuationCompleteness: {
          status:
            overview.unvaluedPositionCount > 0
              ? 'PARTIAL'
              : overview.valuedPositionCount > 0
                ? 'AVAILABLE'
                : 'UNAVAILABLE',
          reason: overview.unvaluedPositionCount > 0 ? 'PARTIAL_VALUATION' : null,
        },
        performanceAvailability: {
          status: unavailableStatus(perf?.twr?.status === 'COMPLETE', Boolean(perf)),
          reason: perf ? null : 'INSUFFICIENT_HISTORY',
        },
        benchmarkAvailability: {
          status: isBrl ? unavailableStatus(ibovAvailable, ibovAvailable) : 'UNAVAILABLE',
          reason: isBrl ? (ibovAvailable ? null : 'BENCHMARK_UNAVAILABLE') : 'UNSUPPORTED',
        },
        riskAvailability: {
          status:
            riskMetrics.status === 'UNAVAILABLE'
              ? 'UNAVAILABLE'
              : riskMetrics.status === 'PARTIAL'
                ? 'PARTIAL'
                : 'AVAILABLE',
          reason: riskMetrics.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
        },
        tailRiskAvailability: {
          status:
            tail.status === 'UNAVAILABLE'
              ? 'UNAVAILABLE'
              : tail.status === 'PARTIAL'
                ? 'PARTIAL'
                : 'AVAILABLE',
          reason: tail.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
        },
        scenarioAvailability: {
          status: scenarioBlock.status,
          reason: scenarioBlock.status === 'UNAVAILABLE' ? 'PARTIAL_VALUATION' : null,
        },
      };

      currencyInputs.push({
        currency,
        overview,
        performance: {
          twr: twr ? twr.value : null,
          xirr: xirr ? xirr.value : null,
          observationCount: perf?.twr?.subperiods.length ?? 0,
          status: perf?.twr?.status === 'COMPLETE' ? 'AVAILABLE' : perf ? 'PARTIAL' : 'UNAVAILABLE',
        },
        benchmarks,
        risk: {
          realizedVolatilityAnnualized: riskMetrics.volatility.annualizedPercentage
            ? riskMetrics.volatility.annualizedPercentage.value
            : null,
          maximumDrawdown: riskMetrics.drawdown.maximumPercentage
            ? riskMetrics.drawdown.maximumPercentage.value
            : null,
          currentDrawdown: riskMetrics.drawdown.currentPercentage
            ? riskMetrics.drawdown.currentPercentage.value
            : null,
          status: riskMetrics.status,
        },
        riskAdjusted: {
          sharpe,
          sortino,
          riskFreeProxy: isBrl && cdiAvailable ? 'CDI' : null,
          status: isBrl && cdiAvailable ? 'AVAILABLE' : isBrl ? 'UNAVAILABLE' : 'UNAVAILABLE',
        },
        relativeRisk: {
          benchmark: isBrl ? 'IBOV' : null,
          beta,
          correlation,
          trackingErrorAnnualized: trackingError,
          status: isBrl ? (beta ? 'AVAILABLE' : 'PARTIAL') : 'UNAVAILABLE',
        },
        activePerformance: {
          alpha,
          informationRatio,
          treynor,
          status: isBrl
            ? alpha !== null || informationRatio !== null
              ? 'AVAILABLE'
              : 'PARTIAL'
            : 'UNAVAILABLE',
        },
        tailRisk: {
          confidenceLevel: SUMMARY_TAIL_CONFIDENCE,
          downsideDeviationAnnualized: tail.downsideDeviation.annualizedPercentage
            ? tail.downsideDeviation.annualizedPercentage.value
            : null,
          semideviationAnnualized: tail.semideviation.annualizedPercentage
            ? tail.semideviation.annualizedPercentage.value
            : null,
          var95: tail.historicalVar.lossPercentage ? tail.historicalVar.lossPercentage.value : null,
          cvar95: tail.historicalCvar.lossPercentage
            ? tail.historicalCvar.lossPercentage.value
            : null,
          status: tail.status,
        },
        scenario: scenarioBlock,
        dataQuality,
      });
    }

    return buildPortfolioIntelligenceSummary({
      portfolioId: params.portfolioId,
      period: { startDate: effectiveStart.toString(), endDate: effectiveEnd.toString() },
      asOf: effectiveEnd.toString(),
      currencies: currencyInputs,
    });
  }
}
