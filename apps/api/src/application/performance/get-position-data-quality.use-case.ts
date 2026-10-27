import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IPortfolioRepository,
} from '@atlas/database';
import {
  ASSET_REPOSITORY,
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import { deriveMaintenanceAction } from '@atlas/portfolio-strategy';
import {
  composePortfolioDataQuality,
  type DataQualityPositionRow,
} from '../portfolios/portfolio-data-quality.compose';

/**
 * Phase 5R-E — position data quality diagnostics (read-only).
 *
 * Reuses the portfolio quality composition filtered to one open asset:
 * one composition per request, never one replay per position. Closed or
 * never-held assets return 404, like 5R-A. Per-asset reconciliation
 * association does not exist in persisted records, so the position view
 * carries no reconciliation block (documented, never inferred).
 */
@Injectable()
export class GetPositionDataQualityUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(GetPortfolioValuationUseCase)
    private readonly valuation: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
  ) {}

  async execute(params: { portfolioId: string; assetId: string; userId: string }): Promise<
    DataQualityPositionRow & {
      portfolioId: string;
      generatedAt: string;
      marketDataAsOf: string | null;
      limitations: string[];
    }
  > {
    const quality = await composePortfolioDataQuality(
      {
        portfolios: this.portfolios,
        valuation: this.valuation,
        allocation: this.allocation,
        assets: this.assets,
        runs: this.runs,
      },
      { portfolioId: params.portfolioId, userId: params.userId },
    );
    const row = quality.positions.find((position) => position.assetId === params.assetId);
    if (!row) {
      throw new EntityNotFoundError('Position', params.assetId);
    }
    // Same policy as the portfolio maintenance workspace: actionability
    // is derived from the backend policy, never decided in the UI.
    const issues = row.issues.map((issue) => ({
      ...issue,
      maintenance: deriveMaintenanceAction(issue.code),
    }));
    return {
      ...row,
      issues,
      portfolioId: quality.portfolioId,
      generatedAt: quality.generatedAt,
      marketDataAsOf: quality.marketDataAsOf,
      limitations: quality.limitations,
    };
  }
}
