import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import {
  TransactionsController,
  PortfolioTransactionsController,
} from './transactions.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfolioTransactionsController, TransactionsController],
})
export class TransactionsModule {}
