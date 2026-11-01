import { Inject, Injectable } from '@nestjs/common';
import {
  EntityNotFoundError,
  type ICostBasisEvidenceRepository,
  type IPortfolioRepository,
  type ITransactionRepository,
} from '@atlas/database';
import {
  projectTaxIntelligence,
  summarizeDocumentaryCoverage,
  type TaxIntelligenceContext,
  type TaxIntelligenceResponse,
} from '@atlas/tax-intelligence';
import {
  COST_EVIDENCE_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_CLOCK } from '../fiscal/tokens';
import type { FiscalClock } from '../fiscal/fiscal-clock';
import { GetMonthlyTaxStateUseCase } from '../fiscal/get-monthly-tax-state.use-case';
import { GetMonthlyTaxLiabilityUseCase } from '../fiscal/get-monthly-tax-liability.use-case';
import { GetAnnualTaxReadinessUseCase } from '../fiscal/get-annual-tax-readiness.use-case';
import { replayPortfolio } from '@atlas/portfolio-engine';

export interface GetTaxIntelligenceQuery {
  readonly portfolioId: string;
  readonly userId: string;
  /** Civil competence YYYY-MM. Defaults to the current civil month. */
  readonly competence?: string;
}

/**
 * CTI-1 read-only orchestration (ADR-311).
 *
 * Authorizes the portfolio, loads canonical subject-level tax state
 * (monthly state, liability when COMPLETE, annual readiness) plus
 * portfolio-level documentary coverage, then projects a deterministic
 * explanation. No writes, no recomputation, no provider calls.
 */
@Injectable()
export class GetTaxIntelligenceUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(COST_EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: ICostBasisEvidenceRepository,
    @Inject(GetMonthlyTaxStateUseCase)
    private readonly monthlyStateUseCase: GetMonthlyTaxStateUseCase,
    @Inject(GetMonthlyTaxLiabilityUseCase)
    private readonly monthlyLiabilityUseCase: GetMonthlyTaxLiabilityUseCase,
    @Inject(GetAnnualTaxReadinessUseCase)
    private readonly annualReadinessUseCase: GetAnnualTaxReadinessUseCase,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(query: GetTaxIntelligenceQuery): Promise<TaxIntelligenceResponse> {
    const portfolio = await this.portfolioRepository.findById(query.portfolioId);
    if (!portfolio || portfolio.userId !== query.userId) {
      throw new EntityNotFoundError('Portfolio', query.portfolioId);
    }

    const today = this.clock.today();
    const competence = query.competence ?? today.slice(0, 7);
    const calendarYear = Number.parseInt(competence.slice(0, 4), 10);

    const monthly = await this.monthlyStateUseCase.execute({
      userId: query.userId,
      competence,
    });

    // Canonical liability (with taxDue + equity reason) only when the monthly
    // state is COMPLETE — never summarize partial/blocked figures (PART N).
    let taxDue: { amount: string; currency: string } | null = null;
    let equityReasonCode: string | null = null;
    let limitations: readonly string[] = [];
    if (monthly.status === 'COMPLETE') {
      const liability = await this.monthlyLiabilityUseCase.execute({
        userId: query.userId,
        competence,
      });
      taxDue = liability.taxDue
        ? { amount: liability.taxDue.amount, currency: liability.taxDue.currency }
        : null;
      equityReasonCode = liability.equity?.reasonCode ?? null;
      limitations = liability.limitations ?? [];
    }

    const annual = await this.annualReadinessUseCase.execute({
      taxSubjectId: query.userId,
      calendarYear,
    });

    const ledger = await this.transactionRepository.findByPortfolioId(query.portfolioId);
    const replayed = replayPortfolio({ portfolioId: query.portfolioId, transactions: ledger });
    const evidenceRows = await this.evidenceRepository.listCurrentByScope({
      portfolioId: query.portfolioId,
    });
    const coverage = summarizeDocumentaryCoverage({
      transactions: ledger,
      replayState: replayed.state,
      evidenceRows,
    });

    const qualityIssues = Array.from(
      new Set([
        ...monthly.dataQuality.issues,
        ...monthly.categories.flatMap((category) => category.qualityIssues),
      ]),
    );

    const context: TaxIntelligenceContext = {
      portfolioId: query.portfolioId,
      competence,
      calendarYear,
      monthly: {
        status: monthly.status,
        reasonCode: equityReasonCode,
        qualityIssues,
        taxDue,
        limitations: [...limitations],
        ruleSetVersion: monthly.ruleSetVersion,
        ruleSetStatus: monthly.ruleSetStatus,
      },
      annual: {
        overallStatus: annual.overallStatus,
        blockingReasons: [...annual.blockingReasons],
        requirements: annual.requirements.map((req) => ({
          requirementId: req.requirementId,
          section: req.section,
          status: req.status,
          title: req.title,
          description: req.description,
          blockingReason: req.blockingReason ?? null,
        })),
      },
      cost: {
        incompleteAssets: coverage.incompleteAssets,
        partialAssets: coverage.partialAssets,
        completeAssets: coverage.completeAssets,
        canonicalIncompleteAssets: coverage.canonicalIncompleteAssets,
        reviewRequiredCount: evidenceRows.filter((row) => row.status === 'REVIEW_REQUIRED').length,
      },
      reconciliationBlockers: [],
      freshness: { asOf: today, lastReplayAt: today },
    };

    return projectTaxIntelligence(context, new Date().toISOString());
  }
}
