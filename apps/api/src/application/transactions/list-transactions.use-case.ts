import { Inject, Injectable } from '@nestjs/common';
import { Transaction, LocalDate } from '@atlas/domain';
import {
  ITransactionRepository,
  IPortfolioRepository,
  EntityNotFoundError,
  TransactionLedgerFilter,
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

export interface PaginatedTransactionsResult {
  items: Transaction[];
  limit: number;
  cursor?: string;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(query: ListTransactionsQuery): Promise<PaginatedTransactionsResult> {
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

    const limit = query.limit ?? 50;
    // Request limit + 1 to check if there are subsequent items
    const rawItems = await this.transactionRepository.findByPortfolioId(query.portfolioId, filter, {
      cursor: query.cursor,
      skip: query.cursor ? 1 : 0,
      limit: limit + 1,
    });

    const hasMore = rawItems.length > limit;
    const items = hasMore ? rawItems.slice(0, limit) : rawItems;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return {
      items,
      limit,
      cursor: query.cursor,
      nextCursor,
      hasMore,
    };
  }
}
