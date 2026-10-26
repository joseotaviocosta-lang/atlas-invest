import { Inject, Injectable } from '@nestjs/common';
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
import {
  composePortfolioDataQuality,
  type PortfolioDataQualityModel,
} from './portfolio-data-quality.compose';

/**
 * Phase 5R-E — portfolio data quality diagnostics (read-only).
 *
 * Consolidates valuation, cost-basis, FX, classification and
 * reconciliation facts into operational issues with explicit affected
 * capabilities and safe navigation actions. Derived only — persists
 * nothing, changes nothing, ranks nothing.
 */
@Injectable()
export class GetPortfolioDataQualityUseCase {
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

  async execute(params: {
    portfolioId: string;
    userId: string;
  }): Promise<PortfolioDataQualityModel> {
    return composePortfolioDataQuality(
      {
        portfolios: this.portfolios,
        valuation: this.valuation,
        allocation: this.allocation,
        assets: this.assets,
        runs: this.runs,
      },
      params,
    );
  }
}
