import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfoliosController } from './portfolios.controller';
import { ValuationController } from './valuation.controller';
import { PortfolioReviewController } from './portfolio-review.controller';
import { PortfolioAllocationStrategyController } from './portfolio-allocation-strategy.controller';
import { PortfolioAllocationScenariosController } from './portfolio-allocation-scenarios.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [
    PortfoliosController,
    ValuationController,
    PortfolioReviewController,
    PortfolioAllocationStrategyController,
    PortfolioAllocationScenariosController,
  ],
})
export class PortfoliosModule {}
