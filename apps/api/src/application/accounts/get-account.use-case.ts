import { Inject, Injectable } from '@nestjs/common';
import { Account } from '@atlas/domain';
import { IAccountRepository, IPortfolioRepository, EntityNotFoundError } from '@atlas/database';
import { ACCOUNT_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(accountId: string, userId?: string): Promise<Account> {
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new EntityNotFoundError('Account', accountId);
    }
    if (userId) {
      const portfolio = await this.portfolioRepository.findById(account.portfolioId);
      if (!portfolio || portfolio.userId !== userId) {
        throw new EntityNotFoundError('Account', accountId);
      }
    }
    return account;
  }
}
