import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import {
  UpdateMacroDataUseCase,
  GetMacroCoverageUseCase,
  GetMacroLatestUseCase,
  GetMacroContextUseCase,
} from '../../application/macro';
import { MacroController } from './macro.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [MacroController],
  providers: [
    UpdateMacroDataUseCase,
    GetMacroCoverageUseCase,
    GetMacroLatestUseCase,
    GetMacroContextUseCase,
  ],
  exports: [
    UpdateMacroDataUseCase,
    GetMacroCoverageUseCase,
    GetMacroLatestUseCase,
    GetMacroContextUseCase,
  ],
})
export class MacroModule {}
