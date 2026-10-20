/**
 * Phase 5E (R3-B) - Ingestion job handler contracts and shared result helpers.
 */

import { LocalDate } from '@atlas/domain';
import {
  failedResultFromError,
  IngestionJobType,
  JobExecutionContext,
  JobExecutionResult,
  JobStatus,
} from '../job-types';

export interface IngestionJobHandler {
  readonly jobType: IngestionJobType;
  execute(ctx: JobExecutionContext): Promise<JobExecutionResult>;
}

export function skippedResult(
  status: Extract<JobStatus, `SKIPPED${string}`>,
  reason: string,
  options: { provider?: string; target?: string } = {},
): JobExecutionResult {
  const now = new Date().toISOString();
  return {
    status,
    itemsFailed: 0,
    finishedAt: now,
    durationMs: 0,
    errorCode: status,
    errorMessage: reason,
    provider: options.provider,
    target: options.target,
    metadata: { reason },
  };
}

export function completedResult(
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  options: {
    itemsRequested?: number;
    itemsFetched?: number;
    itemsInserted?: number;
    itemsRevised?: number;
    itemsUnchanged?: number;
    itemsFailed?: number;
    provider?: string;
    target?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, string | number | boolean | null>;
  } = {},
): JobExecutionResult {
  const now = new Date().toISOString();
  return {
    status,
    itemsRequested: options.itemsRequested,
    itemsFetched: options.itemsFetched,
    itemsInserted: options.itemsInserted,
    itemsRevised: options.itemsRevised,
    itemsUnchanged: options.itemsUnchanged,
    itemsFailed: options.itemsFailed ?? 0,
    provider: options.provider,
    target: options.target,
    errorCode: options.errorCode,
    errorMessage: options.errorMessage,
    metadata: options.metadata,
    finishedAt: now,
    durationMs: 0,
  };
}

export function failureResult(
  ctx: JobExecutionContext,
  error: unknown,
  fallbackCode: string,
): JobExecutionResult {
  const mapped = failedResultFromError(error, ctx.startedAt);
  return {
    ...mapped,
    errorCode: mapped.errorCode === 'EXECUTION.UNEXPECTED_ERROR' ? fallbackCode : mapped.errorCode,
  };
}

/** Resolves the target business date for daily jobs (DAY YYYY-MM-DD). */
export function civilDateFromContext(ctx: JobExecutionContext): LocalDate {
  return LocalDate.from(ctx.targetPeriod);
}

/** Adds (or subtracts) civil days without timezone drift. */
export function shiftCivilDate(date: LocalDate, days: number): LocalDate {
  const utc = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000;
  const shifted = new Date(utc);
  return LocalDate.fromParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function lastDayOfMonth(year: number, month: number): LocalDate {
  const date = new Date(Date.UTC(year, month, 0));
  return LocalDate.fromParts(year, month, date.getUTCDate());
}
