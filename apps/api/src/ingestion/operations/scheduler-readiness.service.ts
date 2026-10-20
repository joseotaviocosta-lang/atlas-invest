/**
 * Phase 5G (I4) - Scheduler readiness gate (fail-closed, persisted-only).
 *
 * Checked before the local scheduler registers any cron task when
 * INGESTION_SCHEDULER_ENABLED=true. Never auto-enables anything; reports
 * NOT_READY with reason codes instead. NODE_ENV=test always resolves
 * NOT_READY (forced off) without touching providers.
 */

import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { ICalendarRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { CALENDAR_REPOSITORY } from '../../database/tokens';
import {
  IIngestionScheduler,
  INGESTION_CRON_DEFINITIONS,
  INGESTION_SCHEDULER_TIMEZONE,
} from '../scheduler/ingestion-scheduler';
import { INGESTION_SCHEDULER } from '../tokens';

type PrismaLikeClient = ReturnType<typeof getPrismaClient>;

export interface ReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly reasonCode: string;
  readonly detail?: string;
}

export interface SchedulerReadiness {
  readonly ready: boolean;
  readonly checks: ReadinessCheck[];
}

function requiredEnvPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

@Injectable()
export class SchedulerReadinessService {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: Pick<ICalendarRepository, 'getCoverage'>,
    @Inject(INGESTION_SCHEDULER)
    private readonly scheduler: IIngestionScheduler,
  ) {}

  async check(nowIso: string = new Date().toISOString()): Promise<SchedulerReadiness> {
    const checks: ReadinessCheck[] = [];
    void nowIso;

    const flag = process.env.INGESTION_SCHEDULER_ENABLED === 'true';
    checks.push({
      name: 'scheduler-flag-explicit',
      pass: flag,
      reasonCode: flag ? 'UP_TO_DATE' : 'SCHEDULER_DISABLED',
      detail: flag ? 'INGESTION_SCHEDULER_ENABLED=true' : 'INGESTION_SCHEDULER_ENABLED is not true',
    });

    if (process.env.NODE_ENV === 'test') {
      checks.push({ name: 'test-env-forced-off', pass: false, reasonCode: 'SCHEDULER_DISABLED', detail: 'NODE_ENV=test never auto-starts' });
      return { ready: false, checks };
    }

    checks.push({
      name: 'database-url-present',
      pass: requiredEnvPresent('DATABASE_URL'),
      reasonCode: requiredEnvPresent('DATABASE_URL') ? 'UP_TO_DATE' : 'UNKNOWN',
      detail: 'DATABASE_URL configured',
    });

    const allowlist = (process.env.INGESTION_OPERATOR_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    checks.push({
      name: 'operator-allowlist-configured',
      pass: allowlist.length > 0,
      reasonCode: allowlist.length > 0 ? 'UP_TO_DATE' : 'UNKNOWN',
      detail: `${allowlist.length} operator(s) allowlisted`,
    });

    checks.push({
      name: 'timezone-america-sao-paulo',
      pass: INGESTION_SCHEDULER_TIMEZONE === 'America/Sao_Paulo',
      reasonCode: 'UP_TO_DATE',
    });

    const jobTypes = new Set(INGESTION_CRON_DEFINITIONS.map((d) => d.jobType));
    const allTz = INGESTION_CRON_DEFINITIONS.every((d) => d.timezone === 'America/Sao_Paulo');
    checks.push({
      name: 'ten-definitions-once',
      pass: INGESTION_CRON_DEFINITIONS.length === 10 && jobTypes.size === 10 && allTz,
      reasonCode: INGESTION_CRON_DEFINITIONS.length === 10 && jobTypes.size === 10 ? 'UP_TO_DATE' : 'UNKNOWN',
      detail: `${INGESTION_CRON_DEFINITIONS.length} definitions`,
    });

    checks.push({
      name: 'scheduler-not-already-running',
      pass: !this.scheduler.isRunning(),
      reasonCode: !this.scheduler.isRunning() ? 'UP_TO_DATE' : 'UNKNOWN',
      detail: this.scheduler.isRunning() ? 'already running' : 'stopped',
    });

    const today = LocalDate.from(nowIso.slice(0, 10));
    try {
      const prisma: PrismaLikeClient = getPrismaClient();
      await prisma.$queryRawUnsafe('SELECT 1');
      checks.push({ name: 'database-reachable', pass: true, reasonCode: 'UP_TO_DATE' });
    } catch {
      checks.push({ name: 'database-reachable', pass: false, reasonCode: 'DB_FAILURE' });
    }

    try {
      const tables = await (getPrismaClient().$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename IN ('ingestion_job_runs','operational_alert_events')`,
      ) as Promise<Array<{ name: string }>>);
      const names = new Set(tables.map((t) => t.name));
      const ok = names.has('ingestion_job_runs') && names.has('operational_alert_events');
      checks.push({ name: 'migrations-current', pass: ok, reasonCode: ok ? 'UP_TO_DATE' : 'UNKNOWN' });
    } catch {
      checks.push({ name: 'migrations-current', pass: false, reasonCode: 'DB_FAILURE' });
    }

    try {
      const coverage = await this.calendars.getCoverage('B3_TRADING' as never);
      const yearStart = LocalDate.fromParts(today.year, 1, 1).toString();
      const ok = !!coverage.minDate && !!coverage.maxDate && coverage.minDate.toString() <= yearStart;
      checks.push({ name: 'calendar-coverage-sufficient', pass: ok, reasonCode: ok ? 'UP_TO_DATE' : 'CALENDAR_COVERAGE_MISSING' });
    } catch {
      checks.push({ name: 'calendar-coverage-sufficient', pass: false, reasonCode: 'CALENDAR_COVERAGE_MISSING' });
    }

    const providers = ['MARKET_DATA_PROVIDER', 'BENCHMARK_DATA_PROVIDER', 'RATE_BENCHMARK_DATA_PROVIDER'];
    const missing = providers.filter((name) => !requiredEnvPresent(name));
    checks.push({
      name: 'providers-configured',
      pass: true,
      reasonCode: 'UP_TO_DATE',
      detail: missing.length === 0 ? 'all provider envs present' : `optional missing: ${missing.join(',')}`,
    });

    return { ready: checks.every((c) => c.pass), checks };
  }
}
