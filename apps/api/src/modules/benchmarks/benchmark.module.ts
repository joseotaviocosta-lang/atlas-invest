import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { BenchmarkController } from './benchmark.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [BenchmarkController],
})
export class BenchmarkModule {}
