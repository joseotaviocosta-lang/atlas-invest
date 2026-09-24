import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import {
  calculateRiskMetrics,
  selectRiskStatisticalReturns,
  RiskSubperiodReturn,
} from '@atlas/risk-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../market-data/tokens';
import { PortfolioRiskReadModel } from './risk-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_RISK_PERIOD_DAYS = 5 * 366;

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
 * GetPortfolioRiskMetricsUseCase (3I, ADR-131).
 *
 * Methodology, not presentation: risk calculation dates are EVERY civil date
 * in [effectiveStart, effectiveEnd] ∪ external-flow dates — never the
 * AUTO/WEEKLY/MONTHLY display samples of the 3H chart. Replay, price
 * resolution and cash-flow collection are reused verbatim from the shared
 * PerformanceCalculationContextBuilder; subperiod TWR returns come from the
 * performance engine (flows neutralized, transfers net-zero); volatility and
 * drawdown come from the risk engine. No benchmark, no FX, no prediction.
 */
@Injectable()
export class GetPortfolioRiskMetricsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PortfolioRiskReadModel> {
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
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_RISK_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: risk range exceeds ${MAX_RISK_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

    // Risk methodology dates: every civil date + flow dates (ADR-131).
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

    const currenciesRecord: PortfolioRiskReadModel['currencies'] = {};
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

      // Layer B (ADR-132): statistical observations end on economic dates
      // only — Saturdays/Sundays/holidays resolved via PREVIOUS_TRADING_DAY
      // and flow-only non-market dates stay TWR boundaries, never 0% sample
      // points. Flow neutralization lives in Layer A above and is preserved.
      const economicDates = [effectiveStart];
      for (const [dateStr, exact] of Object.entries(ctx.exactPriceByDate)) {
        if (exact) economicDates.push(LocalDate.from(dateStr));
      }
      const subperiodReturns = selectRiskStatisticalReturns({
        subperiodReturns: twrSubperiods,
        economicDates,
      });

      // Upstream data quality, evaluated on economic dates only: PARTIAL if
      // any used economic valuation was partial or any in-period calculation
      // date had no valuation at all (genuine gap, not a resolved weekend).
      const usedDates = new Set(
        ctx.observations
          .map((o) => o.date.toString())
          .filter((d) => d === effectiveStart.toString() || ctx.exactPriceByDate[d] === true),
      );
      let upstream: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' = 'AVAILABLE';
      for (const [dateStr, availability] of Object.entries(ctx.availabilityByDate)) {
        if (availability === 'PARTIAL' && usedDates.has(dateStr)) {
          upstream = 'PARTIAL';
          break;
        }
      }
      if (upstream === 'AVAILABLE') {
        for (const dateStr of Object.keys(ctx.availabilityByDate)) {
          if (ctx.availabilityByDate[dateStr] === 'UNAVAILABLE') {
            const d = LocalDate.from(dateStr);
            if (d.compare(effectiveStart) > 0 && d.compare(effectiveEnd) <= 0) {
              upstream = 'PARTIAL';
              break;
            }
          }
        }
      }
      if (ctx.observations.length === 0) upstream = 'UNAVAILABLE';

      const metrics = calculateRiskMetrics({
        currency: ctx.currency,
        frequency: 'DAILY',
        startDate: effectiveStart,
        subperiodReturns,
        dataAvailability: upstream,
      });

      if (metrics.status === 'AVAILABLE') anyAvailable = true;
      else if (metrics.status === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        frequency: 'DAILY',
        status: metrics.status,
        dataAvailability: metrics.status === 'AVAILABLE' ? 'AVAILABLE' : metrics.status,
        volatility: {
          frequency: metrics.volatility.frequency,
          observationCount: metrics.volatility.observationCount,
          samplePercentage: metrics.volatility.samplePercentage
            ? metrics.volatility.samplePercentage.value
            : null,
          annualizedPercentage: metrics.volatility.annualizedPercentage
            ? metrics.volatility.annualizedPercentage.value
            : null,
          annualizationFactor: metrics.volatility.annualizationFactor,
          status: metrics.volatility.status,
        },
        drawdown: {
          maximumPercentage: metrics.drawdown.maximumPercentage
            ? metrics.drawdown.maximumPercentage.value
            : null,
          peakDate: metrics.drawdown.peakDate ? metrics.drawdown.peakDate.toString() : null,
          troughDate: metrics.drawdown.troughDate ? metrics.drawdown.troughDate.toString() : null,
          recoveryDate: metrics.drawdown.recoveryDate
            ? metrics.drawdown.recoveryDate.toString()
            : null,
          currentPercentage: metrics.drawdown.currentPercentage
            ? metrics.drawdown.currentPercentage.value
            : null,
          status: metrics.drawdown.status,
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
