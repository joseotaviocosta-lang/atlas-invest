import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PerformanceController } from './performance.controller';
import { PositionPerformanceController } from './position-performance.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PerformanceController, PositionPerformanceController],
})
export class PerformanceModule {}
