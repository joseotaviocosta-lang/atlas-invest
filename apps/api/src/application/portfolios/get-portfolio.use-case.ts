import { Inject, Injectable } from '@nestjs/common';
import { Portfolio } from '@atlas/domain';
import { IPortfolioRepository, EntityNotFoundError } from '@atlas/database';
import { PORTFOLIO_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetPortfolioUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(portfolioId: string, userId?: string): Promise<Portfolio> {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    if (userId && portfolio.userId !== userId) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    return portfolio;
  }
}
