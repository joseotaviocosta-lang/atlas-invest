import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PerformanceController } from './performance.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PerformanceController],
})
export class PerformanceModule {}
