import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IOfficialDarfGenerationRepository } from '@atlas/database';
import { OFFICIAL_DARF_GENERATION_REPOSITORY } from '../../database/tokens';
import {
  mapDarfRecordToReadModel,
  type DarfGenerationRecordReadModel,
} from './darf-generation.read-model';

/** Phase 4F — reads a single persisted DARF generation/handoff record (anti-enumeration 404). */
@Injectable()
export class GetDarfGenerationUseCase {
  constructor(
    @Inject(OFFICIAL_DARF_GENERATION_REPOSITORY)
    private readonly repository: IOfficialDarfGenerationRepository,
  ) {}

  async execute(params: { userId: string; id: string }): Promise<DarfGenerationRecordReadModel> {
    const row = await this.repository.findById(params.id, params.userId);
    if (!row) {
      throw new NotFoundException({
        message: `DARF generation record '${params.id}' not found`,
        code: 'DARF_GENERATION.NOT_FOUND',
      });
    }
    return mapDarfRecordToReadModel(row);
  }
}

/** Phase 4F — lists persisted DARF generation/handoff records for the tax subject. */
@Injectable()
export class ListDarfGenerationsUseCase {
  constructor(
    @Inject(OFFICIAL_DARF_GENERATION_REPOSITORY)
    private readonly repository: IOfficialDarfGenerationRepository,
  ) {}

  async execute(params: {
    userId: string;
    status?: string;
    obligationId?: string;
  }): Promise<DarfGenerationRecordReadModel[]> {
    const rows = await this.repository.list(params.userId, {
      ...(params.status ? { status: params.status } : {}),
      ...(params.obligationId ? { obligationId: params.obligationId } : {}),
    });
    return rows.map((row) => mapDarfRecordToReadModel(row));
  }
}
