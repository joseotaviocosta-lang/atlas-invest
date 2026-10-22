import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IIntegrationJobRepository,
  IntegrationJobEnsureInput,
  IntegrationJobRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaJobRow = {
  id: string;
  scheduleId: string;
  portfolioId: string;
  source: string;
  environment: string;
  scheduledFor: Date;
  status: string;
  attempt: number;
  notBeforeAt: Date | null;
  runId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class IntegrationJobRepository implements IIntegrationJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaJobRow): IntegrationJobRow {
    return { ...row };
  }

  async ensure(
    input: IntegrationJobEnsureInput,
  ): Promise<{ row: IntegrationJobRow; created: boolean }> {
    try {
      const row = await this.prisma.integrationJob.create({
        data: {
          id: input.id ?? randomUUID(),
          scheduleId: input.scheduleId,
          portfolioId: input.portfolioId,
          source: input.source,
          environment: input.environment ?? 'SIMULATED',
          scheduledFor: input.scheduledFor,
          status: 'PENDING',
        },
      });
      return { row: this.map(row), created: true };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.integrationJob.findFirst({
          where: { scheduleId: input.scheduleId, scheduledFor: input.scheduledFor },
        });
        if (!existing) {
          throw new PersistenceError(
            `Integration job for schedule ${input.scheduleId} vanished after conflict`,
          );
        }
        return { row: this.map(existing), created: false };
      }
      throw new PersistenceError(
        `Failed to ensure integration job for schedule ${input.scheduleId}`,
      );
    }
  }

  /**
   * Atomically claims one due job: the UPDATE itself decides the winner
   * (no SELECT-then-write gap). Picks the oldest PENDING job whose slot and
   * backoff have passed, or a stale RUNNING job past the lease (crashed
   * worker recovery). Only jobs of currently-enabled schedules are
   * claimable: disabling a schedule cancels future execution (already
   * RUNNING jobs finish; PENDING rows stay unclaimable). Returns null when
   * another worker won the race.
   */
  async claimDue(now: Date, leaseMs: number): Promise<IntegrationJobRow | null> {
    const leaseCutoff = new Date(now.getTime() - leaseMs);
    try {
      const rows = await this.prisma.$queryRaw<PrismaJobRow[]>`
        UPDATE "integration_jobs" AS job
        SET status = 'RUNNING',
            "started_at" = ${now},
            attempt = job.attempt + 1,
            "updated_at" = ${now}
        WHERE job.id = (
          SELECT inner_job.id FROM "integration_jobs" AS inner_job
          INNER JOIN "integration_schedules" AS schedule
            ON schedule.id = inner_job."schedule_id"
          WHERE schedule.enabled = true
          AND (
            (
              inner_job.status = 'PENDING'
              AND inner_job."scheduled_for" <= ${now}
              AND (inner_job."not_before_at" IS NULL OR inner_job."not_before_at" <= ${now})
            ) OR (
              inner_job.status = 'RUNNING' AND inner_job."started_at" < ${leaseCutoff}
            )
          )
          ORDER BY inner_job."scheduled_for" ASC, inner_job.id ASC
          LIMIT 1
        )
        AND (
          job.status = 'PENDING'
          OR (job.status = 'RUNNING' AND job."started_at" < ${leaseCutoff})
        )
        RETURNING
          job.id AS "id",
          job."schedule_id" AS "scheduleId",
          job."portfolio_id" AS "portfolioId",
          job."source" AS "source",
          job."environment" AS "environment",
          job."scheduled_for" AS "scheduledFor",
          job."status" AS "status",
          job."attempt" AS "attempt",
          job."not_before_at" AS "notBeforeAt",
          job."run_id" AS "runId",
          job."error_code" AS "errorCode",
          job."error_message" AS "errorMessage",
          job."started_at" AS "startedAt",
          job."finished_at" AS "finishedAt",
          job."created_at" AS "createdAt",
          job."updated_at" AS "updatedAt"`;
      if (rows.length === 0) return null;
      return this.map(rows[0]!);
    } catch (error: unknown) {
      throw new PersistenceError(`Failed to claim due integration job: ${String(error)}`);
    }
  }

  private async requireClaim(
    id: string,
    portfolioId: string,
    attempt: number,
  ): Promise<PrismaJobRow> {
    const row = await this.prisma.integrationJob.findFirst({ where: { id, portfolioId } });
    if (!row) {
      throw new PersistenceError(`Integration job ${id} not found`);
    }
    if (row.status !== 'RUNNING' || row.attempt !== attempt) {
      throw new PersistenceError(
        `Integration job ${id} claim superseded (status ${row.status}, attempt ${row.attempt}) and rejects completion`,
      );
    }
    return row;
  }

  async markSucceeded(input: {
    id: string;
    portfolioId: string;
    attempt: number;
    runId: string | null;
  }): Promise<IntegrationJobRow> {
    await this.requireClaim(input.id, input.portfolioId, input.attempt);
    try {
      // Guarded write: only the current holder (still RUNNING at the claimed
      // attempt) can complete. A concurrent stale-claim completion loses
      // explicitly instead of silently overwriting the terminal state.
      const result = await this.prisma.integrationJob.updateMany({
        where: {
          id: input.id,
          portfolioId: input.portfolioId,
          status: 'RUNNING',
          attempt: input.attempt,
        },
        data: { status: 'SUCCEEDED', runId: input.runId, finishedAt: new Date() },
      });
      if (result.count === 0) {
        throw new PersistenceError(
          `Integration job ${input.id} is no longer running and rejects completion`,
        );
      }
      const row = await this.prisma.integrationJob.findFirstOrThrow({ where: { id: input.id } });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to complete integration job ${input.id}`);
    }
  }

  async markFailed(input: {
    id: string;
    portfolioId: string;
    attempt: number;
    errorCode: string;
    errorMessage: string;
    attemptsExhausted: boolean;
    notBeforeAt: Date | null;
  }): Promise<IntegrationJobRow> {
    await this.requireClaim(input.id, input.portfolioId, input.attempt);
    try {
      const result = await this.prisma.integrationJob.updateMany({
        where: {
          id: input.id,
          portfolioId: input.portfolioId,
          status: 'RUNNING',
          attempt: input.attempt,
        },
        data: input.attemptsExhausted
          ? {
              status: 'FAILED',
              errorCode: input.errorCode,
              errorMessage: input.errorMessage,
              finishedAt: new Date(),
            }
          : {
              status: 'PENDING',
              errorCode: input.errorCode,
              errorMessage: input.errorMessage,
              notBeforeAt: input.notBeforeAt,
              startedAt: null,
            },
      });
      if (result.count === 0) {
        throw new PersistenceError(
          `Integration job ${input.id} is no longer running and rejects failure`,
        );
      }
      const row = await this.prisma.integrationJob.findFirstOrThrow({ where: { id: input.id } });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to fail integration job ${input.id}`);
    }
  }

  async findById(id: string, portfolioId: string): Promise<IntegrationJobRow | null> {
    try {
      const row = await this.prisma.integrationJob.findFirst({ where: { id, portfolioId } });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find integration job ${id}`);
    }
  }

  async findActiveBySchedule(scheduleId: string): Promise<IntegrationJobRow | null> {
    try {
      const row = await this.prisma.integrationJob.findFirst({
        where: { scheduleId, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find active integration job for schedule ${scheduleId}`,
      );
    }
  }

  async listByPortfolio(
    portfolioId: string,
    input: { limit: number; cursor?: string | null },
  ): Promise<{ rows: IntegrationJobRow[]; hasMore: boolean }> {
    const limit = Math.min(200, Math.max(1, Math.floor(input.limit)));
    try {
      let where: Prisma.IntegrationJobWhereInput = { portfolioId };
      if (input.cursor) {
        const anchor = await this.prisma.integrationJob.findFirst({
          where: { id: input.cursor, portfolioId },
        });
        if (!anchor) {
          throw new PersistenceError(`Invalid integration job cursor for portfolio ${portfolioId}`);
        }
        where = {
          portfolioId,
          OR: [
            { scheduledFor: { lt: anchor.scheduledFor } },
            { scheduledFor: anchor.scheduledFor, id: { lt: anchor.id } },
          ],
        };
      }
      const rows = await this.prisma.integrationJob.findMany({
        where,
        orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      return {
        rows: rows.slice(0, limit).map((row) => this.map(row)),
        hasMore: rows.length > limit,
      };
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to list integration jobs for portfolio ${portfolioId}`);
    }
  }
}
