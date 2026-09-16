import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@atlas/domain';
import { ITransactionRepository, IPortfolioRepository, EntityNotFoundError } from '@atlas/database';
import { TRANSACTION_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(transactionId: string, userId?: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new EntityNotFoundError('Transaction', transactionId);
    }

    if (userId) {
      const portfolio = await this.portfolioRepository.findById(transaction.portfolioId);
      if (!portfolio || portfolio.userId !== userId) {
        throw new EntityNotFoundError('Transaction', transactionId);
      }
    }

    return transaction;
  }
}
