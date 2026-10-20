/**
 * Phase 5E (R3-A) - Process-safe PostgreSQL advisory lock.
 *
 * The lock is acquired with `pg_try_advisory_xact_lock(bigint)` inside an
 * interactive Prisma transaction. The transaction stays open for the whole
 * handler execution, so:
 *   - acquisition is atomic (one winner);
 *   - a second instance receives acquisition=false immediately;
 *   - the lock is released when the transaction commits/rolls back;
 *   - a crashed process loses its connection and PostgreSQL releases the lock.
 *
 * No in-memory mutex, no scheduler-process-uniqueness assumption, and no
 * SELECT-then-INSERT race window.
 */

import { Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { deriveAdvisoryLockKey } from './job-types';

type PrismaLikeClient = ReturnType<typeof getPrismaClient>;

/** Upper bound for a single ingestion execution (the advisory lock lives this long). */
export const JOB_LOCK_TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;

export interface JobLockHandle {
  readonly acquired: boolean;
  release(): Promise<void>;
}

export interface IJobLock {
  tryAcquire(logicalJobKey: string): Promise<JobLockHandle>;
}

@Injectable()
export class PrismaJobLock implements IJobLock {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async tryAcquire(logicalJobKey: string): Promise<JobLockHandle> {
    const lockKey = deriveAdvisoryLockKey(logicalJobKey).toString();

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    let readyResolve!: (acquired: boolean) => void;
    const ready = new Promise<boolean>((resolve) => {
      readyResolve = resolve;
    });

    let readySettled = false;
    let transactionError: unknown = null;

    const transactionPromise = this.prisma
      .$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
            SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS acquired`;
          const acquired = rows[0]?.acquired === true;

          if (!readySettled) {
            readySettled = true;
            readyResolve(acquired);
          }

          if (!acquired) return;

          // Hold the transaction (and therefore the advisory lock) until release().
          await gate;
        },
        {
          maxWait: 10_000,
          timeout: JOB_LOCK_TRANSACTION_TIMEOUT_MS,
        },
      )
      .catch((error: unknown) => {
        transactionError = error;
        if (!readySettled) {
          readySettled = true;
          readyResolve(false);
        }
      });

    const acquired = await ready;

    if (!acquired) {
      await transactionPromise;
      if (transactionError) throw transactionError;
      return { acquired: false, release: async () => undefined };
    }

    return {
      acquired: true,
      release: async () => {
        releaseGate();
        await transactionPromise;
        if (transactionError) throw transactionError;
      },
    };
  }
}
