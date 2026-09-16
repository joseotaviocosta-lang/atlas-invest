import { Inject, Injectable } from '@nestjs/common';
import { Transaction, LocalDate } from '@atlas/domain';
import {
  ITransactionRepository,
  IPortfolioRepository,
  EntityNotFoundError,
  TransactionLedgerFilter,
  PaginationOptions,
} from '@atlas/database';
import { TRANSACTION_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

export interface ListTransactionsQuery {
  portfolioId: string;
  accountId?: string;
  assetId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(query: ListTransactionsQuery): Promise<Transaction[]> {
    const portfolio = await this.portfolioRepository.findById(query.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', query.portfolioId);
    }

    const filter: TransactionLedgerFilter = {
      accountId: query.accountId,
      assetId: query.assetId,
      type: query.type,
      startDate: query.startDate ? LocalDate.from(query.startDate) : undefined,
      endDate: query.endDate ? LocalDate.from(query.endDate) : undefined,
    };

    const pagination: PaginationOptions = {
      cursor: query.cursor,
      limit: query.limit,
    };

    return this.transactionRepository.findByPortfolioId(query.portfolioId, filter, pagination);
  }
}
