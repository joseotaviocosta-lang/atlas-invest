import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IAnnualOpeningPositionRepository, IPortfolioRepository } from '@atlas/database';
import { ANNUAL_OPENING_POSITION_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import {
  AnnualOpeningPositionReadModel,
  mapAnnualOpeningPositionToReadModel,
} from './annual-opening-position.read-model';

export interface ListAnnualOpeningPositionsQuery {
  readonly taxSubjectId: string;
  readonly portfolioId?: string;
  readonly status?: string;
}

@Injectable()
export class ListAnnualOpeningPositionsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ANNUAL_OPENING_POSITION_REPOSITORY)
    private readonly openingPositionRepository: IAnnualOpeningPositionRepository,
  ) {}

  async execute(
    query: ListAnnualOpeningPositionsQuery,
  ): Promise<readonly AnnualOpeningPositionReadModel[]> {
    if (query.portfolioId) {
      const portfolio = await this.portfolioRepository.findByIdAndUserId(
        query.portfolioId,
        query.taxSubjectId,
      );
      if (!portfolio) {
        throw new NotFoundException(`Portfolio ${query.portfolioId} not found.`);
      }

      const rows = await this.openingPositionRepository.listByPortfolio({
        taxSubjectId: query.taxSubjectId,
        portfolioId: query.portfolioId,
        status: query.status,
      });

      return rows.map(mapAnnualOpeningPositionToReadModel);
    }

    const rows = await this.openingPositionRepository.listBySubject({
      taxSubjectId: query.taxSubjectId,
      status: query.status,
    });

    return rows.map(mapAnnualOpeningPositionToReadModel);
  }
}
