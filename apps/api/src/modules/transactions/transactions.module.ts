import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { TransactionsController, PortfolioTransactionsController } from './transactions.controller';
import { PortfolioCorporateActionsController } from './corporate-actions.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [
    PortfolioTransactionsController,
    PortfolioCorporateActionsController,
    TransactionsController,
  ],
})
export class TransactionsModule {}
