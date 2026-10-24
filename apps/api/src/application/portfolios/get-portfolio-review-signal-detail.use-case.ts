import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { IPortfolioRepository, IIntegrationRunRepository } from '@atlas/database';
import {
  BENCHMARK_GAP_MATERIAL_PP_BP,
  deriveGapHistory,
  deriveIncomeHistory,
  deriveRunsHistory,
  monthsInRange,
  resolveReviewPeriod,
  REVIEW_HISTORY_LIMITS,
  REVIEW_SIGNAL_CODES,
  type PortfolioReviewSignalDetail,
  type ReviewLimitation,
  type ReviewSignalCode,
} from '@atlas/portfolio-review';
import type { IntegrationRunRow } from '@atlas/database';
import { INTEGRATION_RUN_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioReviewUseCase } from './get-portfolio-review.use-case';
import { GetPortfolioPerformanceSeriesUseCase } from '../performance/get-portfolio-performance-series.use-case';
import { GetPortfolioHistoryUseCase } from './get-portfolio-history.use-case';

/**
 * Phase 5Q-B — signal drill-down read model (derived, never persisted).
 *
 * One code → one deterministic detail: current evidence from the same
 * buildPortfolioReview call that feeds the overview (STEP 45, by
 * construction), historical evidence where a real source exists (series
 * for performance gaps, monthly buckets from ledger income events,
 * recent-run tables for integration), neutral trends, explicit
 * limitations. Unknown codes 404; inactive signals return state
 * NOT_ACTIVE with whatever history is honestly available (STEP 10).
 */
@Injectable()
export class GetPortfolioReviewSignalDetailUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(GetPortfolioReviewUseCase)
    private readonly review: GetPortfolioReviewUseCase,
    @Inject(GetPortfolioPerformanceSeriesUseCase)
    private readonly series: GetPortfolioPerformanceSeriesUseCase,
    @Inject(GetPortfolioHistoryUseCase)
    private readonly history: GetPortfolioHistoryUseCase,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    code: string;
    period?: string;
    now?: Date;
  }): Promise<PortfolioReviewSignalDetail> {
    if (!(REVIEW_SIGNAL_CODES as readonly string[]).includes(params.code)) {
      throw new NotFoundException({
        message: `Portfolio review signal '${params.code}' not found`,
        code: 'REVIEW.SIGNAL_NOT_FOUND',
      });
    }
    const code = params.code as ReviewSignalCode;
    const portfolio = await this.portfolios.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }
    const now = params.now ?? new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const period = resolveReviewPeriod(params.period ?? '1A', todayIso);

    const [review, recentRuns] = await Promise.all([
      this.review.execute({
        portfolioId: params.portfolioId,
        userId: params.userId,
        now,
        period: { startDate: period.startDate, endDate: period.endDate },
      }),
      this.runs.listRecentByPortfolioIds([params.portfolioId], 200),
    ]);
    const signal = review.signals.find((item) => item.code === code) ?? null;
    const limitations: ReviewLimitation[] = [];
    if (recentRuns.length >= 200) {
      limitations.push('WINDOW_TRUNCATED');
    }

    const base = {
      code,
      state: (signal ? 'ACTIVE' : 'NOT_ACTIVE') as 'ACTIVE' | 'NOT_ACTIVE',
      period: { preset: period.preset, startDate: period.startDate, endDate: period.endDate },
      generatedAt: now.toISOString(),
      marketDataAsOf: review.asOf.marketDataAsOf,
      evidence: signal ? { ...signal.evidence } : null,
      action: signal ? signal.action : ({ kind: 'NONE' } as const),
    };

    switch (code) {
      case 'PERFORMANCE_BENCHMARK_GAP':
        return {
          ...base,
          history: await this.gapHistory(params, period),
          limitations,
          action: {
            kind: 'ROUTE' as const,
            href: `/portfolio/performance?portfolioId=${params.portfolioId}`,
            label: 'Ver performance',
          },
        };
      case 'PERFORMANCE_BENCHMARK_UNAVAILABLE':
        return {
          ...base,
          history: { kind: 'UNAVAILABLE', reason: 'BENCHMARK_UNAVAILABLE' } as const,
          limitations: [...limitations, 'NO_BENCHMARK_IN_PERIOD' as const],
          action: {
            kind: 'ROUTE' as const,
            href: `/portfolio/performance?portfolioId=${params.portfolioId}`,
            label: 'Ver performance',
          },
        };
      case 'ALLOCATION_SINGLE_ASSET_CONCENTRATION':
      case 'DATA_VALUATION_COVERAGE':
        return {
          ...base,
          history: { kind: 'UNAVAILABLE', reason: 'NO_HISTORICAL_SOURCE' } as const,
          limitations: [...limitations, 'NO_HISTORICAL_SOURCE' as const],
          action: base.action,
        };
      case 'INCOME_RECEIVED':
        return {
          ...base,
          history: await this.incomeHistory(params, period),
          limitations,
          action: {
            kind: 'ROUTE' as const,
            href: `/portfolio/income?portfolioId=${params.portfolioId}`,
            label: 'Ver proventos',
          },
        };
      case 'INTEGRATION_PENDING_REVIEW':
      case 'DATA_RECONCILIATION_DIVERGENCE':
        return {
          ...base,
          history: this.runsHistory(recentRuns, period),
          limitations,
          action: {
            kind: 'ROUTE' as const,
            href: `/reviews?portfolioId=${params.portfolioId}`,
            label: code === 'INTEGRATION_PENDING_REVIEW' ? 'Revisar importações' : 'Ver pendências',
          },
        };
    }
  }

  private async gapHistory(
    params: { portfolioId: string; userId: string },
    period: { startDate: string; endDate: string },
  ) {
    const benchmarks = ['IBOV', 'CDI'];
    for (const benchmark of benchmarks) {
      try {
        const result = await this.series.execute({
          portfolioId: params.portfolioId,
          userId: params.userId,
          startDate: period.startDate,
          endDate: period.endDate,
          benchmark,
        });
        const currencies = Object.values(result.currencies);
        const withBenchmark = currencies.find((block) => block.benchmark !== null);
        const block = withBenchmark ?? currencies[0];
        if (!block) continue;
        if (!withBenchmark) continue;
        const points = block.points.map((point) => ({
          date: point.date,
          portfolioReturn: point.portfolioReturn,
          benchmarkReturn: point.benchmarkReturn,
        }));
        const sliced =
          points.length > REVIEW_HISTORY_LIMITS.maxPoints
            ? points.slice(points.length - REVIEW_HISTORY_LIMITS.maxPoints)
            : points;
        return deriveGapHistory(sliced, BENCHMARK_GAP_MATERIAL_PP_BP, benchmark, block.currency);
      } catch {
        continue;
      }
    }
    return { kind: 'UNAVAILABLE', reason: 'BENCHMARK_UNAVAILABLE' } as const;
  }

  private async incomeHistory(
    params: { portfolioId: string; userId: string },
    period: { startDate: string; endDate: string },
  ) {
    const months = monthsInRange(period.startDate, period.endDate, REVIEW_HISTORY_LIMITS.maxMonths);
    const rows: Array<{
      tradeDate: string;
      amount: string;
      currency: string;
      kind: 'DIVIDEND' | 'JCP' | 'FII';
    }> = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await this.history.execute({
        portfolioId: params.portfolioId,
        userId: params.userId,
        type: 'income',
        from: period.startDate,
        to: period.endDate,
        limit: 200,
        cursor,
      });
      for (const item of result.items) {
        const details = item.details as {
          type?: string;
          amount?: { amount?: string; currency?: string };
        };
        const kind =
          details.type === 'DIVIDEND'
            ? ('DIVIDEND' as const)
            : details.type === 'JCP'
              ? ('JCP' as const)
              : details.type === 'FII_INCOME'
                ? ('FII' as const)
                : null;
        if (kind === null || typeof details.amount?.amount !== 'string') continue;
        rows.push({
          tradeDate: item.tradeDate,
          amount: details.amount.amount,
          currency: item.currency ?? details.amount.currency ?? 'BRL',
          kind,
        });
      }
      if (!result.meta.hasMore || !result.meta.nextCursor) break;
      cursor = result.meta.nextCursor;
    }
    const currencies = Array.from(new Set(rows.map((row) => row.currency)));
    if (currencies.length === 0) {
      return {
        kind: 'GROUPED' as const,
        groups: [],
      };
    }
    return {
      kind: 'GROUPED' as const,
      groups: currencies.map((currency) =>
        deriveIncomeHistory(
          rows.filter((row) => row.currency === currency),
          months,
          currency,
        ),
      ),
    };
  }

  private runsHistory(
    recentRuns: IntegrationRunRow[],
    period: { startDate: string; endDate: string },
  ) {
    const inWindow = recentRuns.filter((row) => {
      const day = row.createdAt.toISOString().slice(0, 10);
      return day >= period.startDate && day <= period.endDate;
    });
    return deriveRunsHistory(
      inWindow.slice(0, REVIEW_HISTORY_LIMITS.maxRuns).map((row) => ({
        runId: row.id,
        createdAt: row.createdAt.toISOString(),
        status: row.status,
        trigger: row.trigger,
        newRecords: row.newCandidates,
        partial: row.partial,
        divergent: row.reconciliation?.divergent ?? 0,
        missingLocal: row.reconciliation?.missingLocal ?? 0,
        missingSource: row.reconciliation?.missingSource ?? 0,
        unresolved: row.reconciliation?.unresolved ?? 0,
      })),
      REVIEW_HISTORY_LIMITS.maxRuns,
    );
  }
}
