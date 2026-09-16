import { Inject, Injectable } from '@nestjs/common';
import { Account } from '@atlas/domain';
import { IAccountRepository, IPortfolioRepository, EntityNotFoundError } from '@atlas/database';
import { ACCOUNT_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(portfolioId: string, userId?: string): Promise<Account[]> {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    if (userId && portfolio.userId !== userId) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    return this.accountRepository.findByPortfolioId(portfolioId);
  }
}
