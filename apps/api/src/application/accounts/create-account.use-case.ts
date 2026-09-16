import { Inject, Injectable } from '@nestjs/common';
import { Account, AccountStatus } from '@atlas/domain';
import {
  IAccountRepository,
  IPortfolioRepository,
  IInstitutionRepository,
  EntityNotFoundError,
} from '@atlas/database';
import {
  ACCOUNT_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  INSTITUTION_REPOSITORY,
} from '../../database/tokens';

export interface CreateAccountCommand {
  portfolioId: string;
  institutionId: string;
  name: string;
  currency: string;
  status?: AccountStatus;
}

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
  ) {}

  async execute(command: CreateAccountCommand): Promise<Account> {
    const portfolio = await this.portfolioRepository.findById(command.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', command.portfolioId);
    }

    const institution = await this.institutionRepository.findById(command.institutionId);
    if (!institution) {
      throw new EntityNotFoundError('Institution', command.institutionId);
    }

    const account = Account.create({
      portfolioId: command.portfolioId,
      institutionId: command.institutionId,
      name: command.name,
      currency: command.currency,
      status: command.status,
    });

    return this.accountRepository.create(account);
  }
}
