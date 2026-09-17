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
import { PortfolioPositionsReadModel } from './read-models';
import { PortfolioReadModelMapper } from './mappers/portfolio-read-model.mapper';

export interface GetPortfolioPositionsParams {
  portfolioId: string;
  userId: string;
  accountId?: string;
  asOfDate?: string;
}

@Injectable()
export class GetPortfolioPositionsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(params: GetPortfolioPositionsParams): Promise<PortfolioPositionsReadModel> {
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

    // 3. asOfDate validation
    let asOfLocalDate: LocalDate | undefined;
    if (params.asOfDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)) {
        throw new BadRequestException({
          message: `Invalid asOf date format: '${params.asOfDate}'. Expected format: YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_AS_OF_DATE',
        });
      }
      try {
        asOfLocalDate = LocalDate.from(params.asOfDate);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil calendar date '${params.asOfDate}'`,
          code: 'PORTFOLIO.INVALID_AS_OF_DATE',
        });
      }
    }

    // 4. Load transactions up to asOf date
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: asOfLocalDate,
    });

    // 5. Deterministic replay
    try {
      const result = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
        asOfDate: asOfLocalDate,
      });

      // 6. Map to pure Application Positions Read Model
      return PortfolioReadModelMapper.toPositionsReadModel(
        result,
        params.portfolioId,
        params.accountId,
        asOfLocalDate ? asOfLocalDate.toString() : null,
      );
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
