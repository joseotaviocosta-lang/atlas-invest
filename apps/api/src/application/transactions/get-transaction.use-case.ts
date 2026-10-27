import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@atlas/domain';
import {
  ITransactionRepository,
  ITransactionRectificationRepository,
  IPortfolioRepository,
  EntityNotFoundError,
} from '@atlas/database';
import {
  TRANSACTION_REPOSITORY,
  TRANSACTION_RECTIFICATION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import type { RectificationChainView } from './transaction-rectification.view';
import { buildRectificationChain } from './transaction-rectification.view';

export interface TransactionDetailResult {
  transaction: Transaction;
  rectification: RectificationChainView | null;
}

@Injectable()
export class GetTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(TRANSACTION_RECTIFICATION_REPOSITORY)
    private readonly rectifications: ITransactionRectificationRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(transactionId: string, userId?: string): Promise<TransactionDetailResult> {
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

    const chain = await buildRectificationChain(
      { rectifications: this.rectifications },
      transaction.portfolioId,
      transaction.id,
    );
    return {
      transaction,
      rectification: chain.chain.length > 1 || chain.status !== 'CURRENT' ? chain : null,
    };
  }
}
