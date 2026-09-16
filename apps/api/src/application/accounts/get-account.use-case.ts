import { Inject, Injectable } from '@nestjs/common';
import { Account } from '@atlas/domain';
import { IAccountRepository, EntityNotFoundError } from '@atlas/database';
import { ACCOUNT_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(accountId: string): Promise<Account> {
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new EntityNotFoundError('Account', accountId);
    }
    return account;
  }
}
