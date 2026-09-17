import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';
import { PORTFOLIO_REPOSITORY, TRANSACTION_REPOSITORY } from '../../database/tokens';
import { PortfolioStateReadModel } from './read-models';
import { PortfolioReadModelMapper } from './mappers/portfolio-read-model.mapper';

export interface GetPortfolioStateParams {
  portfolioId: string;
  userId: string;
  asOfDate?: string;
}

@Injectable()
export class GetPortfolioStateUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
  ) {}

  async execute(params: GetPortfolioStateParams): Promise<PortfolioStateReadModel> {
    // 1. Ownership validation
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. asOfDate validation
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

    // 3. Load transactions up to asOf date
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: asOfLocalDate,
    });

    // 4. Deterministic replay
    try {
      const result = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
        asOfDate: asOfLocalDate,
      });

      // 5. Map to pure Application Read Model
      return PortfolioReadModelMapper.toStateReadModel(
        result,
        params.portfolioId,
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
