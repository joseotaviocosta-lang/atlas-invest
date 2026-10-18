import { Inject, Injectable } from '@nestjs/common';
import { Currency, assertValidCurrency } from '@atlas/domain';
import { IFxObservationRepository } from '@atlas/database';
import { FX_OBSERVATION_REPOSITORY } from '../../database/tokens';

export interface FxCoverageResponse {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  totalObservations: number;
  firstObservationDate: string | null;
  lastObservationDate: string | null;
}

@Injectable()
export class GetFxCoverageUseCase {
  constructor(
    @Inject(FX_OBSERVATION_REPOSITORY)
    private readonly repository: IFxObservationRepository,
  ) {}

  async execute(base: string, quote: string): Promise<FxCoverageResponse> {
    const baseCurrency = assertValidCurrency(base);
    const quoteCurrency = assertValidCurrency(quote);

    const coverage = await this.repository.getCoverage(baseCurrency, quoteCurrency);

    return {
      baseCurrency,
      quoteCurrency,
      totalObservations: coverage.totalObservations,
      firstObservationDate: coverage.firstObservationDate
        ? coverage.firstObservationDate.toString()
        : null,
      lastObservationDate: coverage.lastObservationDate
        ? coverage.lastObservationDate.toString()
        : null,
    };
  }
}
