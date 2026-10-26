import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PerformanceController } from './performance.controller';
import { PositionPerformanceController } from './position-performance.controller';
import { PositionIncomeController } from './position-income.controller';
import { PositionDataQualityController } from './position-data-quality.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [
    PerformanceController,
    PositionPerformanceController,
    PositionIncomeController,
    PositionDataQualityController,
  ],
})
export class PerformanceModule {}
