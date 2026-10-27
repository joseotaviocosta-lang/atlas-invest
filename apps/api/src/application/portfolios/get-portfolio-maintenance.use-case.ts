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
  composePortfolioMaintenance,
  type PortfolioMaintenanceModel,
} from './portfolio-maintenance.compose';

/**
 * Phase 5S-D — portfolio data maintenance workspace (read-only).
 *
 * Derived over the 5R-E quality composition: what can be done about
 * each diagnosed issue using only writers that already exist. GET
 * never writes; mutations happen only through the existing flows the
 * items point to (market-data refresh, 5S-C rectification via the
 * ledger, 5S-B review workspace).
 */
@Injectable()
export class GetPortfolioMaintenanceUseCase {
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
  }): Promise<PortfolioMaintenanceModel> {
    return composePortfolioMaintenance(
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
