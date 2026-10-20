/**
 * Phase 5G (I1) - Canonical operational state model.
 *
 * Operational state describes the health of ingestion/backfill workflows. It
 * never confuses a single job run status (SUCCESS) with business freshness
 * (data too old => STALE). All timestamps are ISO strings; all dates civil.
 */

export const OPERATIONAL_STATES = [
  'HEALTHY',
  'DEGRADED',
  'STALE',
  'FAILED',
  'UNKNOWN',
  'DISABLED',
] as const;

export type OperationalState = (typeof OPERATIONAL_STATES)[number];

export const OPERATIONAL_REASON_CODES = [
  'UP_TO_DATE',
  'NO_RUN_HISTORY',
  'LAST_RUN_FAILED',
  'LATEST_DATA_MISSING',
  'CALENDAR_COVERAGE_MISSING',
  'NOT_PUBLISHED_YET',
  'SCHEDULER_DISABLED',
  'MISSED_SCHEDULE',
  'PROVIDER_FAILURE',
  'PARTIAL_RUN',
  'STALE_RUNNING_JOB',
  'UNKNOWN',
] as const;

export type OperationalReasonCode = (typeof OPERATIONAL_REASON_CODES)[number];

export type DataFamily =
  | 'MARKET_QUOTES'
  | 'IBOV'
  | 'CDI'
  | 'USD_BRL'
  | 'EUR_BRL'
  | 'IPCA'
  | 'SELIC_TARGET'
  | 'SELIC_EFFECTIVE'
  | 'B3_CALENDAR'
  | 'BANKING_CALENDAR';

export interface OperationalFreshnessStatus {
  readonly source: DataFamily;
  readonly state: OperationalState;
  /** Latest civil period expected to have persisted data (null when not applicable). */
  readonly expectedThrough: string | null;
  /** Latest civil period actually persisted (null when nothing persisted). */
  readonly actualThrough: string | null;
  /** Open sessions missing between actual (exclusive) and expected (inclusive). */
  readonly lagPeriods: number | null;
  readonly lastSuccessAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastJobStatus: string | null;
  readonly reasonCode: OperationalReasonCode;
}

/** Cutoff hour (America/Sao_Paulo) after which today's session data is expected. */
export const FRESHNESS_CUTOFF_HOUR_DEFAULT = 20;
export const FRESHNESS_CUTOFF_HOUR_FX = 15;

/** Daily-family lag thresholds (open periods). */
export const DAILY_LAG_DEGRADED_MAX = 2;
export const DAILY_LAG_STALE_MAX = 5;

/** Monthly (IPCA) lag thresholds (months). */
export const IPCA_PUBLICATION_DAY = 12;

/** Large-plan style guard reused for operations reads (bounded history). */
export const OPERATIONS_RECENT_RUN_LIMIT = 200;
export const OPERATIONS_HISTORY_LOOKBACK_DAYS = 7;

/** Stale RUNNING lease (matches Phase 5E STALE_RUN_TTL_MS). */
export const STALE_RUNNING_THRESHOLD_MS = 60 * 60 * 1000;

/** Missed-schedule grace after the cron hour. */
export const MISSED_SCHEDULE_GRACE_HOURS = 3;

export const ALERT_TYPES = [
  'INGESTION_FAILED',
  'INGESTION_PARTIAL',
  'MISSED_SCHEDULE',
  'DATA_STALE',
  'CALENDAR_COVERAGE_LOW',
  'REPEATED_PROVIDER_FAILURE',
  'STALE_RUNNING_JOB',
  'BACKFILL_INCOMPLETE',
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['ACTIVE', 'RESOLVED'] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];

export function buildAlertDedupeKey(alertType: string, source: string): string {
  return `${alertType}:${source}`;
}
