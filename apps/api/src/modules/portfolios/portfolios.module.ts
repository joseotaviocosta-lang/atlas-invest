import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfoliosController } from './portfolios.controller';
import { ValuationController } from './valuation.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfoliosController, ValuationController],
})
export class PortfoliosModule {}
