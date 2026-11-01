import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfoliosController } from './portfolios.controller';
import { ValuationController } from './valuation.controller';
import { PortfolioReviewController } from './portfolio-review.controller';
import { PortfolioAllocationStrategyController } from './portfolio-allocation-strategy.controller';
import { PortfolioAllocationScenariosController } from './portfolio-allocation-scenarios.controller';
import { PortfolioContributionPlansController } from './portfolio-contribution-plans.controller';
import { PortfolioContributionInsightsController } from './portfolio-contribution-insights.controller';
import { PortfolioContributionGoalsController } from './portfolio-contribution-goals.controller';
import { PortfolioContributionCalendarController } from './portfolio-contribution-calendar.controller';
import { PortfolioPositionIntelligenceController } from './portfolio-position-intelligence.controller';
import { PortfolioCompositionController } from './portfolio-composition.controller';
import { PortfolioIncomeController } from './portfolio-income.controller';
import { PortfolioDataQualityController } from './portfolio-data-quality.controller';
import { PortfolioMaintenanceController } from './portfolio-maintenance.controller';
import { PortfolioOperationsController } from './portfolio-operations.controller';
import { PortfolioAuditHistoryController } from './portfolio-audit-history.controller';
import { PortfolioCostEvidenceController } from './portfolio-cost-evidence.controller';
import { PortfolioTaxIntelligenceController } from './portfolio-tax-intelligence.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [
    PortfoliosController,
    PortfolioCostEvidenceController,
    PortfolioTaxIntelligenceController,
    ValuationController,
    PortfolioReviewController,
    PortfolioAllocationStrategyController,
    PortfolioAllocationScenariosController,
    PortfolioContributionPlansController,
    PortfolioContributionInsightsController,
    PortfolioContributionGoalsController,
    PortfolioContributionCalendarController,
    PortfolioPositionIntelligenceController,
    PortfolioCompositionController,
    PortfolioIncomeController,
    PortfolioDataQualityController,
    PortfolioMaintenanceController,
    PortfolioOperationsController,
    PortfolioAuditHistoryController,
  ],
})
export class PortfoliosModule {}
