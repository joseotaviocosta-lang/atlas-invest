/**
 * Phase 5E (R3-A) - Ingestion job persistence port + Prisma implementation.
 *
 * Prisma is infrastructure-only. Callers depend on IJobRepository and receive
 * serializable JobReceipt values; no Prisma types cross this boundary.
 *
 * Exclusivity is NOT implemented here: it belongs to IJobLock (PostgreSQL
 * advisory lock). This repository only writes/reads run history and reaps stale
 * RUNNING rows after a crash.
 */

import { Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import {
  assertValidExecutionDate,
  assertValidTargetPeriod,
  IngestionJobType,
  JobExecutionResult,
  JobReceipt,
  JobStatus,
  PeriodGranularity,
  STALE_RUN_TTL_MS,
  TriggerType,
} from './job-types';

export type PrismaLikeClient = ReturnType<typeof getPrismaClient>;

interface JobRunRow {
  id: string;
  logicalJobKey: string;
  jobType: string;
  triggerType: string;
  targetPeriod: string;
  targetPeriodGranularity: string;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: string;
  attempt: number;
  itemsRequested: number | null;
  itemsFetched: number | null;
  itemsInserted: number | null;
  itemsRevised: number | null;
  itemsUnchanged: number | null;
  itemsFailed: number;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface CreateRunInput {
  logicalJobKey: string;
  jobType: IngestionJobType;
  triggerType: TriggerType;
  /** Canonical logical business window (DAY YYYY-MM-DD, MONTH YYYY-MM, YEAR YYYY). Never coerced. */
  targetPeriod: string;
  targetPeriodGranularity: PeriodGranularity;
  /** Execution civil date (always YYYY-MM-DD). */
  scheduledFor: string;
  attempt: number;
  startedAt: string;
}

export interface ListRunsInput {
  jobType?: IngestionJobType;
  triggerType?: TriggerType;
  status?: JobStatus;
  /** Inclusive civil from (YYYY-MM-DD) on scheduled_for. */
  from?: string;
  /** Inclusive civil to (YYYY-MM-DD) on scheduled_for. */
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface ListRunsResult {
  items: JobReceipt[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface IJobRepository {
  nextAttempt(logicalJobKey: string): Promise<number>;
  reapStaleRuns(logicalJobKey: string, nowIso: string, ttlMs?: number): Promise<number>;
  createRun(input: CreateRunInput): Promise<JobReceipt>;
  completeRun(runId: string, result: JobExecutionResult): Promise<void>;
  findById(runId: string): Promise<JobReceipt | null>;
  listRuns(input: ListRunsInput): Promise<ListRunsResult>;
}

function toCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIso(value: Date | null): string {
  return value ? value.toISOString() : '';
}

function toMetadata(value: unknown): Record<string, string | number | boolean | null> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string | number | boolean | null>;
  }
  return undefined;
}

function mapRow(row: JobRunRow): JobReceipt {
  return {
    jobRunId: row.id,
    logicalJobKey: row.logicalJobKey,
    jobType: row.jobType as IngestionJobType,
    triggerType: row.triggerType as TriggerType,
    targetPeriod: row.targetPeriod,
    targetPeriodGranularity: row.targetPeriodGranularity as JobReceipt['targetPeriodGranularity'],
    scheduledFor: toCivilDate(row.scheduledFor),
    attempt: row.attempt,
    status: row.status as JobStatus,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    durationMs:
      row.startedAt && row.finishedAt
        ? Math.max(0, new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime())
        : 0,
    itemsRequested: row.itemsRequested ?? undefined,
    itemsFetched: row.itemsFetched ?? undefined,
    itemsInserted: row.itemsInserted ?? undefined,
    itemsRevised: row.itemsRevised ?? undefined,
    itemsUnchanged: row.itemsUnchanged ?? undefined,
    itemsFailed: row.itemsFailed ?? 0,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    metadata: toMetadata(row.metadata),
  };
}

function encodeCursor(row: JobRunRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid ingestion job cursor');
  }
  const separator = decoded.indexOf('|');
  if (separator <= 0) throw new Error('Invalid ingestion job cursor');
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(new Date(createdAt).getTime()) || id.length === 0) {
    throw new Error('Invalid ingestion job cursor');
  }
  return { createdAt, id };
}

@Injectable()
export class PrismaJobRepository implements IJobRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async nextAttempt(logicalJobKey: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ next: number }>>`
      SELECT COALESCE(MAX(attempt), 0) + 1 AS next
        FROM ingestion_job_runs
       WHERE logical_job_key = ${logicalJobKey}`;
    return rows[0]?.next ?? 1;
  }

  async reapStaleRuns(
    logicalJobKey: string,
    nowIso: string,
    ttlMs: number = STALE_RUN_TTL_MS,
  ): Promise<number> {
    const cutoff = new Date(new Date(nowIso).getTime() - ttlMs).toISOString();
    return this.prisma.$executeRaw`
      UPDATE ingestion_job_runs
         SET status = 'FAILED',
             finished_at = ${nowIso}::timestamptz,
             error_code = 'STALE_RUN_REAPED',
             error_message = 'Previous run exceeded the stale-run TTL without completing; reaped.'
       WHERE logical_job_key = ${logicalJobKey}
         AND status IN ('PENDING', 'RUNNING')
         AND started_at < ${cutoff}::timestamptz`;
  }

  async createRun(input: CreateRunInput): Promise<JobReceipt> {
    assertValidTargetPeriod(input.jobType, input.targetPeriod);
    assertValidExecutionDate(input.scheduledFor);
    const rows = await this.prisma.$queryRaw<JobRunRow[]>`
      INSERT INTO ingestion_job_runs
        (id, logical_job_key, job_type, trigger_type, target_period,
         target_period_granularity, scheduled_for,
         started_at, status, attempt, items_failed, created_at)
      VALUES (gen_random_uuid(), ${input.logicalJobKey}, ${input.jobType},
              ${input.triggerType}, ${input.targetPeriod},
              ${input.targetPeriodGranularity}, ${input.scheduledFor}::date,
              ${input.startedAt}::timestamptz, 'RUNNING', ${input.attempt}, 0, NOW())
      RETURNING id, logical_job_key AS "logicalJobKey", job_type AS "jobType",
        trigger_type AS "triggerType", target_period AS "targetPeriod",
        target_period_granularity AS "targetPeriodGranularity",
        scheduled_for AS "scheduledFor",
        started_at AS "startedAt", finished_at AS "finishedAt",
        status, attempt, items_requested AS "itemsRequested",
        items_fetched AS "itemsFetched", items_inserted AS "itemsInserted",
        items_revised AS "itemsRevised", items_unchanged AS "itemsUnchanged",
        items_failed AS "itemsFailed", error_code AS "errorCode",
        error_message AS "errorMessage", metadata, created_at AS "createdAt"`;
    const row = rows[0];
    if (!row) throw new Error('createRun: INSERT returned no row');
    return mapRow(row);
  }

  async completeRun(runId: string, result: JobExecutionResult): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ingestion_job_runs
         SET status = ${result.status},
             finished_at = ${result.finishedAt}::timestamptz,
             items_requested = ${result.itemsRequested ?? null},
             items_fetched = ${result.itemsFetched ?? null},
             items_inserted = ${result.itemsInserted ?? null},
             items_revised = ${result.itemsRevised ?? null},
             items_unchanged = ${result.itemsUnchanged ?? null},
             items_failed = ${result.itemsFailed ?? 0},
             error_code = ${result.errorCode ?? null},
             error_message = ${result.errorMessage ?? null},
             metadata = ${result.metadata ? JSON.stringify(result.metadata) : null}::jsonb
       WHERE id = ${runId}::uuid`;
  }

  async findById(runId: string): Promise<JobReceipt | null> {
    const rows = await this.prisma.$queryRaw<JobRunRow[]>`
      SELECT id, logical_job_key AS "logicalJobKey", job_type AS "jobType",
             trigger_type AS "triggerType", target_period AS "targetPeriod",
             target_period_granularity AS "targetPeriodGranularity",
             scheduled_for AS "scheduledFor",
             started_at AS "startedAt", finished_at AS "finishedAt",
             status, attempt, items_requested AS "itemsRequested",
             items_fetched AS "itemsFetched", items_inserted AS "itemsInserted",
             items_revised AS "itemsRevised", items_unchanged AS "itemsUnchanged",
             items_failed AS "itemsFailed", error_code AS "errorCode",
             error_message AS "errorMessage", metadata, created_at AS "createdAt"
        FROM ingestion_job_runs
       WHERE id = ${runId}::uuid`;
    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  async listRuns(input: ListRunsInput): Promise<ListRunsResult> {
    const limit = Math.min(200, Math.max(1, input.limit ?? 50));
    const jobType = input.jobType ?? null;
    const triggerType = input.triggerType ?? null;
    const status = input.status ?? null;
    const from = input.from ?? null;
    const to = input.to ?? null;

    let rows: JobRunRow[];
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      rows = await this.prisma.$queryRaw<JobRunRow[]>`
        SELECT id, logical_job_key AS "logicalJobKey", job_type AS "jobType",
               trigger_type AS "triggerType", target_period AS "targetPeriod",
               target_period_granularity AS "targetPeriodGranularity",
               scheduled_for AS "scheduledFor",
               started_at AS "startedAt", finished_at AS "finishedAt",
               status, attempt, items_requested AS "itemsRequested",
               items_fetched AS "itemsFetched", items_inserted AS "itemsInserted",
               items_revised AS "itemsRevised", items_unchanged AS "itemsUnchanged",
               items_failed AS "itemsFailed", error_code AS "errorCode",
               error_message AS "errorMessage", metadata, created_at AS "createdAt"
          FROM ingestion_job_runs
         WHERE (${jobType}::text IS NULL OR job_type = ${jobType}::text)
           AND (${triggerType}::text IS NULL OR trigger_type = ${triggerType}::text)
           AND (${status}::text IS NULL OR status = ${status}::text)
           AND (${from}::date IS NULL OR scheduled_for >= ${from}::date)
           AND (${to}::date IS NULL OR scheduled_for <= ${to}::date)
           AND (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit + 1}`;
    } else {
      rows = await this.prisma.$queryRaw<JobRunRow[]>`
        SELECT id, logical_job_key AS "logicalJobKey", job_type AS "jobType",
               trigger_type AS "triggerType", target_period AS "targetPeriod",
               target_period_granularity AS "targetPeriodGranularity",
               scheduled_for AS "scheduledFor",
               started_at AS "startedAt", finished_at AS "finishedAt",
               status, attempt, items_requested AS "itemsRequested",
               items_fetched AS "itemsFetched", items_inserted AS "itemsInserted",
               items_revised AS "itemsRevised", items_unchanged AS "itemsUnchanged",
               items_failed AS "itemsFailed", error_code AS "errorCode",
               error_message AS "errorMessage", metadata, created_at AS "createdAt"
          FROM ingestion_job_runs
         WHERE (${jobType}::text IS NULL OR job_type = ${jobType}::text)
           AND (${triggerType}::text IS NULL OR trigger_type = ${triggerType}::text)
           AND (${status}::text IS NULL OR status = ${status}::text)
           AND (${from}::date IS NULL OR scheduled_for >= ${from}::date)
           AND (${to}::date IS NULL OR scheduled_for <= ${to}::date)
         ORDER BY created_at DESC, id DESC
         LIMIT ${limit + 1}`;
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(mapRow),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }
}
