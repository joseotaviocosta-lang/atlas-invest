import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import { MacroSeriesId, BcbMacroDataProvider, IMacroDataProvider } from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { MACRO_REPOSITORY } from '../../database/tokens';

export interface UpdateMacroDataParams {
  seriesId: string;
  from: string;
  to: string;
  providerOverride?: 'BCB' | 'IN_MEMORY';
  inMemoryProvider?: IMacroDataProvider;
}

export interface UpdateMacroDataReceipt {
  seriesId: MacroSeriesId;
  requestedRange: { from: string; to: string };
  fetched: number;
  inserted: number;
  unchanged: number;
  revised: number;
  failures: number;
}

@Injectable()
export class UpdateMacroDataUseCase {
  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(params: UpdateMacroDataParams): Promise<UpdateMacroDataReceipt> {
    const sId = params.seriesId.trim().toUpperCase() as MacroSeriesId;
    if (sId !== 'IPCA' && sId !== 'SELIC_TARGET' && sId !== 'SELIC_EFFECTIVE' && sId !== 'PTAX') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_MACRO_SERIES',
        message: `Unsupported macro series '${params.seriesId}'. Must be IPCA, SELIC_TARGET, SELIC_EFFECTIVE, or PTAX.`,
      });
    }

    let fromDate: LocalDate;
    let toDate: LocalDate;
    try {
      fromDate = LocalDate.from(params.from);
      toDate = LocalDate.from(params.to);
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_DATE_FORMAT',
        message: 'from and to must be valid dates in YYYY-MM-DD format',
      });
    }

    if (fromDate.compare(toDate) > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_DATE_RANGE',
        message: 'from date cannot be after to date',
      });
    }

    // Maximum 10-year range guard to prevent unbound upstream requests
    if (toDate.year - fromDate.year > 10) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.RANGE_TOO_LARGE',
        message: 'Date range cannot exceed 10 years per update request',
      });
    }

    const provider: IMacroDataProvider = params.inMemoryProvider ?? new BcbMacroDataProvider();

    const observations = await provider.getObservations(sId, fromDate, toDate);

    let inserted = 0;
    let unchanged = 0;
    let revised = 0;

    for (const obs of observations) {
      const outcome = await this.macroRepository.upsertObservation({
        seriesId: sId,
        referenceDate: obs.referenceDate,
        value: obs.value.toString(),
        unit: obs.unit,
        frequency: obs.frequency,
        source: obs.source,
        publishedAt: obs.publishedAt,
      });

      if (outcome.outcome === 'INSERTED') inserted++;
      else if (outcome.outcome === 'UNCHANGED') unchanged++;
      else if (outcome.outcome === 'REVISED') revised++;
    }

    return {
      seriesId: sId,
      requestedRange: { from: fromDate.toString(), to: toDate.toString() },
      fetched: observations.length,
      inserted,
      unchanged,
      revised,
      failures: 0,
    };
  }
}
