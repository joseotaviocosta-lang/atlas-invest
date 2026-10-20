/**
 * Phase 5F (I1) - Coverage-driven backfill orchestration contracts.
 *
 * Frozen Phase 5E primitives are reused unchanged:
 * - 10 canonical job types, DAY/MONTH/YEAR targetPeriod contract,
 * - logicalJobKey = jobType + targetPeriod (attempt excluded),
 * - PostgreSQL advisory lock, bounded retry, idempotent upserts.
 *
 * Backfill adds no new job types and no migration. Each eligible single
 * period executes through the existing `IngestionJobService` with trigger
 * `BACKFILL` (first attempt; retries become `RETRY`). The parent
 * `BackfillExecutionReceipt` is an in-memory aggregation (not persisted);
 * every child run is persisted in `ingestion_job_runs` and auditable via
 * the existing admin history endpoints.
 */

import { IngestionJobType } from '../job-types';

export const BACKFILL_DOMAINS = [
  'MARKET_QUOTES',
  'BENCHMARK_IBOV',
  'BENCHMARK_CDI',
  'FX_USD_BRL',
  'FX_EUR_BRL',
  'MACRO_IPCA',
  'MACRO_SELIC_TARGET',
  'MACRO_SELIC_EFFECTIVE',
  'CALENDAR_B3',
  'CALENDAR_BANKING',
] as const;

export type BackfillDomain = (typeof BACKFILL_DOMAINS)[number];

export const BACKFILL_JOB_TYPE_BY_DOMAIN: Record<BackfillDomain, IngestionJobType> = {
  MARKET_QUOTES: 'MARKET_QUOTES_DAILY',
  BENCHMARK_IBOV: 'BENCHMARK_IBOV_DAILY',
  BENCHMARK_CDI: 'BENCHMARK_CDI_DAILY',
  FX_USD_BRL: 'FX_USD_BRL_DAILY',
  FX_EUR_BRL: 'FX_EUR_BRL_DAILY',
  MACRO_IPCA: 'MACRO_IPCA',
  MACRO_SELIC_TARGET: 'MACRO_SELIC_TARGET',
  MACRO_SELIC_EFFECTIVE: 'MACRO_SELIC_EFFECTIVE',
  CALENDAR_B3: 'CALENDAR_B3_REFRESH',
  CALENDAR_BANKING: 'CALENDAR_BANKING_REFRESH',
};

export type BackfillCoverageState =
  'COVERED' | 'BACKFILL_REQUIRED' | 'BACKFILL_NOT_REQUIRED' | 'BACKFILL_BLOCKED_BY_CALENDAR';

/** Canonical skipped reasons (persisted-data only, never provider-inferred). */
export type BackfillSkipReason =
  | 'CLOSED_DAY'
  | 'NOT_PUBLISHED_YET'
  | 'CALENDAR_COVERAGE_MISSING'
  | 'ALREADY_COVERED'
  | 'RANGE_CAP_EXCEEDED'
  | 'OUT_OF_BOUNDS';

export interface BackfillSkippedPeriod {
  readonly targetPeriod: string;
  readonly reason: BackfillSkipReason;
  readonly detail?: string;
}

/** Bounded eligible window after gap compaction (civil dates/periods). */
export interface BackfillWindow {
  /** First eligible targetPeriod in the window. */
  readonly from: string;
  /** Last eligible targetPeriod in the window. */
  readonly to: string;
  /** Eligible single periods covered by this window (ascending). */
  readonly periods: readonly string[];
}

export interface BackfillPlan {
  readonly domain: BackfillDomain;
  readonly jobType: IngestionJobType;
  /** Requested range as received (civil dates; IPCA accepts YYYY-MM bounds). */
  readonly requestedRange: { readonly from: string; readonly to: string };
  /** Compacted eligible windows (bounded). */
  readonly eligibleWindows: readonly BackfillWindow[];
  /** Flat eligible single periods (ascending, deduplicated). */
  readonly eligiblePeriods: readonly string[];
  readonly skippedPeriods: readonly BackfillSkippedPeriod[];
  readonly estimatedProviderCalls: number;
  readonly requiresConfirmation: boolean;
}

export interface BackfillWindowResult {
  readonly window: BackfillWindow;
  readonly status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED_LOCKED';
  readonly childRunIds: readonly string[];
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly failed: number;
}

export interface BackfillExecutionReceipt {
  readonly executionId: string;
  readonly domain: BackfillDomain;
  readonly jobType: IngestionJobType;
  readonly requestedRange: { readonly from: string; readonly to: string };
  readonly triggerType: 'BACKFILL';
  readonly windowsPlanned: number;
  readonly windowsCompleted: number;
  readonly windowsFailed: number;
  readonly periodsEligible: number;
  readonly periodsSucceeded: number;
  readonly periodsFailed: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly remainingGaps: number;
  readonly status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED_LOCKED';
  readonly childRunIds: readonly string[];
  readonly windows: readonly BackfillWindowResult[];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

/** Hard per-execution bounds (operator safety; stricter provider caps still apply). */
export const BACKFILL_MAX_WINDOWS_PER_EXECUTION = 40;
export const BACKFILL_MAX_PERIODS_PER_EXECUTION = 366;
export const BACKFILL_MAX_RANGES: Record<BackfillDomain, { readonly maxDays: number }> = {
  MARKET_QUOTES: { maxDays: 90 },
  BENCHMARK_IBOV: { maxDays: 366 },
  BENCHMARK_CDI: { maxDays: 366 },
  FX_USD_BRL: { maxDays: 366 },
  FX_EUR_BRL: { maxDays: 366 },
  MACRO_IPCA: { maxDays: 744 },
  MACRO_SELIC_TARGET: { maxDays: 366 },
  MACRO_SELIC_EFFECTIVE: { maxDays: 366 },
  CALENDAR_B3: { maxDays: 366 },
  CALENDAR_BANKING: { maxDays: 366 },
};

/** Plans larger than this require explicit `confirmLargeBackfill: true`. */
export const BACKFILL_LARGE_PLAN_PERIODS = 90;

export function assertValidBackfillDomain(value: string): BackfillDomain {
  if ((BACKFILL_DOMAINS as readonly string[]).includes(value)) {
    return value as BackfillDomain;
  }
  throw new Error(
    `Invalid backfill domain '${value}'. Valid domains: ${BACKFILL_DOMAINS.join(', ')}`,
  );
}
