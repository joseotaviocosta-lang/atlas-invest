import { B3TransportError } from './errors';

/**
 * Phase 5O-B — bounded retry policy.
 *
 * Retryable: timeouts, connection resets (surfaced as UPSTREAM_UNAVAILABLE
 * without a status), 429 when permitted, 502/503/504. Never retried: 400,
 * persistent 401, 403, revoked consent, schema mismatches, certificate and
 * configuration errors. Backoff is deterministic (testable, no random
 * jitter) and the loop is strictly bounded — no infinite retries.
 */
export interface B3RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_B3_RETRY_POLICY: B3RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
};

const RETRYABLE_CODES = new Set(['RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE']);

export function isRetryableB3Error(error: unknown): boolean {
  return error instanceof B3TransportError && RETRYABLE_CODES.has(error.code);
}

/** Deterministic exponential backoff: base * 2^(attempt-1), capped. */
export function backoffDelayMs(attempt: number, policy: B3RetryPolicy): number {
  if (attempt < 1) return 0;
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
}

export interface B3RetryOutcome<T> {
  result: T;
  attempts: number;
}

/**
 * Runs `operation` until success, a non-retryable error, or attempt
 * exhaustion. `onDelay` receives each computed backoff (injectable sleep in
 * tests; defaults to a real timer). Server-advertised `retryAfterMs` wins
 * over the computed backoff when present.
 */
export async function withB3Retry<T>(
  policy: B3RetryPolicy,
  operation: (attempt: number) => Promise<T>,
  onDelay: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    }),
): Promise<B3RetryOutcome<T>> {
  const maxAttempts = Math.min(10, Math.max(1, Math.floor(policy.maxAttempts)));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableB3Error(error);
      if (!retryable || attempt === maxAttempts) break;
      const advertised =
        error instanceof B3TransportError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : null;
      const delay = advertised ?? backoffDelayMs(attempt, policy);
      await onDelay(Math.min(policy.maxDelayMs, Math.max(0, delay)));
    }
  }
  throw lastError;
}
