/**
 * Phase 5G (I2) - Missed-schedule detector (pure, no I/O).
 *
 * An expected SCHEDULED run is derived from the cron hour plus a grace
 * period — never an exact second-level cron match. Only evaluated when the
 * scheduler is enabled; a default-off scheduler reports DISABLED elsewhere,
 * never MISSED_SCHEDULE false alarms.
 */

import { LocalDate } from '@atlas/domain';
import { MISSED_SCHEDULE_GRACE_HOURS } from './operational-state';

export interface ScheduledRunRecord {
  readonly triggerType: string;
  readonly targetPeriod: string;
  readonly startedAt: string;
}

export interface MissedSchedule {
  readonly jobType: string;
  readonly expectedDate: string;
  readonly scheduledHour: number;
  readonly reasonCode: 'MISSED_SCHEDULE';
}

/** Cron hour per job type (mirrors INGESTION_CRON_DEFINITIONS). */
export const SCHEDULED_HOUR_BY_JOB: Record<string, number> = {
  MARKET_QUOTES_DAILY: 19,
  BENCHMARK_IBOV_DAILY: 19,
  BENCHMARK_CDI_DAILY: 19,
  FX_USD_BRL_DAILY: 14,
  FX_EUR_BRL_DAILY: 14,
  MACRO_IPCA: 10,
  MACRO_SELIC_TARGET: 10,
  MACRO_SELIC_EFFECTIVE: 19,
  CALENDAR_B3_REFRESH: 6,
  CALENDAR_BANKING_REFRESH: 6,
};

export function isOpenDay(date: LocalDate, openDates: Set<string>): boolean {
  return openDates.has(date.toString());
}

export function detectMissedDailySchedules(input: {
  readonly jobType: string;
  readonly openDates: readonly LocalDate[];
  readonly runs: readonly ScheduledRunRecord[];
  readonly nowIso: string;
  readonly schedulerEnabled: boolean;
}): MissedSchedule[] {
  if (!input.schedulerEnabled) return [];
  const hour = SCHEDULED_HOUR_BY_JOB[input.jobType] ?? 19;
  const now = new Date(input.nowIso).getTime();
  const scheduledByPeriod = new Set(
    input.runs.filter((r) => r.triggerType === 'SCHEDULED').map((r) => r.targetPeriod),
  );
  const missed: MissedSchedule[] = [];
  for (const date of input.openDates) {
    const scheduledAt = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0);
    if (now - scheduledAt < MISSED_SCHEDULE_GRACE_HOURS * 3_600_000) continue;
    if (!scheduledByPeriod.has(date.toString())) {
      missed.push({ jobType: input.jobType, expectedDate: date.toString(), scheduledHour: hour, reasonCode: 'MISSED_SCHEDULE' });
    }
  }
  return missed;
}
