import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAccountRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ACCOUNT_REPOSITORY,
} from '../../database/tokens';
import { PortfolioHistoryReadModel } from './read-models';
import { PortfolioReadModelMapper } from './mappers/portfolio-read-model.mapper';

export interface GetPortfolioHistoryParams {
  portfolioId: string;
  userId: string;
  type?: 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
  from?: string;
  to?: string;
  accountId?: string;
  assetId?: string;
  cursor?: string;
  limit?: number;
}

const VALID_HISTORY_TYPES = new Set([
  'realized',
  'income',
  'cash-flow',
  'corporate-action',
  'transfer',
]);

@Injectable()
export class GetPortfolioHistoryUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(params: GetPortfolioHistoryParams): Promise<PortfolioHistoryReadModel> {
    // 1. Ownership validation
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. Account scope validation (if specified, account must belong to target portfolio)
    if (params.accountId) {
      const account = await this.accountRepository.findById(params.accountId);
      if (!account || account.portfolioId !== params.portfolioId) {
        throw new NotFoundException({
          message: `Account with id '${params.accountId}' not found in portfolio '${params.portfolioId}'`,
          code: 'PORTFOLIO.INVALID_ACCOUNT_SCOPE',
        });
      }
    }

    // 3. Type validation
    if (params.type && !VALID_HISTORY_TYPES.has(params.type)) {
      throw new BadRequestException({
        message: `Invalid history type '${params.type}'. Valid types: ${Array.from(VALID_HISTORY_TYPES).join(', ')}`,
        code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
      });
    }

    // 4. Date validation
    let fromLocalDate: LocalDate | undefined;
    if (params.from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
        throw new BadRequestException({
          message: `Invalid 'from' date format: '${params.from}'. Expected format: YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        fromLocalDate = LocalDate.from(params.from);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil calendar date '${params.from}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    }

    let toLocalDate: LocalDate | undefined;
    if (params.to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
        throw new BadRequestException({
          message: `Invalid 'to' date format: '${params.to}'. Expected format: YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        toLocalDate = LocalDate.from(params.to);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil calendar date '${params.to}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    }

    if (fromLocalDate && toLocalDate && fromLocalDate.compare(toLocalDate) > 0) {
      throw new BadRequestException({
        message: `Invalid date range: 'from' date (${params.from}) must be less than or equal to 'to' date (${params.to})`,
        code: 'PORTFOLIO.INVALID_DATE_RANGE',
      });
    }

    // 5. Load transactions (optimizing with endDate if 'to' is specified)
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: toLocalDate,
    });

    // 6. Deterministic replay
    try {
      const result = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
        asOfDate: toLocalDate,
      });

      // 7. Map and filter to pure Application History Read Model
      return PortfolioReadModelMapper.toHistoryReadModel(result, {
        type: params.type,
        from: fromLocalDate ? fromLocalDate.toString() : undefined,
        to: toLocalDate ? toLocalDate.toString() : undefined,
        accountId: params.accountId,
        assetId: params.assetId,
        cursor: params.cursor,
        limit: params.limit,
      });
    } catch (err: unknown) {
      if (err instanceof PortfolioReplayError) {
        throw new UnprocessableEntityException({
          message: err.message,
          code: 'PORTFOLIO.REPLAY_FAILED',
        });
      }
      throw err;
    }
  }
}
