import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfolioImportsController } from './portfolio-imports.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfolioImportsController],
})
export class PortfolioImportsModule {}
