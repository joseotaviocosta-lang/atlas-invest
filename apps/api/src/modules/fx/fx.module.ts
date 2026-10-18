import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FxController } from './fx.controller';
import { UpdateFxDataUseCase, GetFxCoverageUseCase } from '../../application/fx';

@Module({
  imports: [DatabaseModule],
  controllers: [FxController],
  providers: [UpdateFxDataUseCase, GetFxCoverageUseCase],
  exports: [UpdateFxDataUseCase, GetFxCoverageUseCase],
})
export class FxModule {}
