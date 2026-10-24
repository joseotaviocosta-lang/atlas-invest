import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfoliosController } from './portfolios.controller';
import { ValuationController } from './valuation.controller';
import { PortfolioReviewController } from './portfolio-review.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfoliosController, ValuationController, PortfolioReviewController],
})
export class PortfoliosModule {}
