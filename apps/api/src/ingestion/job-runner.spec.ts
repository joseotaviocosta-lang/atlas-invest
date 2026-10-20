/**
 * Phase 5E (R3-A) - Job core unit tests (no database).
 *
 * The fake lock models the only observable contract the runner relies on:
 * exactly one acquired handle per logical key at a time.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLogicalJobKey,
  deriveAdvisoryLockKey,
  isPermanentError,
  isTransientError,
} from './job-types';
import {
  CreateRunInput,
  IJobRepository,
  ListRunsInput,
  ListRunsResult,
} from './job-repository';
import { IJobLock, JobLockHandle } from './job-lock';
import { JobRunner } from './job-runner';
import { JobExecutionResult, JobReceipt } from './job-types';

class FakeJobRepository implements IJobRepository {
  runs = new Map<string, JobReceipt>();
  attempts = new Map<string, number>();
  createCalls = 0;
  private seq = 0;

  async nextAttempt(logicalJobKey: string): Promise<number> {
    return (this.attempts.get(logicalJobKey) ?? 0) + 1;
  }

  async reapStaleRuns(): Promise<number> {
    return 0;
  }

  async createRun(input: CreateRunInput): Promise<JobReceipt> {
    this.createCalls += 1;
    this.seq += 1;
    this.attempts.set(input.logicalJobKey, input.attempt);
    const receipt: JobReceipt = {
      jobRunId: `run-${this.seq}`,
      logicalJobKey: input.logicalJobKey,
      jobType: input.jobType,
      triggerType: input.triggerType,
      scheduledFor: input.scheduledFor,
      attempt: input.attempt,
      status: 'RUNNING',
      startedAt: input.startedAt,
      finishedAt: '',
      durationMs: 0,
    };
    this.runs.set(receipt.jobRunId, receipt);
    return receipt;
  }

  async completeRun(runId: string, result: JobExecutionResult): Promise<void> {
    const receipt = this.runs.get(runId);
    if (!receipt) throw new Error(`unknown run ${runId}`);
    this.runs.set(runId, { ...receipt, ...result, jobRunId: receipt.jobRunId });
  }

  async findById(runId: string): Promise<JobReceipt | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns(_input: ListRunsInput): Promise<ListRunsResult> {
    return { items: [...this.runs.values()], hasMore: false, nextCursor: null };
  }
}

class FakeJobLock implements IJobLock {
  private held = new Set<string>();
  acquisitions = 0;
  releases = 0;

  async tryAcquire(logicalJobKey: string): Promise<JobLockHandle> {
    this.acquisitions += 1;
    if (this.held.has(logicalJobKey)) {
      return { acquired: false, release: async () => undefined };
    }
    this.held.add(logicalJobKey);
    return {
      acquired: true,
      release: async () => {
        this.held.delete(logicalJobKey);
        this.releases += 1;
      },
    };
  }
}

const successResult = (): JobExecutionResult => ({
  status: 'SUCCESS',
  itemsRequested: 2,
  itemsFetched: 2,
  itemsInserted: 2,
  itemsFailed: 0,
  finishedAt: new Date().toISOString(),
  durationMs: 5,
});

describe('ingestion logical job key (R3-A)', () => {
  it('builds a deterministic key that excludes the attempt number', () => {
    expect(buildLogicalJobKey('MARKET_QUOTES_DAILY', '2026-10-19')).toBe(
      'MARKET_QUOTES_DAILY:2026-10-19',
    );
    expect(buildLogicalJobKey('MACRO_IPCA', '2026-09')).toBe('MACRO_IPCA:2026-09');
    expect(buildLogicalJobKey('CALENDAR_B3_REFRESH', '2027')).toBe('CALENDAR_B3_REFRESH:2027');
  });

  it('derives a stable 64-bit advisory lock key from the logical key', () => {
    const key = 'MARKET_QUOTES_DAILY:2026-10-19';
    expect(deriveAdvisoryLockKey(key)).toBe(deriveAdvisoryLockKey(key));
    expect(deriveAdvisoryLockKey(key)).not.toBe(
      deriveAdvisoryLockKey('MARKET_QUOTES_DAILY:2026-10-20'),
    );
    expect(typeof deriveAdvisoryLockKey(key)).toBe('bigint');
  });

  it('classifies transient vs permanent provider errors', () => {
    expect(isTransientError('MARKET_DATA.RATE_LIMITED')).toBe(true);
    expect(isTransientError('PROVIDER.UNAVAILABLE')).toBe(true);
    expect(isTransientError('VALIDATION.INVALID_DATE_RANGE')).toBe(false);
    expect(isPermanentError('VALIDATION.INVALID_DATE_RANGE')).toBe(true);
    expect(isPermanentError('MARKET_DATA.RATE_LIMITED')).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe('JobRunner concurrency and lock lifecycle (R3-A)', () => {
  it('denies the second concurrent holder without invoking its handler', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);
    const key = buildLogicalJobKey('MARKET_QUOTES_DAILY', '2026-10-19');

    const holder = await lock.tryAcquire(key);
    expect(holder.acquired).toBe(true);

    let handlerCalls = 0;
    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      execute: async () => {
        handlerCalls += 1;
        return successResult();
      },
    });

    expect(receipt.status).toBe('SKIPPED_LOCKED');
    expect(receipt.attempt).toBe(0);
    expect(handlerCalls).toBe(0);

    await holder.release();
  });

  it('executes and releases the lock after success', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);

    const first = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      execute: async () => successResult(),
    });
    expect(first.status).toBe('SUCCESS');
    expect(lock.releases).toBe(1);

    const second = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-20',
      execute: async () => successResult(),
    });
    expect(second.status).toBe('SUCCESS');
    expect(second.logicalJobKey).toBe('MARKET_QUOTES_DAILY:2026-10-20');
  });

  it('releases the lock after a handled failure', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);

    const failed = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
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
    expect(lock.releases).toBe(1);

    const next = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'MANUAL',
      scheduledFor: '2026-10-19',
      execute: async () => successResult(),
    });
    expect(next.status).toBe('SUCCESS');
  });

  it('releases the lock after an unexpected throw and persists FAILED', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);

    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      execute: async () => {
        throw new Error('boom');
      },
    });

    expect(receipt.status).toBe('FAILED');
    expect(receipt.errorCode).toBe('EXECUTION.UNEXPECTED_ERROR');
    expect(lock.releases).toBe(1);
  });

  it('retries transient failures on the same logical key with incremented attempts', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);
    const seenAttempts: number[] = [];
    let calls = 0;

    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      execute: async (ctx) => {
        calls += 1;
        seenAttempts.push(ctx.attempt);
        if (calls === 1) {
          return {
            status: 'FAILED',
            itemsFailed: 1,
            errorCode: 'MARKET_DATA.RATE_LIMITED',
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

    expect(receipt.status).toBe('SUCCESS');
    expect(calls).toBe(2);
    expect(seenAttempts).toEqual([1, 2]);
    expect(receipt.attempt).toBe(2);
    expect(receipt.logicalJobKey).toBe('MARKET_QUOTES_DAILY:2026-10-19');
    expect(lock.releases).toBe(2);
  });

  it('does not retry permanent validation errors', async () => {
    const repo = new FakeJobRepository();
    const lock = new FakeJobLock();
    const runner = new JobRunner(repo, lock);
    let calls = 0;

    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      execute: async () => {
        calls += 1;
        return {
          status: 'FAILED',
          itemsFailed: 1,
          errorCode: 'VALIDATION.INVALID_DATE_RANGE',
          errorMessage: 'bad range',
          finishedAt: new Date().toISOString(),
          durationMs: 1,
        };
      },
      maxAttempts: 3,
      backoffBaseMs: 1,
      sleep: async () => undefined,
    });

    expect(receipt.status).toBe('FAILED');
    expect(calls).toBe(1);
    expect(lock.releases).toBe(1);
  });
});
