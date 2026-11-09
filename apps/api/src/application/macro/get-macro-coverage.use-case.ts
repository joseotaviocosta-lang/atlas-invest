import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { MacroSeriesId, MacroCoverage } from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { MACRO_REPOSITORY } from '../../database/tokens';

export interface GetMacroCoverageParams {
  seriesId: string;
}

@Injectable()
export class GetMacroCoverageUseCase {
  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(params: GetMacroCoverageParams): Promise<MacroCoverage> {
    const sId = params.seriesId.trim().toUpperCase() as MacroSeriesId;
    if (sId !== 'IPCA' && sId !== 'SELIC_TARGET' && sId !== 'SELIC_EFFECTIVE' && sId !== 'PTAX') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_MACRO_SERIES',
        message: `Unsupported macro series '${params.seriesId}'. Must be IPCA, SELIC_TARGET, SELIC_EFFECTIVE, or PTAX.`,
      });
    }

    const cov = await this.macroRepository.getCoverage(sId);
    return {
      seriesId: sId,
      count: cov.count,
      minReferenceDate: cov.minReferenceDate ? cov.minReferenceDate.toString() : '',
      maxReferenceDate: cov.maxReferenceDate ? cov.maxReferenceDate.toString() : '',
      latestPublishedAt: cov.latestPublishedAt ? cov.latestPublishedAt.toISOString() : undefined,
      source: cov.source ?? 'BCB_SGS',
      frequency: (cov.frequency as never) ?? 'DAILY',
    };
  }
}
