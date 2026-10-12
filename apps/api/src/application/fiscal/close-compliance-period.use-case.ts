import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { ITaxPeriodCloseRepository } from '@atlas/database';
import { TAX_PERIOD_CLOSE_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import {
  GetPeriodCloseReadinessUseCase,
  type PeriodCloseSnapshotInput,
} from './get-period-close-readiness.use-case';

export interface CloseCompliancePeriodResult {
  readonly record: {
    readonly id: string;
    readonly scope: string;
    readonly period: string;
    readonly calendarYear: number;
    readonly month: string | null;
    readonly exercise: number | null;
    readonly revision: number;
    readonly recordStatus: string;
    readonly statusAtClose: string | null;
    readonly closeMode: string | null;
    readonly sourceFingerprint: string;
    readonly binderFingerprint: string;
    readonly closedAt: string | null;
    readonly createdAt: string;
  };
  readonly created: boolean;
  readonly readiness: string;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Records an operational period close. Clean close only: allowed exactly
 * when readiness is READY_TO_CLOSE or NO_ACTIVITY. Any material
 * BLOCKED/PARTIAL/REQUIRES_REVIEW/STALE state fails closed with 422 —
 * never a silent clean close, never an exceptional close.
 */
@Injectable()
export class CloseCompliancePeriodUseCase {
  constructor(
    @Inject(GetPeriodCloseReadinessUseCase)
    private readonly readinessUseCase: GetPeriodCloseReadinessUseCase,
    @Inject(TAX_PERIOD_CLOSE_REPOSITORY)
    private readonly closeRepository: ITaxPeriodCloseRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: PeriodCloseSnapshotInput): Promise<CloseCompliancePeriodResult> {
    const snapshot = await this.readinessUseCase.executeSnapshot(input);
    const { readiness, binder } = snapshot;

    if (!readiness.cleanCloseAllowed) {
      throw new UnprocessableEntityException({
        code: 'PERIOD_CLOSE.NOT_READY',
        message: `Period ${readiness.scope} ${readiness.period} is ${readiness.readiness}; clean close is not allowed.`,
        readiness: readiness.readiness,
        unresolvedCount: readiness.unresolvedItems.length,
      });
    }

    const today = this.clock.today();
    const { outcome, record } = await this.closeRepository.recordClose({
      taxSubjectId: input.taxSubjectId,
      scope: input.scope,
      period: readiness.period,
      calendarYear: readiness.calendarYear,
      month: readiness.month,
      exercise: readiness.exercise,
      statusAtClose: readiness.readiness,
      closeMode: 'CLEAN',
      sourceFingerprint: readiness.sourceFingerprint,
      binderFingerprint: binder.binderFingerprint,
      closedAt: new Date(`${today}T00:00:00.000Z`),
    });

    return Object.freeze({
      record: Object.freeze({
        id: record.id,
        scope: record.scope,
        period: record.period,
        calendarYear: record.calendarYear,
        month: record.month,
        exercise: record.exercise,
        revision: record.revision,
        recordStatus: record.recordStatus,
        statusAtClose: record.statusAtClose,
        closeMode: record.closeMode,
        sourceFingerprint: record.sourceFingerprint,
        binderFingerprint: record.binderFingerprint,
        closedAt: toIso(record.closedAt),
        createdAt: record.createdAt.toISOString(),
      }),
      created: outcome === 'CREATED',
      readiness: readiness.readiness,
    });
  }
}
