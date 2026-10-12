import { Inject, Injectable } from '@nestjs/common';
import type { ITaxPeriodCloseRepository } from '@atlas/database';
import { TAX_PERIOD_CLOSE_REPOSITORY } from '../../database/tokens';

export interface PeriodCloseHistoryEntry {
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
  readonly reason: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
}

export interface ListPeriodCloseHistoryResult {
  readonly entries: readonly PeriodCloseHistoryEntry[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Bounded, deterministically ordered close history (scope ASC, period
 * DESC, revision DESC). Principal-scoped; no cross-subject leakage.
 */
@Injectable()
export class ListPeriodCloseHistoryUseCase {
  constructor(
    @Inject(TAX_PERIOD_CLOSE_REPOSITORY)
    private readonly closeRepository: ITaxPeriodCloseRepository,
  ) {}

  async execute(input: {
    taxSubjectId: string;
    scope?: string;
    period?: string;
    limit: number;
    offset: number;
  }): Promise<ListPeriodCloseHistoryResult> {
    const [rows, totalCount] = await Promise.all([
      this.closeRepository.listHistory({
        taxSubjectId: input.taxSubjectId,
        scope: input.scope,
        period: input.period,
        limit: input.limit,
        offset: input.offset,
      }),
      this.closeRepository.countHistory({
        taxSubjectId: input.taxSubjectId,
        scope: input.scope,
        period: input.period,
      }),
    ]);
    const entries = rows.map((row) =>
      Object.freeze({
        id: row.id,
        scope: row.scope,
        period: row.period,
        calendarYear: row.calendarYear,
        month: row.month,
        exercise: row.exercise,
        revision: row.revision,
        recordStatus: row.recordStatus,
        statusAtClose: row.statusAtClose,
        closeMode: row.closeMode,
        sourceFingerprint: row.sourceFingerprint,
        binderFingerprint: row.binderFingerprint,
        reason: row.reason,
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      }),
    );
    return Object.freeze({
      entries: Object.freeze(entries),
      totalCount,
      limit: input.limit,
      offset: input.offset,
    });
  }
}
