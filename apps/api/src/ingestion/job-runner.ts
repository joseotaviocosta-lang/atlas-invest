/**
 * Phase 5E (R3-A) - Job runner: advisory lock -> run history -> handler -> receipt.
 *
 * Every attempt follows the same sequence:
 *   1. acquire the PostgreSQL advisory lock for the logical key;
 *   2. reap stale RUNNING rows (crash recovery);
 *   3. create a RUNNING run row with an incremented attempt;
 *   4. execute the registered handler;
 *   5. persist the terminal result;
 *   6. release the lock (also on handled failure and on unexpected throw).
 *
 * Lock denied => SKIPPED_LOCKED with zero handler invocations. The lock is never
 * held while sleeping between retries.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  assertValidExecutionDate,
  assertValidTargetPeriod,
  buildLogicalJobKey,
  failedResultFromError,
  getPeriodGranularity,
  IngestionJobType,
  JobExecutionContext,
  JobExecutionResult,
  JobReceipt,
  JobStatus,
  MAX_JOB_ATTEMPTS,
  PeriodGranularity,
  RETRY_BACKOFF_BASE_MS,
  shouldRetryResult,
  TriggerType,
} from './job-types';
import { IJobRepository } from './job-repository';
import { IJobLock, JobLockHandle } from './job-lock';
import { INGESTION_JOB_LOCK, INGESTION_JOB_REPOSITORY } from './tokens';

export type JobHandler = (ctx: JobExecutionContext) => Promise<JobExecutionResult>;

export interface RunJobInput {
  jobType: IngestionJobType;
  triggerType: TriggerType;
  /** Canonical logical business window (DAY YYYY-MM-DD, MONTH YYYY-MM, YEAR YYYY). */
  targetPeriod: string;
  targetPeriodGranularity: PeriodGranularity;
  /** Execution civil date (always YYYY-MM-DD). Never the period. */
  scheduledFor: string;
  execute: JobHandler;
  maxAttempts?: number;
  backoffBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

@Injectable()
export class JobRunner {
  constructor(
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly repository: IJobRepository,
    @Inject(INGESTION_JOB_LOCK)
    private readonly lock: IJobLock,
  ) {}

  async run(input: RunJobInput): Promise<JobReceipt> {
    const maxAttempts = Math.max(1, input.maxAttempts ?? MAX_JOB_ATTEMPTS);
    const backoffBaseMs = input.backoffBaseMs ?? RETRY_BACKOFF_BASE_MS;
    const sleep = input.sleep ?? defaultSleep;
    assertValidTargetPeriod(input.jobType, input.targetPeriod);
    assertValidExecutionDate(input.scheduledFor);
    const expectedGranularity = getPeriodGranularity(input.jobType);
    if (input.targetPeriodGranularity !== expectedGranularity) {
      throw new Error(
        `Mismatched target period granularity '${input.targetPeriodGranularity}' for '${input.jobType}'. Expected '${expectedGranularity}'.`,
      );
    }
    const targetPeriodGranularity = input.targetPeriodGranularity;
    const logicalJobKey = buildLogicalJobKey(input.jobType, input.targetPeriod);

    let lastReceipt: JobReceipt | null = null;

    for (let loop = 1; loop <= maxAttempts; loop += 1) {
      const startedAt = new Date().toISOString();
      const handle = await this.lock.tryAcquire(logicalJobKey);

      if (!handle.acquired) {
        return this.lockedReceipt(input, logicalJobKey, startedAt);
      }

      let result: JobExecutionResult | null = null;
      let shouldRetry = false;
      let retryDelayMs = 0;
      let runId = '';

      try {
        await this.repository.reapStaleRuns(logicalJobKey, startedAt);
        const attempt = await this.repository.nextAttempt(logicalJobKey);
        const triggerType: TriggerType = loop === 1 ? input.triggerType : 'RETRY';

        const run = await this.repository.createRun({
          logicalJobKey,
          jobType: input.jobType,
          triggerType,
          targetPeriod: input.targetPeriod,
          targetPeriodGranularity,
          scheduledFor: input.scheduledFor,
          attempt,
          startedAt,
        });
        runId = run.jobRunId;

        const ctx: JobExecutionContext = {
          jobRunId: run.jobRunId,
          logicalJobKey,
          jobType: input.jobType,
          triggerType,
          targetPeriod: input.targetPeriod,
          targetPeriodGranularity,
          scheduledFor: input.scheduledFor,
          attempt,
          startedAt,
        };

        try {
          result = await input.execute(ctx);
        } catch (error: unknown) {
          result = failedResultFromError(error, startedAt);
        }

        const finishedAt = new Date().toISOString();
        const completed: JobExecutionResult = {
          ...result,
          finishedAt: result.finishedAt || finishedAt,
          durationMs:
            result.durationMs ||
            Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
        };

        await this.repository.completeRun(run.jobRunId, completed);
        lastReceipt =
          (await this.repository.findById(run.jobRunId)) ?? this.fallbackReceipt(ctx, completed);

        shouldRetry =
          loop < maxAttempts && shouldRetryResult(completed) && completed.status === 'FAILED';
        retryDelayMs = backoffBaseMs * 2 ** (loop - 1);
      } finally {
        await this.releaseLock(handle);
      }

      if (!shouldRetry) {
        if (lastReceipt) return lastReceipt;
        throw new Error(`JobRunner: no receipt persisted for '${logicalJobKey}' (run ${runId})`);
      }

      await sleep(retryDelayMs);
    }

    if (lastReceipt) return lastReceipt;
    throw new Error(`JobRunner: exhausted attempts for '${logicalJobKey}' without receipt`);
  }

  private async releaseLock(handle: JobLockHandle): Promise<void> {
    try {
      await handle.release();
    } catch {
      // Releasing a lock must never mask a persisted job result. If the
      // connection died, PostgreSQL already released the transaction lock.
    }
  }

  private lockedReceipt(input: RunJobInput, logicalJobKey: string, startedAt: string): JobReceipt {
    const finishedAt = new Date().toISOString();
    return {
      jobRunId: `skipped-locked:${logicalJobKey}`,
      logicalJobKey,
      jobType: input.jobType,
      triggerType: input.triggerType,
      targetPeriod: input.targetPeriod,
      targetPeriodGranularity: input.targetPeriodGranularity,
      scheduledFor: input.scheduledFor,
      attempt: 0,
      status: 'SKIPPED_LOCKED',
      startedAt,
      finishedAt,
      durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
      itemsFailed: 0,
      metadata: { reason: 'Another instance holds the logical job lock' },
    };
  }

  private fallbackReceipt(ctx: JobExecutionContext, result: JobExecutionResult): JobReceipt {
    return {
      jobRunId: ctx.jobRunId,
      logicalJobKey: ctx.logicalJobKey,
      jobType: ctx.jobType,
      triggerType: ctx.triggerType,
      targetPeriod: ctx.targetPeriod,
      targetPeriodGranularity: ctx.targetPeriodGranularity,
      scheduledFor: ctx.scheduledFor,
      attempt: ctx.attempt,
      status: result.status as JobStatus,
      startedAt: ctx.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      itemsRequested: result.itemsRequested,
      itemsFetched: result.itemsFetched,
      itemsInserted: result.itemsInserted,
      itemsRevised: result.itemsRevised,
      itemsUnchanged: result.itemsUnchanged,
      itemsFailed: result.itemsFailed,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      provider: result.provider,
      target: result.target,
      metadata: result.metadata,
    };
  }
}
