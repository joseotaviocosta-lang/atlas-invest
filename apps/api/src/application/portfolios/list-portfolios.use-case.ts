import { Inject, Injectable } from '@nestjs/common';
import { Portfolio } from '@atlas/domain';
import { IPortfolioRepository } from '@atlas/database';
import { PORTFOLIO_REPOSITORY } from '../../database/tokens';

export interface ListPortfoliosQuery {
  userId: string;
}

@Injectable()
export class ListPortfoliosUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(query: ListPortfoliosQuery): Promise<Portfolio[]> {
    return this.portfolioRepository.findByUserId(query.userId);
  }
}
