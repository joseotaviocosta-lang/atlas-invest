import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import { calculateTWR } from '@atlas/performance-engine';
import {
  assertValidTailConfidenceLevel,
  calculateTailRisk,
  selectRiskStatisticalReturns,
  RiskSubperiodReturn,
  TailConfidenceLevel,
} from '@atlas/risk-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../market-data/tokens';
import { PortfolioTailRiskReadModel, TailRiskCurrencyReadModel } from './tail-risk-read-models';
import {
  PerformanceCalculationContextBuilder,
  clampPeriodToInception,
} from './performance-calculation-context';

const MAX_TAIL_RISK_PERIOD_DAYS = 5 * 366;

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
 * GetPortfolioTailRiskMetricsUseCase (3N, ADR-153–ADR-158).
 *
 * Downside deviation (target 0%), semideviation (target = sample mean) and
 * HISTORICAL (empirical, nearest-rank) VaR/CVaR over the canonical 3I Layer-B
 * economic TWR returns. No parametric assumptions, no sqrt-time scaling, no
 * monetary VaR, no IBOV/CDI (the portfolio alone is the source). ONE context
 * build per request; the sorted sample is computed once per currency/confidence
 * and reused for VaR and CVaR. Segregated by currency; no FX. BRL and USD are
 * both eligible when their history is sufficient. No prediction/guarantee.
 */
@Injectable()
export class GetPortfolioTailRiskMetricsUseCase {
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
    confidenceLevel?: string;
  }): Promise<PortfolioTailRiskReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // Confidence is MANDATORY in 3N: no silent default.
    if (!params.confidenceLevel) {
      throw new BadRequestException({
        message: 'Missing required confidenceLevel. Supported: 95, 99',
        code: 'TAIL_RISK.INVALID_CONFIDENCE_LEVEL',
      });
    }
    let confidenceLevel: TailConfidenceLevel;
    try {
      confidenceLevel = assertValidTailConfidenceLevel(params.confidenceLevel);
    } catch (err: unknown) {
      throw new BadRequestException({
        message: (err as Error).message,
        code: 'TAIL_RISK.INVALID_CONFIDENCE_LEVEL',
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
    if (daysBetweenCivil(periodStart, periodEnd) > MAX_TAIL_RISK_PERIOD_DAYS) {
      throw new BadRequestException({
        message: `Invalid period: tail-risk range exceeds ${MAX_TAIL_RISK_PERIOD_DAYS} days`,
        code: 'PERFORMANCE.INVALID_PERIOD',
      });
    }

    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const { effectiveStart, effectiveEnd } = clampPeriodToInception(
      transactions,
      periodStart,
      periodEnd,
    );

    // Same Layer-A methodology dates as 3I/3J/3K/3L/3M (ADR-131).
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

    // ONE portfolio context build per request; no IBOV/CDI fetches in 3N.
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

    const currenciesRecord: Record<string, TailRiskCurrencyReadModel> = {};
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

      // Layer B (ADR-132): economic dates only (weekends/holidays/flows excluded).
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

      const risk = calculateTailRisk({
        currency: ctx.currency,
        returns: statistical,
        confidenceLevel,
        frequency: 'DAILY',
        partial: partialUpstream,
      });

      const status =
        risk.status === 'AVAILABLE'
          ? 'AVAILABLE'
          : risk.status === 'PARTIAL'
            ? 'PARTIAL'
            : 'UNAVAILABLE';
      if (status === 'AVAILABLE') anyAvailable = true;
      else if (status === 'PARTIAL') anyPartial = true;
      else anyUnavailable = true;

      currenciesRecord[ctx.currency] = {
        currency: ctx.currency,
        status,
        observationCount: risk.observationCount,
        downsideDeviation: {
          frequency: risk.downsideDeviation.frequency,
          dailyPercentage: risk.downsideDeviation.dailyPercentage
            ? risk.downsideDeviation.dailyPercentage.value
            : null,
          annualizedPercentage: risk.downsideDeviation.annualizedPercentage
            ? risk.downsideDeviation.annualizedPercentage.value
            : null,
          negativeObservationCount: risk.downsideDeviation.negativeObservationCount,
        },
        semideviation: {
          frequency: risk.semideviation.frequency,
          dailyPercentage: risk.semideviation.dailyPercentage
            ? risk.semideviation.dailyPercentage.value
            : null,
          annualizedPercentage: risk.semideviation.annualizedPercentage
            ? risk.semideviation.annualizedPercentage.value
            : null,
        },
        historicalVar: {
          confidenceLevel: risk.historicalVar.confidenceLevel,
          quantileReturnPercentage: risk.historicalVar.quantileReturnPercentage
            ? risk.historicalVar.quantileReturnPercentage.value
            : null,
          lossPercentage: risk.historicalVar.lossPercentage
            ? risk.historicalVar.lossPercentage.value
            : null,
          tailObservationCount: risk.historicalVar.tailObservationCount,
        },
        historicalCvar: {
          confidenceLevel: risk.historicalCvar.confidenceLevel,
          meanTailReturnPercentage: risk.historicalCvar.meanTailReturnPercentage
            ? risk.historicalCvar.meanTailReturnPercentage.value
            : null,
          lossPercentage: risk.historicalCvar.lossPercentage
            ? risk.historicalCvar.lossPercentage.value
            : null,
          tailObservationCount: risk.historicalCvar.tailObservationCount,
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
      confidenceLevel,
      currencies: currenciesRecord,
      status,
      dataAvailability,
    };
  }
}
