import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxPeriodCloseRepository,
  TaxPeriodCloseRow,
  TaxPeriodCloseWriteInput,
  TaxPeriodReopenInput,
  TaxPeriodCloseWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaCloseRow = {
  id: string;
  taxSubjectId: string;
  scope: string;
  period: string;
  calendarYear: number;
  month: string | null;
  exercise: number | null;
  revision: number;
  recordStatus: string;
  statusAtClose: string | null;
  closeMode: string | null;
  sourceFingerprint: string;
  binderFingerprint: string;
  reason: string | null;
  closedAt: Date | null;
  createdAt: Date;
};

export class TaxPeriodCloseRepository implements ITaxPeriodCloseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaCloseRow): TaxPeriodCloseRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
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
      closedAt: row.closedAt,
      createdAt: row.createdAt,
    };
  }

  async findLatest(input: {
    taxSubjectId: string;
    scope: string;
    period: string;
  }): Promise<TaxPeriodCloseRow | null> {
    try {
      const row = await this.prisma.taxCompliancePeriodCloseRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period: input.period,
        },
        orderBy: { revision: 'desc' },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find latest period close for ${input.scope} ${input.period}`,
      );
    }
  }

  async findById(id: string, taxSubjectId: string): Promise<TaxPeriodCloseRow | null> {
    try {
      const row = await this.prisma.taxCompliancePeriodCloseRecord.findFirst({
        where: { id, taxSubjectId },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find period close by id ${id}`);
    }
  }

  async findClosedByFingerprints(input: {
    taxSubjectId: string;
    scope: string;
    period: string;
    sourceFingerprint: string;
    binderFingerprint: string;
  }): Promise<TaxPeriodCloseRow | null> {
    try {
      const row = await this.prisma.taxCompliancePeriodCloseRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period: input.period,
          recordStatus: 'CLOSED',
          sourceFingerprint: input.sourceFingerprint,
          binderFingerprint: input.binderFingerprint,
        },
        orderBy: { revision: 'asc' },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find period close by fingerprints for ${input.scope} ${input.period}`,
      );
    }
  }

  async listHistory(input: {
    taxSubjectId: string;
    scope?: string;
    period?: string;
    limit: number;
    offset: number;
  }): Promise<TaxPeriodCloseRow[]> {
    try {
      const rows = await this.prisma.taxCompliancePeriodCloseRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.period ? { period: input.period } : {}),
        },
        // Frozen deterministic order: scope ASC, period DESC, revision DESC.
        orderBy: [{ scope: 'asc' }, { period: 'desc' }, { revision: 'desc' }],
        take: input.limit,
        skip: input.offset,
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list period close history for subject ${input.taxSubjectId}`,
      );
    }
  }

  async countHistory(input: {
    taxSubjectId: string;
    scope?: string;
    period?: string;
  }): Promise<number> {
    try {
      return await this.prisma.taxCompliancePeriodCloseRecord.count({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.period ? { period: input.period } : {}),
        },
      });
    } catch {
      throw new PersistenceError(
        `Failed to count period close history for subject ${input.taxSubjectId}`,
      );
    }
  }

  /**
   * Records a CLOSED revision. Semantically idempotent with one principled
   * exception:
   *
   * - Latest record is CLOSED: a preserved CLOSED row with identical
   *   (sourceFingerprint, binderFingerprint) ANYWHERE in history converges
   *   to IDEMPOTENT — never a duplicate semantic close, even when mixed
   *   snapshots race for adjacent revision slots.
   * - Latest record is REOPENED: the prior close was explicitly voided, so a
   *   reclose is a NEW decision and always appends a fresh revision (a
   *   second identical reclose then converges via the rule above).
   *
   * The (subject, scope, period, revision) unique constraint is the
   * concurrency barrier; P2002 losers re-resolve and converge.
   */
  async recordClose(
    input: TaxPeriodCloseWriteInput,
  ): Promise<{ outcome: 'CREATED' | 'IDEMPOTENT'; record: TaxPeriodCloseRow }> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const current = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period: input.period,
        });
        if (current && current.recordStatus === 'CLOSED') {
          const settled = await this.findClosedByFingerprints({
            taxSubjectId: input.taxSubjectId,
            scope: input.scope,
            period: input.period,
            sourceFingerprint: input.sourceFingerprint,
            binderFingerprint: input.binderFingerprint,
          });
          if (settled) {
            return { outcome: 'IDEMPOTENT', record: settled };
          }
        }
        const nextRevision = current ? current.revision + 1 : 1;
        const created = await this.prisma.taxCompliancePeriodCloseRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            scope: input.scope,
            period: input.period,
            calendarYear: input.calendarYear,
            month: input.month ?? null,
            exercise: input.exercise ?? null,
            revision: nextRevision,
            recordStatus: 'CLOSED',
            statusAtClose: input.statusAtClose ?? null,
            closeMode: input.closeMode ?? 'CLEAN',
            sourceFingerprint: input.sourceFingerprint,
            binderFingerprint: input.binderFingerprint,
            reason: null,
            closedAt:
              typeof input.closedAt === 'string'
                ? new Date(input.closedAt)
                : (input.closedAt ?? new Date()),
          },
        });
        return { outcome: 'CREATED', record: this.map(created) };
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
            continue;
          }
        }
        if (err instanceof PersistenceError) {
          throw err;
        }
        throw new PersistenceError(
          `Failed to record period close for ${input.scope} ${input.period}`,
        );
      }
    }
    throw new PersistenceError(`Failed to record period close for ${input.scope} ${input.period}`);
  }

  /**
   * Records a REOPENED revision. History is append-only: the prior CLOSED
   * row is never mutated. Concurrent reopens converge to a single new
   * revision via the same unique-constraint barrier.
   */
  async recordReopen(
    input: TaxPeriodReopenInput,
  ): Promise<{ outcome: TaxPeriodCloseWriteOutcome; record: TaxPeriodCloseRow }> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const current = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period: input.period,
        });
        if (!current || current.recordStatus !== 'CLOSED') {
          throw new PersistenceError(
            `No closed period to reopen for ${input.scope} ${input.period}`,
          );
        }
        const created = await this.prisma.taxCompliancePeriodCloseRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            scope: input.scope,
            period: input.period,
            calendarYear: current.calendarYear,
            month: current.month,
            exercise: current.exercise,
            revision: current.revision + 1,
            recordStatus: 'REOPENED',
            statusAtClose: null,
            closeMode: null,
            sourceFingerprint: current.sourceFingerprint,
            binderFingerprint: current.binderFingerprint,
            reason: input.reason,
            closedAt: null,
          },
        });
        return { outcome: 'REOPENED', record: this.map(created) };
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // A concurrent reopen won the next revision slot: converge to it.
          const current = await this.findLatest({
            taxSubjectId: input.taxSubjectId,
            scope: input.scope,
            period: input.period,
          });
          if (current && current.recordStatus === 'REOPENED') {
            return { outcome: 'IDEMPOTENT', record: current };
          }
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
            continue;
          }
        }
        if (err instanceof PersistenceError) {
          throw err;
        }
        throw new PersistenceError(`Failed to reopen period ${input.scope} ${input.period}`);
      }
    }
    throw new PersistenceError(`Failed to reopen period ${input.scope} ${input.period}`);
  }
}
