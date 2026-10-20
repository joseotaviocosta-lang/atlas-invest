/**
 * Phase 5E (R3-A) - Canonical ingestion job contracts.
 *
 * Vendor-neutral and framework-agnostic. No cloud scheduler dependency and no
 * Prisma types leak through this module.
 */

export const INGESTION_JOB_TYPES = [
  'MARKET_QUOTES_DAILY',
  'BENCHMARK_IBOV_DAILY',
  'BENCHMARK_CDI_DAILY',
  'FX_USD_BRL_DAILY',
  'FX_EUR_BRL_DAILY',
  'MACRO_IPCA',
  'MACRO_SELIC_TARGET',
  'MACRO_SELIC_EFFECTIVE',
  'CALENDAR_B3_REFRESH',
  'CALENDAR_BANKING_REFRESH',
] as const;

export type IngestionJobType = (typeof INGESTION_JOB_TYPES)[number];

export const TRIGGER_TYPES = ['SCHEDULED', 'MANUAL', 'RETRY', 'BACKFILL'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED',
  'SKIPPED_LOCKED',
  'SKIPPED_MARKET_CLOSED',
  'SKIPPED_BANKING_CLOSED',
  'SKIPPED_NOT_PUBLISHED_YET',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Terminal statuses that release the logical lock (the runner releases in all paths). */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED',
  'SKIPPED_LOCKED',
  'SKIPPED_MARKET_CLOSED',
  'SKIPPED_BANKING_CLOSED',
  'SKIPPED_NOT_PUBLISHED_YET',
];

/** Statuses that represent an execution that has not finished yet. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['PENDING', 'RUNNING'];

export function isActiveJobStatus(status: string): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(status);
}

export function isTerminalJobStatus(status: string): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

export function assertValidJobType(value: string): IngestionJobType {
  if ((INGESTION_JOB_TYPES as readonly string[]).includes(value)) {
    return value as IngestionJobType;
  }
  throw new Error(
    `Invalid ingestion job type '${value}'. Valid types: ${INGESTION_JOB_TYPES.join(', ')}`,
  );
}

export function assertValidTriggerType(value: string): TriggerType {
  if ((TRIGGER_TYPES as readonly string[]).includes(value)) {
    return value as TriggerType;
  }
  throw new Error(`Invalid trigger type '${value}'. Valid types: ${TRIGGER_TYPES.join(', ')}`);
}

/**
 * Deterministic logical job identity. Attempt is NEVER part of the identity:
 * retries of the same window share one logical key.
 *
 * Examples:
 *   MARKET_QUOTES_DAILY:2026-10-19
 *   BENCHMARK_IBOV_DAILY:2026-10-19
 *   FX_USD_BRL_DAILY:2026-10-19
 *   MACRO_IPCA:2026-09
 *   CALENDAR_B3_REFRESH:2027
 */
export function buildLogicalJobKey(jobType: IngestionJobType, targetPeriod: string): string {
  const period = targetPeriod.trim();
  if (period.length === 0) {
    throw new Error('targetPeriod must not be empty when building a logical job key');
  }
  return `${jobType}:${period}`;
}

/**
 * Phase 5E-H1 - Canonical target-period contract.
 *
 * The logical business window is heterogeneous by job family:
 *   DAY   -> YYYY-MM-DD (7 daily jobs)
 *   MONTH -> YYYY-MM    (MACRO_IPCA)
 *   YEAR  -> YYYY       (2 calendar refresh jobs)
 *
 * `scheduledFor` is the execution civil date (always YYYY-MM-DD in
 * America/Sao_Paulo) and must never be overloaded with the logical period.
 * `targetPeriod` is the canonical business window and the only component of
 * the logical job key besides the job type. Attempt is history metadata only.
 */

export const PERIOD_GRANULARITIES = ['DAY', 'MONTH', 'YEAR'] as const;

export type PeriodGranularity = (typeof PERIOD_GRANULARITIES)[number];

export const PERIOD_GRANULARITY_BY_JOB: Record<IngestionJobType, PeriodGranularity> = {
  MARKET_QUOTES_DAILY: 'DAY',
  BENCHMARK_IBOV_DAILY: 'DAY',
  BENCHMARK_CDI_DAILY: 'DAY',
  FX_USD_BRL_DAILY: 'DAY',
  FX_EUR_BRL_DAILY: 'DAY',
  MACRO_SELIC_TARGET: 'DAY',
  MACRO_SELIC_EFFECTIVE: 'DAY',
  MACRO_IPCA: 'MONTH',
  CALENDAR_B3_REFRESH: 'YEAR',
  CALENDAR_BANKING_REFRESH: 'YEAR',
};

export function getPeriodGranularity(jobType: IngestionJobType): PeriodGranularity {
  return PERIOD_GRANULARITY_BY_JOB[jobType];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/**
 * Validates a canonical target period for the given job type without any
 * PostgreSQL cast. Throws on mismatched granularity, malformed shape, or
 * impossible calendar dates (e.g. 2026-02-30, 2026-13). Never coerces
 * `2026` to `2026-01-01` or `2026-10` to `2026-10-01`.
 */
export function assertValidTargetPeriod(
  jobType: IngestionJobType,
  targetPeriod: string,
): PeriodGranularity {
  const granularity = getPeriodGranularity(jobType);
  const period = targetPeriod.trim();

  if (granularity === 'DAY') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
    if (!match) {
      throw new Error(
        `Invalid DAY target period '${targetPeriod}' for '${jobType}'. Expected YYYY-MM-DD.`,
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1900 || year > 2100 || month < 1 || month > 12) {
      throw new Error(`Invalid DAY target period '${targetPeriod}' for '${jobType}'.`);
    }
    if (day < 1 || day > daysInMonth(year, month)) {
      throw new Error(`Invalid DAY target period '${targetPeriod}' for '${jobType}'.`);
    }
    return granularity;
  }

  if (granularity === 'MONTH') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) {
      throw new Error(
        `Invalid MONTH target period '${targetPeriod}' for '${jobType}'. Expected YYYY-MM.`,
      );
    }
    const year = Number(match[1]);
    if (year < 1900 || year > 2100) {
      throw new Error(`Invalid MONTH target period '${targetPeriod}' for '${jobType}'.`);
    }
    return granularity;
  }

  const yearMatch = /^(\d{4})$/.exec(period);
  if (!yearMatch) {
    throw new Error(
      `Invalid YEAR target period '${targetPeriod}' for '${jobType}'. Expected YYYY.`,
    );
  }
  const year = Number(yearMatch[1]);
  if (year < 1990 || year > 2100) {
    throw new Error(`Invalid YEAR target period '${targetPeriod}' for '${jobType}'.`);
  }
  return granularity;
}

/** Validates an execution civil date (always YYYY-MM-DD, never a period). */
export function assertValidExecutionDate(scheduledFor: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledFor.trim());
  if (!match) {
    throw new Error(`Invalid execution date '${scheduledFor}'. Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) {
    throw new Error(`Invalid execution date '${scheduledFor}'.`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid execution date '${scheduledFor}'.`);
  }
}

/**
 * Derives the PostgreSQL advisory-lock key from the logical job key using
 * 64-bit FNV-1a over the UTF-8 bytes. This is stable across processes, Node
 * versions and database instances. It is a lock identifier only (never a
 * financial value) and avoids collision-prone string truncation.
 *
 * PostgreSQL note: `pg_try_advisory_xact_lock(bigint)` is database-scoped and
 * the transaction owns the lock, so connection loss/crash releases it.
 */
export function deriveAdvisoryLockKey(logicalJobKey: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = Buffer.from(logicalJobKey, 'utf8');
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return BigInt.asIntN(64, hash);
}

/** Stale-run lease: a RUNNING/PENDING run older than this is reapable. */
export const STALE_RUN_TTL_MS = 60 * 60 * 1000;

/** Bounded retry budget for transient provider failures. */
export const MAX_JOB_ATTEMPTS = 3;

/** Base backoff; attempt n waits base * 2^(n-1). Injected sleep keeps tests fast. */
export const RETRY_BACKOFF_BASE_MS = 30_000;

const TRANSIENT_ERROR_CODES: readonly string[] = [
  'MARKET_DATA.TIMEOUT',
  'MARKET_DATA.RATE_LIMITED',
  'MARKET_DATA.PROVIDER_UNAVAILABLE',
  'FX.TIMEOUT',
  'FX.RATE_LIMITED',
  'FX.PROVIDER_UNAVAILABLE',
  'BENCHMARK.TIMEOUT',
  'BENCHMARK.RATE_LIMITED',
  'BENCHMARK.PROVIDER_UNAVAILABLE',
  'MACRO.TIMEOUT',
  'MACRO.RATE_LIMITED',
  'MACRO.PROVIDER_UNAVAILABLE',
  'CALENDAR.PROVIDER_UNAVAILABLE',
  'PROVIDER.TIMEOUT',
  'PROVIDER.RATE_LIMITED',
  'PROVIDER.UNAVAILABLE',
  'EXECUTION.TIMEOUT',
];

const PERMANENT_ERROR_CODES: readonly string[] = [
  'VALIDATION.INVALID_DATE_FORMAT',
  'VALIDATION.INVALID_DATE_RANGE',
  'VALIDATION.RANGE_TOO_LARGE',
  'VALIDATION.INVALID_CALENDAR_TYPE',
  'VALIDATION.INVALID_YEAR',
  'VALIDATION.INVALID_MACRO_SERIES',
  'VALIDATION.INVALID_BENCHMARK_ID',
  'VALIDATION.SAME_CURRENCY_NOT_ALLOWED',
  'VALIDATION.INVALID_JOB_TYPE',
  'MARKET_DATA.SYMBOL_NOT_FOUND',
  'MARKET_DATA.AUTHENTICATION_FAILED',
  'MARKET_DATA.INVALID_RESPONSE',
];

export function isTransientError(errorCode: string | undefined): boolean {
  if (!errorCode) return false;
  return TRANSIENT_ERROR_CODES.includes(errorCode);
}

export function isPermanentError(errorCode: string | undefined): boolean {
  if (!errorCode) return false;
  return PERMANENT_ERROR_CODES.includes(errorCode);
}

/** HTTP statuses that must be retried (HTTP 429/5xx transient provider failures). */
export const TRANSIENT_HTTP_STATUSES: readonly number[] = [429, 500, 502, 503, 504];

export interface JobExecutionContext {
  readonly jobRunId: string;
  readonly logicalJobKey: string;
  readonly jobType: IngestionJobType;
  readonly triggerType: TriggerType;
  /** Canonical logical business window (DAY YYYY-MM-DD, MONTH YYYY-MM, YEAR YYYY). */
  readonly targetPeriod: string;
  readonly targetPeriodGranularity: PeriodGranularity;
  /** Execution civil date in America/Sao_Paulo (always YYYY-MM-DD). Never the period. */
  readonly scheduledFor: string;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface JobExecutionResult {
  readonly status: JobStatus;
  readonly itemsRequested?: number;
  readonly itemsFetched?: number;
  readonly itemsInserted?: number;
  readonly itemsRevised?: number;
  readonly itemsUnchanged?: number;
  readonly itemsFailed?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly provider?: string;
  readonly target?: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

export interface JobReceipt {
  readonly jobRunId: string;
  readonly logicalJobKey: string;
  readonly jobType: IngestionJobType;
  readonly triggerType: TriggerType;
  /** Canonical logical business window (DAY YYYY-MM-DD, MONTH YYYY-MM, YEAR YYYY). */
  readonly targetPeriod: string;
  readonly targetPeriodGranularity: PeriodGranularity;
  /** Execution civil date in America/Sao_Paulo (always YYYY-MM-DD). Never the period. */
  readonly scheduledFor: string;
  readonly attempt: number;
  readonly status: JobStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly itemsRequested?: number;
  readonly itemsFetched?: number;
  readonly itemsInserted?: number;
  readonly itemsRevised?: number;
  readonly itemsUnchanged?: number;
  readonly itemsFailed?: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly provider?: string;
  readonly target?: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

/** Maps an unexpected handler error into a failed result with bounded retry semantics. */
export function failedResultFromError(error: unknown, startedAt: string): JobExecutionResult {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const message = error instanceof Error ? error.message : String(error);

  let code = 'EXECUTION.UNEXPECTED_ERROR';
  let transient = false;

  if (error instanceof Error && error.name === 'AbortError') {
    code = 'EXECUTION.TIMEOUT';
    transient = true;
  } else if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && TRANSIENT_HTTP_STATUSES.includes(status)) {
      code = `PROVIDER.HTTP_${status}`;
      transient = true;
    }
  } else if (/timeout|timed out|unavailable|rate.?limit|ECONNRESET|ETIMEDOUT/i.test(message)) {
    code = 'PROVIDER.UNAVAILABLE';
    transient = true;
  }

  return {
    status: 'FAILED',
    itemsFailed: 1,
    errorCode: code,
    errorMessage: message,
    finishedAt,
    durationMs,
    metadata: { retryable: transient },
  };
}

/** Returns true when the failed result is eligible for another bounded attempt. */
export function shouldRetryResult(result: JobExecutionResult): boolean {
  if (result.status !== 'FAILED') return false;
  if (isTransientError(result.errorCode)) return true;
  if (result.errorCode?.startsWith('PROVIDER.HTTP_')) {
    const status = Number(result.errorCode.slice('PROVIDER.HTTP_'.length));
    return TRANSIENT_HTTP_STATUSES.includes(status);
  }
  return result.metadata?.retryable === true;
}
