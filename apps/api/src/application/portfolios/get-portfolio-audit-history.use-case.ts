import { Inject, Injectable } from '@nestjs/common';
import {
  EntityNotFoundError,
  type IAssetRepository,
  type IIntegrationRunRepository,
  type IPortfolioRepository,
  type IReconciliationDecisionRepository,
  type ITransactionRectificationRepository,
  type ITransactionRepository,
} from '@atlas/database';
import {
  ASSET_REPOSITORY,
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  RECONCILIATION_DECISION_REPOSITORY,
  TRANSACTION_RECTIFICATION_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { composePortfolioAuditHistory } from './portfolio-audit-history.compose';
import type {
  OperationalAuditCategory,
  OperationalAuditHistoryResult,
} from './portfolio-audit-history.types';

export interface GetPortfolioAuditHistoryParams {
  portfolioId: string;
  userId: string;
  category?: OperationalAuditCategory;
  limit?: number;
  cursor?: string | null;
}

/**
 * Phase 5S-E — operational audit history read-only use case.
 *
 * Scoped by portfolio and authenticated user ownership. Composes
 * factual, persisted operational activity across transaction rectifications,
 * reconciliation decisions and integration runs.
 */
@Injectable()
export class GetPortfolioAuditHistoryUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(TRANSACTION_RECTIFICATION_REPOSITORY)
    private readonly rectifications: ITransactionRectificationRepository,
    @Inject(RECONCILIATION_DECISION_REPOSITORY)
    private readonly decisions: IReconciliationDecisionRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
  ) {}

  async execute(params: GetPortfolioAuditHistoryParams): Promise<OperationalAuditHistoryResult> {
    // 1. Strict ownership validation
    const portfolio = await this.portfolios.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }

    // 2. Compose derived audit feed
    return composePortfolioAuditHistory(
      {
        rectifications: this.rectifications,
        decisions: this.decisions,
        runs: this.runs,
        transactions: this.transactions,
        assets: this.assets,
      },
      {
        portfolioId: params.portfolioId,
        currentUserId: params.userId,
        category: params.category,
        limit: params.limit,
        cursor: params.cursor,
      },
    );
  }
}
