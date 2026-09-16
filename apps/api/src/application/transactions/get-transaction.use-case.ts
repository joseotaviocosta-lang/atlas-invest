import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@atlas/domain';
import { ITransactionRepository, EntityNotFoundError } from '@atlas/database';
import { TRANSACTION_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
  ) {}

  async execute(transactionId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new EntityNotFoundError('Transaction', transactionId);
    }
    return transaction;
  }
}
