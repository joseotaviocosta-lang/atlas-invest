/**
 * Phase 5P-A — background job execution model (pure, zero I/O).
 *
 * Three concepts stay strictly separate:
 * - Schedule: future intent (what to sync, on which cadence).
 * - Job: one attempt at a scheduled occurrence (worker execution state).
 * - IntegrationRun: the executed sync result (created by 5P-PRE).
 *
 * Delivery is at-least-once by design: the persisted pipeline underneath
 * (unique external ids, idempotent confirm) makes re-execution safe.
 * No distributed exactly-once is promised.
 */

export const INTEGRATION_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type IntegrationJobStatus = (typeof INTEGRATION_JOB_STATUSES)[number];

const TERMINAL_JOB_STATUSES: ReadonlySet<IntegrationJobStatus> = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export function isTerminalJobStatus(status: IntegrationJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

/** Bounded retry budget for execution-level failures (distinct from HTTP retries). */
export const MAX_JOB_ATTEMPTS = 3;

/**
 * Stale RUNNING lease: a RUNNING job whose heartbeat (startedAt) is older
 * than this is recoverable by another worker (crashed-process recovery).
 * Never leaves a job stuck forever.
 */
export const STALE_RUNNING_LEASE_MS = 60 * 60 * 1000;

const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

/**
 * Deterministic exponential backoff: 60s, 120s, capped at 15min.
 * Pure and testable — no jitter, no timers, no hidden clock.
 */
export function computeRetryNotBefore(failedAt: Date, failedAttempt: number): Date {
  const delay = Math.min(MAX_RETRY_DELAY_MS, 60 * 1000 * 2 ** Math.max(0, failedAttempt - 1));
  return new Date(failedAt.getTime() + delay);
}

export function attemptsExhausted(attempt: number): boolean {
  return attempt >= MAX_JOB_ATTEMPTS;
}
