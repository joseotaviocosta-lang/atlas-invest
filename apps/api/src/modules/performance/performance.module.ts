import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PerformanceController } from './performance.controller';
import { PositionPerformanceController } from './position-performance.controller';
import { PositionIncomeController } from './position-income.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PerformanceController, PositionPerformanceController, PositionIncomeController],
})
export class PerformanceModule {}
