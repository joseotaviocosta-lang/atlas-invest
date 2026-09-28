import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { FiscalController } from './fiscal.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [FiscalController],
})
export class FiscalModule {}
