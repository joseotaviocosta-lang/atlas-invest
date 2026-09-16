import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { InstitutionsController } from './institutions.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [InstitutionsController],
})
export class InstitutionsModule {}
