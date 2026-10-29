import {
  Inject,
  Injectable,
  Optional,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio, PortfolioReplayError, NegativePositionError } from '@atlas/portfolio-engine';
import { PORTFOLIO_REPOSITORY, TRANSACTION_REPOSITORY, ASSET_REPOSITORY } from '../../database/tokens';
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
    @Optional()
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository?: IAssetRepository,
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
      if (err instanceof NegativePositionError) {
        let ticker = err.assetId;
        try {
          if (this.assetRepository) {
            const asset = await this.assetRepository.findById(err.assetId);
            if (asset?.ticker) ticker = asset.ticker;
          }
        } catch {
          // fallback to assetId
        }
        const dateStr = err.tradeDate ?? '';
        const formattedDate = dateStr.includes('-')
          ? dateStr.split('-').reverse().join('/')
          : dateStr;
        const formattedDatePart = formattedDate ? ` em ${formattedDate}` : '';
        const userMessage = `Venda de ${err.attemptedDeduction} ${ticker}${formattedDatePart} sem posição anterior registrada.`;

        throw new UnprocessableEntityException({
          message: userMessage,
          code: 'PORTFOLIO.REPLAY_FAILED',
          details: {
            reason: 'NEGATIVE_POSITION',
            assetId: err.assetId,
            ticker,
            accountId: err.accountId,
            currentQuantity: err.currentQuantity,
            attemptedDeduction: err.attemptedDeduction,
            resultingQuantity: err.resultingQuantity,
            transactionId: err.transactionId,
            tradeDate: err.tradeDate,
          },
        });
      }
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
