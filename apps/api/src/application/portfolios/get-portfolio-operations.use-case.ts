import { Inject, Injectable } from '@nestjs/common';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IPortfolioRepository,
  IReconciliationDecisionRepository,
} from '@atlas/database';
import {
  ASSET_REPOSITORY,
  INTEGRATION_RUN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  RECONCILIATION_DECISION_REPOSITORY,
} from '../../database/tokens';
import { IntegrationSettingsService } from '../imports/integration-settings.service';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import {
  composePortfolioOperations,
  type PortfolioOperationsModel,
} from './portfolio-operations.compose';

/**
 * Phase 5S-A — portfolio operations center (read-only).
 *
 * Single derived view over integration settings, recent runs, review
 * derivation and 5R-E data quality. Navigation-oriented facts only.
 */
@Injectable()
export class GetPortfolioOperationsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
    @Inject(GetPortfolioValuationUseCase)
    private readonly valuation: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(RECONCILIATION_DECISION_REPOSITORY)
    private readonly decisions: IReconciliationDecisionRepository,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
  }): Promise<PortfolioOperationsModel> {
    return composePortfolioOperations(
      {
        portfolios: this.portfolios,
        settings: this.settings,
        valuation: this.valuation,
        allocation: this.allocation,
        assets: this.assets,
        runs: this.runs,
        decisions: this.decisions,
      },
      params,
    );
  }
}
