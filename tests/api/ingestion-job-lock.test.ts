/**
 * Phase 5E (R3-A) - PostgreSQL advisory locking and run history (atlas_test only).
 *
 * Proves multi-instance safety at the database level:
 * - two concurrent runners for one logical key => exactly one executor;
 * - the loser receives SKIPPED_LOCKED with zero handler invocations;
 * - different logical keys execute independently;
 * - the lock is released after success, handled failure and unexpected throw;
 * - retries reuse the same logical key with incremented attempts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getTestPrismaClient } from '../database/setup';
import { PrismaJobRepository } from '../../apps/api/src/ingestion/job-repository';
import { PrismaJobLock } from '../../apps/api/src/ingestion/job-lock';
import { JobRunner } from '../../apps/api/src/ingestion/job-runner';
import {
  buildLogicalJobKey,
  JobExecutionResult,
} from '../../apps/api/src/ingestion/job-types';

const prisma = getTestPrismaClient();
const createdKeys: string[] = [];

function trackKey(key: string): string {
  createdKeys.push(key);
  return key;
}

function makeCore(): {
  repository: PrismaJobRepository;
  lock: PrismaJobLock;
  runner: JobRunner;
} {
  const repository = new PrismaJobRepository(prisma);
  const lock = new PrismaJobLock(prisma);
  return { repository, lock, runner: new JobRunner(repository, lock) };
}

afterEach(async () => {
  for (const key of createdKeys.splice(0)) {
    await prisma.$executeRaw`DELETE FROM ingestion_job_runs WHERE logical_job_key = ${key}`;
  }
});

const successResult = (): JobExecutionResult => ({
  status: 'SUCCESS',
  itemsRequested: 1,
  itemsFetched: 1,
  itemsInserted: 1,
  itemsFailed: 0,
  finishedAt: new Date().toISOString(),
  durationMs: 5,
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('ingestion atomic advisory locking (R3-A, atlas_test)', () => {
  it('allows exactly one executor for concurrent runs of the same logical key', async () => {
    const { runner } = makeCore();
    const scheduledFor = '2026-10-19';
    trackKey(buildLogicalJobKey('MARKET_QUOTES_DAILY', scheduledFor));
    let handlerCalls = 0;

    const slowHandler = async (): Promise<JobExecutionResult> => {
      handlerCalls += 1;
      await sleep(400);
      return successResult();
    };

    const [first, second] = await Promise.all([
      runner.run({
        jobType: 'MARKET_QUOTES_DAILY',
        triggerType: 'SCHEDULED',
        scheduledFor,
        execute: slowHandler,
      }),
      runner.run({
        jobType: 'MARKET_QUOTES_DAILY',
        triggerType: 'SCHEDULED',
        scheduledFor,
        execute: slowHandler,
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['SKIPPED_LOCKED', 'SUCCESS']);
    expect(handlerCalls).toBe(1);

    const rows = await prisma.ingestionJobRunRecord.findMany({
      where: { logicalJobKey: buildLogicalJobKey('MARKET_QUOTES_DAILY', scheduledFor) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('SUCCESS');
    expect(rows[0]?.itemsFailed).toBe(0);
  });

  it('executes different logical keys independently', async () => {
    const { runner } = makeCore();

    // Use two real canonical job types so the persisted job_type is valid.
    trackKey(buildLogicalJobKey('BENCHMARK_IBOV_DAILY', '2026-10-19'));
    trackKey(buildLogicalJobKey('BENCHMARK_CDI_DAILY', '2026-10-19'));

    let calls = 0;
    const handler = async (): Promise<JobExecutionResult> => {
      calls += 1;
      await sleep(200);
      return successResult();
    };

    const [ibov, cdi] = await Promise.all([
      runner.run({
        jobType: 'BENCHMARK_IBOV_DAILY',
        triggerType: 'SCHEDULED',
        scheduledFor: '2026-10-19',
        execute: handler,
      }),
      runner.run({
        jobType: 'BENCHMARK_CDI_DAILY',
        triggerType: 'SCHEDULED',
        scheduledFor: '2026-10-19',
        execute: handler,
      }),
    ]);

    expect(ibov.status).toBe('SUCCESS');
    expect(cdi.status).toBe('SUCCESS');
    expect(calls).toBe(2);
  });

  it('releases the lock after success and increments the attempt on rerun', async () => {
    const { runner } = makeCore();
    const scheduledFor = '2026-10-20';
    trackKey(buildLogicalJobKey('BENCHMARK_IBOV_DAILY', scheduledFor));

    const first = await runner.run({
      jobType: 'BENCHMARK_IBOV_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: async () => successResult(),
    });
    expect(first.status).toBe('SUCCESS');
    expect(first.attempt).toBe(1);

    const second = await runner.run({
      jobType: 'BENCHMARK_IBOV_DAILY',
      triggerType: 'MANUAL',
      scheduledFor,
      execute: async () => successResult(),
    });
    expect(second.status).toBe('SUCCESS');
    expect(second.attempt).toBe(2);
  });

  it('releases the lock after a handled failure so a later run can acquire it', async () => {
    const { runner } = makeCore();
    const scheduledFor = '2026-10-21';
    trackKey(buildLogicalJobKey('FX_USD_BRL_DAILY', scheduledFor));

    const failed = await runner.run({
      jobType: 'FX_USD_BRL_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: async () => ({
        status: 'FAILED',
        itemsFailed: 1,
        errorCode: 'VALIDATION.INVALID_DATE_RANGE',
        errorMessage: 'bad range',
        finishedAt: new Date().toISOString(),
        durationMs: 1,
      }),
    });
    expect(failed.status).toBe('FAILED');

    const next = await runner.run({
      jobType: 'FX_USD_BRL_DAILY',
      triggerType: 'MANUAL',
      scheduledFor,
      execute: async () => successResult(),
    });
    expect(next.status).toBe('SUCCESS');
    expect(next.attempt).toBe(2);
  });

  it('releases the lock after an unexpected throw', async () => {
    const { runner } = makeCore();
    const scheduledFor = '2026-10-22';
    trackKey(buildLogicalJobKey('MACRO_IPCA', scheduledFor));

    const thrown = await runner.run({
      jobType: 'MACRO_IPCA',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: async () => {
        throw new Error('unexpected crash');
      },
    });
    expect(thrown.status).toBe('FAILED');
    expect(thrown.errorCode).toBe('EXECUTION.UNEXPECTED_ERROR');

    const next = await runner.run({
      jobType: 'MACRO_IPCA',
      triggerType: 'MANUAL',
      scheduledFor,
      execute: async () => successResult(),
    });
    expect(next.status).toBe('SUCCESS');
  });

  it('retries transient failures on the same logical key with incremented attempts', async () => {
    const { runner } = makeCore();
    const scheduledFor = '2026-10-23';
    const logicalJobKey = trackKey(buildLogicalJobKey('MACRO_SELIC_EFFECTIVE', scheduledFor));
    let calls = 0;

    const receipt = await runner.run({
      jobType: 'MACRO_SELIC_EFFECTIVE',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: async (ctx) => {
        calls += 1;
        expect(ctx.logicalJobKey).toBe(logicalJobKey);
        if (calls === 1) {
          return {
            status: 'FAILED',
            itemsFailed: 1,
            errorCode: 'MACRO.RATE_LIMITED',
            errorMessage: 'rate limited',
            finishedAt: new Date().toISOString(),
            durationMs: 1,
          };
        }
        return successResult();
      },
      maxAttempts: 3,
      backoffBaseMs: 1,
      sleep: async () => undefined,
    });

    expect(calls).toBe(2);
    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.logicalJobKey).toBe(logicalJobKey);
    expect(receipt.attempt).toBe(2);
  });

  it('reaps a stale RUNNING run before starting a new attempt', async () => {
    const { repository, runner } = makeCore();
    const scheduledFor = '2026-10-24';
    const key = trackKey(buildLogicalJobKey('FX_EUR_BRL_DAILY', scheduledFor));

    const stale = await repository.createRun({
      logicalJobKey: key,
      jobType: 'FX_EUR_BRL_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      attempt: 1,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });

    const receipt = await runner.run({
      jobType: 'FX_EUR_BRL_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: async () => successResult(),
    });

    expect(receipt.status).toBe('SUCCESS');
    const reaped = await repository.findById(stale.jobRunId);
    expect(reaped?.status).toBe('FAILED');
    expect(reaped?.errorCode).toBe('STALE_RUN_REAPED');
  });
});
