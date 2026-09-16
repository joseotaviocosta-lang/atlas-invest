import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { PortfoliosController } from './portfolios.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfoliosController],
})
export class PortfoliosModule {}
