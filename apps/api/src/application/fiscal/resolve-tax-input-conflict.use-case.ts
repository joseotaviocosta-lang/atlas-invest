import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITaxInputRepository, type TaxInputResolutionAction } from '@atlas/database';
import { TAX_INPUT_REPOSITORY } from '../../database/tokens';

export type TaxInputEntity = 'trade-classification' | 'withholding' | 'fii-metadata';

/**
 * Phase 4B.4 — explicit conflict resolution. Original records are retained
 * (previous value kept in provenance history); nothing is silently overwritten
 * (ADR-260). Resolution is a user/application decision, never tax law.
 */
@Injectable()
export class ResolveTaxInputConflictUseCase {
  constructor(@Inject(TAX_INPUT_REPOSITORY) private readonly repository: ITaxInputRepository) {}

  async execute(params: {
    userId: string;
    entity: TaxInputEntity;
    id: string;
    action: TaxInputResolutionAction;
    resolutionSource: string;
  }): Promise<{ id: string; conflictStatus: string }> {
    if (params.action !== 'KEEP_EXISTING' && params.action !== 'ACCEPT_NEW') {
      throw new BadRequestException({
        message: 'Invalid action',
        code: 'TAX_INPUT.INVALID_ACTION',
      });
    }
    const resolutionSource =
      params.resolutionSource && params.resolutionSource.trim().length > 0
        ? params.resolutionSource.trim().slice(0, 255)
        : 'USER_RESOLUTION';
    const input = { action: params.action, resolutionSource, taxSubjectId: params.userId };

    let row: { id: string; conflictStatus: string } | null = null;
    switch (params.entity) {
      case 'trade-classification':
        row = await this.repository.resolveTradeClassification(params.id, input);
        break;
      case 'withholding':
        row = await this.repository.resolveWithholding(params.id, input);
        break;
      case 'fii-metadata':
        row = await this.repository.resolveFiiEligibility(params.id, input);
        break;
      default:
        throw new BadRequestException({
          message: 'Unknown tax input entity',
          code: 'TAX_INPUT.INVALID_ENTITY',
        });
    }
    if (!row) {
      throw new NotFoundException({ message: 'Tax input not found', code: 'TAX_INPUT.NOT_FOUND' });
    }
    return { id: row.id, conflictStatus: row.conflictStatus };
  }
}
