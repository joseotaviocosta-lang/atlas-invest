import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfolioImportsController } from './portfolio-imports.controller';
import { NodeCronIntegrationScheduler } from './node-cron-integration.scheduler';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfolioImportsController],
  providers: [NodeCronIntegrationScheduler],
})
export class PortfolioImportsModule {}
