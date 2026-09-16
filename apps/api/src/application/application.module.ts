import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { CreatePortfolioUseCase, GetPortfolioUseCase, ListPortfoliosUseCase } from './portfolios';
import {
  CreateInstitutionUseCase,
  GetInstitutionUseCase,
  ListInstitutionsUseCase,
} from './institutions';
import { CreateAccountUseCase, GetAccountUseCase, ListAccountsUseCase } from './accounts';
import { CreateAssetUseCase, GetAssetUseCase, SearchAssetsUseCase } from './assets';
import {
  CreateTransactionUseCase,
  GetTransactionUseCase,
  ListTransactionsUseCase,
} from './transactions';

const USE_CASES = [
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
  CreateInstitutionUseCase,
  GetInstitutionUseCase,
  ListInstitutionsUseCase,
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountsUseCase,
  CreateAssetUseCase,
  GetAssetUseCase,
  SearchAssetsUseCase,
  CreateTransactionUseCase,
  GetTransactionUseCase,
  ListTransactionsUseCase,
];

@Module({
  imports: [DatabaseModule],
  providers: [...USE_CASES],
  exports: [...USE_CASES],
})
export class ApplicationModule {}
