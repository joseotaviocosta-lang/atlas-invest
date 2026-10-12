import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ITaxPeriodCloseRepository } from '@atlas/database';
import { TAX_PERIOD_CLOSE_REPOSITORY } from '../../database/tokens';

export interface ReopenCompliancePeriodResult {
  readonly record: {
    readonly id: string;
    readonly scope: string;
    readonly period: string;
    readonly revision: number;
    readonly recordStatus: string;
    readonly sourceFingerprint: string;
    readonly binderFingerprint: string;
    readonly reason: string | null;
    readonly createdAt: string;
  };
  readonly created: boolean;
}

/**
 * Reopens a closed period. History is append-only: a REOPENED revision is
 * appended, the prior CLOSED row is never mutated. Only the latest record
 * of a (subject, scope, period) can be reopened, and only when it is
 * CLOSED. Foreign records resolve to 404 (anti-enumeration).
 */
@Injectable()
export class ReopenCompliancePeriodUseCase {
  constructor(
    @Inject(TAX_PERIOD_CLOSE_REPOSITORY)
    private readonly closeRepository: ITaxPeriodCloseRepository,
  ) {}

  async execute(input: {
    taxSubjectId: string;
    closeId: string;
    reason: string;
  }): Promise<ReopenCompliancePeriodResult> {
    const target = await this.closeRepository.findById(input.closeId, input.taxSubjectId);
    if (!target) {
      throw new NotFoundException(`Period close '${input.closeId}' was not found.`);
    }
    const latest = await this.closeRepository.findLatest({
      taxSubjectId: input.taxSubjectId,
      scope: target.scope,
      period: target.period,
    });
    if (!latest || latest.id !== target.id || latest.recordStatus !== 'CLOSED') {
      throw new UnprocessableEntityException({
        code: 'PERIOD_CLOSE.NOT_REOPENABLE',
        message: 'Only the latest CLOSED record of a period can be reopened.',
      });
    }

    const { outcome, record } = await this.closeRepository.recordReopen({
      taxSubjectId: input.taxSubjectId,
      scope: target.scope,
      period: target.period,
      reason: input.reason.trim().slice(0, 280),
    });

    return Object.freeze({
      record: Object.freeze({
        id: record.id,
        scope: record.scope,
        period: record.period,
        revision: record.revision,
        recordStatus: record.recordStatus,
        sourceFingerprint: record.sourceFingerprint,
        binderFingerprint: record.binderFingerprint,
        reason: record.reason,
        createdAt: record.createdAt.toISOString(),
      }),
      created: outcome === 'REOPENED',
    });
  }
}
