import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Quantity } from '@atlas/domain';
import { MacroSeriesId, MacroObservation } from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { MACRO_REPOSITORY } from '../../database/tokens';

export interface GetMacroLatestParams {
  seriesId: string;
}

@Injectable()
export class GetMacroLatestUseCase {
  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(params: GetMacroLatestParams): Promise<MacroObservation> {
    const sId = params.seriesId.trim().toUpperCase() as MacroSeriesId;
    if (sId !== 'IPCA' && sId !== 'SELIC_TARGET' && sId !== 'SELIC_EFFECTIVE' && sId !== 'PTAX') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_MACRO_SERIES',
        message: `Unsupported macro series '${params.seriesId}'. Must be IPCA, SELIC_TARGET, SELIC_EFFECTIVE, or PTAX.`,
      });
    }

    const obs = await this.macroRepository.findLatest(sId);
    if (!obs) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: 'MACRO.NOT_FOUND',
        message: `No observations found for macro series '${sId}'`,
      });
    }

    return {
      id: obs.id,
      seriesId: obs.seriesId as MacroSeriesId,
      referenceDate: obs.referenceDate,
      value: Quantity.from(obs.value),
      unit: obs.unit as never,
      frequency: obs.frequency as never,
      source: obs.source,
      publishedAt: obs.publishedAt ?? undefined,
      firstFetchedAt: obs.firstFetchedAt,
      lastFetchedAt: obs.lastFetchedAt,
      fetchCount: obs.fetchCount,
      revisedAt: obs.revisedAt ?? undefined,
      createdAt: obs.createdAt,
      updatedAt: obs.updatedAt,
    };
  }
}
