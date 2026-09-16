import { Inject, Injectable } from '@nestjs/common';
import { Portfolio, PortfolioType, PortfolioStatus } from '@atlas/domain';
import { IPortfolioRepository } from '@atlas/database';
import { PORTFOLIO_REPOSITORY } from '../../database/tokens';

export interface CreatePortfolioCommand {
  userId: string;
  name: string;
  baseCurrency: string;
  type?: PortfolioType;
  status?: PortfolioStatus;
}

@Injectable()
export class CreatePortfolioUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(command: CreatePortfolioCommand): Promise<Portfolio> {
    const portfolio = Portfolio.create({
      userId: command.userId,
      name: command.name,
      baseCurrency: command.baseCurrency,
      type: command.type,
      status: command.status,
    });

    return this.portfolioRepository.create(portfolio);
  }
}
