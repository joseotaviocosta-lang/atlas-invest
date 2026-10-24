import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IntegrationRunRow,
  IIntegrationRunRepository,
  IPortfolioRepository,
} from '@atlas/database';
import {
  buildPortfolioReview,
  type BuildReviewInput,
  type PortfolioReview,
} from '@atlas/portfolio-review';
import { deriveReviewItems } from '@atlas/import-engine';
import { INTEGRATION_RUN_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioStateUseCase } from './get-portfolio-state.use-case';
import { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import { GetPortfolioIntelligenceSummaryUseCase } from '../performance/get-portfolio-intelligence-summary.use-case';

/**
 * Phase 5Q-A — portfolio review read model.
 *
 * Composes existing read models (state, valuation, allocation,
 * intelligence summary, run history) into one deterministic review.
 * Derives everything; persists nothing; computes no financial math
 * beyond what the composed use-cases already return. Empty portfolios
 * yield an empty review (no signals, no conclusions).
 */
@Injectable()
export class GetPortfolioReviewUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(GetPortfolioStateUseCase)
    private readonly state: GetPortfolioStateUseCase,
    @Inject(GetPortfolioValuationUseCase)
    private readonly valuation: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
    @Inject(GetPortfolioIntelligenceSummaryUseCase)
    private readonly intelligence: GetPortfolioIntelligenceSummaryUseCase,
  ) {}

  private toDerivationInput(row: IntegrationRunRow) {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      source: row.source,
      trigger: row.trigger,
      status: row.status,
      newCandidates: row.newCandidates,
      exactDuplicates: row.exactDuplicates,
      probableDuplicates: row.probableDuplicates,
      conflicts: row.conflicts,
      unsupported: row.unsupported,
      invalid: row.invalid,
      partial: row.partial,
      reconciliation: row.reconciliation,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async execute(params: {
    portfolioId: string;
    userId: string;
    now?: Date;
    /** Explicit analysis window. Omitted → composed use-cases apply their defaults. */
    period?: { startDate: string; endDate: string };
  }): Promise<PortfolioReview> {
    const portfolio = await this.portfolios.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }
    const now = params.now ?? new Date();

    const [state, valuation, allocation, intelligence, recentRuns] = await Promise.all([
      this.state.execute({ portfolioId: params.portfolioId, userId: params.userId }),
      this.valuation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
      this.allocation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
      this.intelligence.execute({
        portfolioId: params.portfolioId,
        userId: params.userId,
        ...(params.period
          ? { startDate: params.period.startDate, endDate: params.period.endDate }
          : {}),
      }),
      this.runs.listRecentByPortfolioIds([params.portfolioId], 200),
    ]);

    const pendingReviewCount = deriveReviewItems(
      recentRuns.map((row) => this.toDerivationInput(row)),
    ).length;
    const reconciliation = { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 };
    let partialRuns = 0;
    for (const row of recentRuns) {
      if (row.status === 'PARTIAL' || row.partial) partialRuns += 1;
      const reconciliationRow = row.reconciliation;
      if (!reconciliationRow) continue;
      reconciliation.divergent += reconciliationRow.divergent;
      reconciliation.missingLocal += reconciliationRow.missingLocal;
      reconciliation.missingSource += reconciliationRow.missingSource;
      reconciliation.unresolved += reconciliationRow.unresolved;
    }

    const input: BuildReviewInput = {
      portfolioId: params.portfolioId,
      generatedAt: now,
      valuation: {
        asOf: valuation.asOf,
        summary: {
          totalPositions: valuation.summary.totalPositions,
          valuedPositions: valuation.summary.valuedPositions,
          unvaluedPositions: valuation.summary.unvaluedPositions,
          stalePositions: valuation.summary.stalePositions,
          mismatchPositions: valuation.summary.mismatchPositions,
          valuationCoveragePercent: valuation.summary.valuationCoveragePercent,
          currencies: valuation.summary.currencies,
        },
        quoteSummary: {
          totalQuotesRequested: valuation.quoteSummary.totalQuotesRequested,
          quotesAvailable: valuation.quoteSummary.quotesAvailable,
          quotesUnavailable: valuation.quoteSummary.quotesUnavailable,
          quotesStale: valuation.quoteSummary.quotesStale,
        },
      },
      allocation: {
        status: allocation.status,
        valuationCoveragePercent: allocation.valuationCoveragePercent,
        currencies: Object.fromEntries(
          Object.entries(allocation.currencies).map(([currency, bucket]) => [
            currency,
            {
              byAsset: bucket.byAsset.map((item) => ({
                assetId: item.assetId,
                ticker: item.ticker,
                allocationPercent: item.allocationPercent,
                currency: item.currency,
              })),
            },
          ]),
        ),
        translatedAllocation: allocation.translatedAllocation
          ? {
              status: allocation.translatedAllocation.status,
              byAsset: allocation.translatedAllocation.byAsset.map((item) => ({
                assetId: item.assetId,
                ticker: item.ticker ?? null,
                allocationPercent: item.allocationPercent,
              })),
            }
          : null,
      },
      state: {
        openPositionCount: state.positions.length,
        hasCashFlowsOnly: state.positions.length === 0 && state.cashFlowSummaries.length > 0,
        income: state.incomeSummaries.map((row) => ({
          currency: row.currency,
          totalDividends: {
            amount: row.totalDividends.amount,
            currency: row.totalDividends.currency,
          },
          totalJcp: { amount: row.totalJcp.amount, currency: row.totalJcp.currency },
          totalFiiIncome: {
            amount: row.totalFiiIncome.amount,
            currency: row.totalFiiIncome.currency,
          },
          totalIncome: { amount: row.totalIncome.amount, currency: row.totalIncome.currency },
        })),
      },
      intelligence: {
        period: { ...intelligence.period },
        benchmarks: Object.entries(intelligence.currencies).flatMap(([currency, block]) =>
          block.benchmarks.map((benchmark) => ({
            id: benchmark.id,
            currency,
            differencePercentagePoints: benchmark.differencePercentagePoints,
            status: benchmark.status,
          })),
        ),
      },
      runs: { pendingReviewCount, partialRuns, reconciliation },
    };
    return buildPortfolioReview(input);
  }
}
