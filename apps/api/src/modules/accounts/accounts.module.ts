import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { AccountsController, PortfolioAccountsController } from './accounts.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [PortfolioAccountsController, AccountsController],
})
export class AccountsModule {}
