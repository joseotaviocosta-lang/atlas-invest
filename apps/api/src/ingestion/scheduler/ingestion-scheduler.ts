/**
 * Phase 5E (R3-B) - Vendor-neutral scheduler contract and schedule policy.
 *
 * Business schedules are expressed in America/Sao_Paulo. The core ingestion
 * module never imports node-cron; only the local adapter does.
 */

import { IngestionJobType } from '../job-types';

export const INGESTION_SCHEDULER_TIMEZONE = 'America/Sao_Paulo';

export interface IngestionCronDefinition {
  readonly jobType: IngestionJobType;
  readonly expression: string;
  readonly timezone: string;
}

/**
 * Baseline schedules approved for Phase 5E.
 *
 * Market/benchmark/FX/macro use the provider's civil-date publication window;
 * calendar refresh runs on Jan 1 and always ensures current + next year.
 */
export const INGESTION_CRON_DEFINITIONS: readonly IngestionCronDefinition[] = Object.freeze([
  {
    jobType: 'MARKET_QUOTES_DAILY',
    expression: '0 19 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'BENCHMARK_IBOV_DAILY',
    expression: '0 19 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'BENCHMARK_CDI_DAILY',
    expression: '0 19 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'FX_USD_BRL_DAILY',
    expression: '0 14 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'FX_EUR_BRL_DAILY',
    expression: '0 14 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  { jobType: 'MACRO_IPCA', expression: '0 10 8-12 * *', timezone: INGESTION_SCHEDULER_TIMEZONE },
  {
    jobType: 'MACRO_SELIC_TARGET',
    expression: '0 10 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'MACRO_SELIC_EFFECTIVE',
    expression: '0 19 * * 1-5',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'CALENDAR_B3_REFRESH',
    expression: '0 6 1 1 *',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
  {
    jobType: 'CALENDAR_BANKING_REFRESH',
    expression: '0 6 1 1 *',
    timezone: INGESTION_SCHEDULER_TIMEZONE,
  },
]);

export interface IIngestionScheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/** Scheduler is default-off; NODE_ENV=test never auto-starts it. */
export function isIngestionSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INGESTION_SCHEDULER_ENABLED === 'true' && env.NODE_ENV !== 'test';
}

/** Resolves the canonical civil date in São Paulo (never server-local time). */
export function civilDateInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INGESTION_SCHEDULER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Unable to resolve São Paulo civil date');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Logical period for a job type:
 *   daily jobs  -> YYYY-MM-DD
 *   MACRO_IPCA  -> YYYY-MM
 *   calendars   -> YYYY
 */
export function resolveScheduledPeriod(jobType: IngestionJobType, civilDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) {
    throw new Error(`Invalid civil date '${civilDate}'. Expected YYYY-MM-DD.`);
  }
  if (jobType === 'MACRO_IPCA') return civilDate.slice(0, 7);
  if (jobType === 'CALENDAR_B3_REFRESH' || jobType === 'CALENDAR_BANKING_REFRESH') {
    return civilDate.slice(0, 4);
  }
  return civilDate;
}
