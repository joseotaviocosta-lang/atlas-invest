import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/application.module';
import { AiController } from './ai.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [AiController],
})
export class AiModule {}
