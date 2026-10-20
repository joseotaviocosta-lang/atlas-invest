/**
 * Phase 5G (I2) - Operations summary service (persisted-only, no providers).
 *
 * Aggregates scheduler state, per-source freshness, active issues, latest
 * runs, missed schedules and coverage warnings into one operator view.
 * Alert detection runs here (writes alert events); every other read is pure.
 */

import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { ICalendarRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { IJobRepository, ListRunsInput } from '../job-repository';
import { INGESTION_JOB_REPOSITORY } from '../tokens';
import { CALENDAR_REPOSITORY } from '../../database/tokens';
import {
  INGESTION_CRON_DEFINITIONS,
  isIngestionSchedulerEnabled,
} from '../scheduler/ingestion-scheduler';
import { DataFreshnessService } from './freshness-service';
import { detectMissedDailySchedules } from './missed-schedule';
import {
  DetectedCondition,
  OperationalAlertDetector,
  OperationalAlertRow,
} from './operational-alerts';
import {
  OPERATIONS_HISTORY_LOOKBACK_DAYS,
  OPERATIONS_RECENT_RUN_LIMIT,
  OperationalFreshnessStatus,
  STALE_RUNNING_THRESHOLD_MS,
} from './operational-state';

type PrismaLikeClient = ReturnType<typeof getPrismaClient>;

export interface OperationsIssue {
  readonly severity: 'CRITICAL' | 'WARNING' | 'INFO';
  readonly code: string;
  readonly source: string;
  readonly detail: string;
}

export interface OperationsLatestRun {
  readonly jobRunId: string;
  readonly jobType: string;
  readonly triggerType: string;
  readonly targetPeriod: string;
  readonly status: string;
  readonly attempt: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly errorCode?: string;
}

export interface OperationsDataStatus {
  readonly overall: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'FAILED' | 'UNKNOWN' | 'DISABLED';
  readonly scheduler: { readonly enabled: boolean; readonly running: boolean };
  readonly sources: OperationalFreshnessStatus[];
  readonly issues: OperationsIssue[];
  readonly latestRuns: OperationsLatestRun[];
  readonly missedSchedules: Array<{ jobType: string; expectedDate: string; scheduledHour: number }>;
  readonly activeAlerts: OperationalAlertRow[];
  readonly generatedAt: string;
}

export interface OperationsMetrics {
  readonly windowDays: number;
  readonly runsTotal: number;
  readonly byStatus: Record<string, number>;
  readonly byTrigger: Record<string, number>;
  readonly providerFailuresTotal: number;
  readonly retryAttemptsTotal: number;
  readonly backfillRunsTotal: number;
  readonly jobsSkippedTotal: number;
  readonly jobsLockedTotal: number;
  readonly avgDurationMs: number | null;
  readonly dataLagPeriods: Record<string, number | null>;
}

const FAMILIES = [
  { source: 'MARKET_QUOTES', jobType: 'MARKET_QUOTES_DAILY' },
  { source: 'IBOV', jobType: 'BENCHMARK_IBOV_DAILY' },
  { source: 'CDI', jobType: 'BENCHMARK_CDI_DAILY' },
  { source: 'USD_BRL', jobType: 'FX_USD_BRL_DAILY' },
  { source: 'EUR_BRL', jobType: 'FX_EUR_BRL_DAILY' },
  { source: 'IPCA', jobType: 'MACRO_IPCA' },
  { source: 'SELIC_TARGET', jobType: 'MACRO_SELIC_TARGET' },
  { source: 'SELIC_EFFECTIVE', jobType: 'MACRO_SELIC_EFFECTIVE' },
  { source: 'B3_CALENDAR', jobType: 'CALENDAR_B3_REFRESH' },
  { source: 'BANKING_CALENDAR', jobType: 'CALENDAR_BANKING_REFRESH' },
] as const;

@Injectable()
export class OperationsSummaryService {
  constructor(
    @Inject(DataFreshnessService)
    private readonly freshness: DataFreshnessService,
    @Inject(OperationalAlertDetector)
    private readonly detector: OperationalAlertDetector,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly runs: IJobRepository,
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
  ) {}

  async getDataStatus(nowIso: string = new Date().toISOString()): Promise<OperationsDataStatus> {
    const generatedAt = new Date().toISOString();
    const sources: OperationalFreshnessStatus[] = [];
    for (const family of FAMILIES) {
      sources.push(
        await this.freshness.evaluateFamily(family.source as never, family.jobType, nowIso),
      );
    }

    const page = await this.runs.listRuns({ limit: OPERATIONS_RECENT_RUN_LIMIT } as ListRunsInput);
    const latestRuns: OperationsLatestRun[] = page.items.slice(0, 60).map((r) => ({
      jobRunId: r.jobRunId,
      jobType: r.jobType,
      triggerType: r.triggerType,
      targetPeriod: r.targetPeriod,
      status: r.status,
      attempt: r.attempt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      errorCode: r.errorCode,
    }));

    const missed = await this.detectMissed(nowIso, page.items);
    const staleRunning = this.findStaleRunning(page.items, nowIso);
    const retryExhausted = page.items
      .filter((r) => r.status === 'FAILED' && r.attempt >= 3)
      .slice(0, 5)
      .map((r) => ({ jobType: r.jobType }));
    const conditions = this.buildConditions(sources, latestRuns, missed, staleRunning, page.items);
    const activeAlerts = await this.detector.reconcile(conditions, generatedAt);
    const issues = this.buildIssues(sources, missed, latestRuns, staleRunning, retryExhausted);

    return {
      overall: this.overallState(issues),
      scheduler: { enabled: isIngestionSchedulerEnabled(), running: false },
      sources,
      issues,
      latestRuns: latestRuns.slice(0, 20),
      missedSchedules: missed,
      activeAlerts,
      generatedAt,
    };
  }

  async getJobsHealth(nowIso: string = new Date().toISOString()): Promise<{
    recentFailures: Array<{
      jobRunId: string;
      jobType: string;
      status: string;
      errorCode?: string;
      finishedAt: string;
    }>;
    staleRunning: Array<{ jobRunId: string; jobType: string; startedAt: string }>;
    retryExhausted: Array<{ jobRunId: string; jobType: string; attempt: number }>;
    missedSchedules: Array<{ jobType: string; expectedDate: string; scheduledHour: number }>;
    partialRuns: Array<{ jobRunId: string; jobType: string; finishedAt: string }>;
  }> {
    const page = await this.runs.listRuns({ limit: OPERATIONS_RECENT_RUN_LIMIT } as ListRunsInput);
    const items = page.items;
    const staleCutoff = new Date(nowIso).getTime() - STALE_RUNNING_THRESHOLD_MS;
    return {
      recentFailures: items
        .filter((r) => r.status === 'FAILED')
        .slice(0, 20)
        .map((r) => ({
          jobRunId: r.jobRunId,
          jobType: r.jobType,
          status: r.status,
          errorCode: r.errorCode,
          finishedAt: r.finishedAt,
        })),
      staleRunning: items
        .filter(
          (r) =>
            (r.status === 'RUNNING' || r.status === 'PENDING') &&
            new Date(r.startedAt).getTime() < staleCutoff,
        )
        .map((r) => ({ jobRunId: r.jobRunId, jobType: r.jobType, startedAt: r.startedAt })),
      retryExhausted: items
        .filter((r) => r.status === 'FAILED' && r.attempt >= 3)
        .slice(0, 20)
        .map((r) => ({ jobRunId: r.jobRunId, jobType: r.jobType, attempt: r.attempt })),
      missedSchedules: await this.detectMissed(nowIso, items),
      partialRuns: items
        .filter((r) => r.status === 'PARTIAL')
        .slice(0, 20)
        .map((r) => ({ jobRunId: r.jobRunId, jobType: r.jobType, finishedAt: r.finishedAt })),
    };
  }

  async getMetrics(): Promise<OperationsMetrics> {
    const prisma: PrismaLikeClient = getPrismaClient();
    const cutoff = new Date(
      Date.now() - OPERATIONS_HISTORY_LOOKBACK_DAYS * 86_400_000,
    ).toISOString();
    const byStatus = await prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT status, COUNT(*)::int AS count FROM ingestion_job_runs
       WHERE created_at >= ${cutoff}::timestamptz GROUP BY status`;
    const byTrigger = await prisma.$queryRaw<Array<{ triggerType: string; count: number }>>`
      SELECT trigger_type AS "triggerType", COUNT(*)::int AS count FROM ingestion_job_runs
       WHERE created_at >= ${cutoff}::timestamptz GROUP BY trigger_type`;
    const providerFailures = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM ingestion_job_runs
       WHERE created_at >= ${cutoff}::timestamptz
         AND (error_code LIKE '%PROVIDER%' OR error_code LIKE '%TIMEOUT%' OR error_code LIKE '%RATE_LIMITED%')`;
    const retries = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM ingestion_job_runs
       WHERE created_at >= ${cutoff}::timestamptz AND attempt > 1`;
    const durations = await prisma.$queryRaw<Array<{ avgMs: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::float AS "avgMs"
        FROM ingestion_job_runs
       WHERE created_at >= ${cutoff}::timestamptz AND finished_at IS NOT NULL AND started_at IS NOT NULL`;
    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const row of byStatus) {
      statusMap[row.status] = row.count;
      total += row.count;
    }
    const triggerMap: Record<string, number> = {};
    for (const row of byTrigger) triggerMap[row.triggerType] = row.count;
    return {
      windowDays: OPERATIONS_HISTORY_LOOKBACK_DAYS,
      runsTotal: total,
      byStatus: statusMap,
      byTrigger: triggerMap,
      providerFailuresTotal: providerFailures[0]?.count ?? 0,
      retryAttemptsTotal: retries[0]?.count ?? 0,
      backfillRunsTotal: triggerMap['BACKFILL'] ?? 0,
      jobsSkippedTotal: Object.entries(statusMap)
        .filter(([status]) => status === 'SKIPPED' || status.startsWith('SKIPPED_'))
        .reduce((sum, [, count]) => sum + count, 0),
      jobsLockedTotal: statusMap['SKIPPED_LOCKED'] ?? 0,
      avgDurationMs: durations[0]?.avgMs ?? null,
      dataLagPeriods: {},
    };
  }

  private async detectMissed(
    nowIso: string,
    runs: Array<{ triggerType: string; targetPeriod: string; jobType: string; startedAt: string }>,
  ): Promise<Array<{ jobType: string; expectedDate: string; scheduledHour: number }>> {
    if (!isIngestionSchedulerEnabled()) return [];
    const now = new Date(nowIso);
    const today = LocalDate.from(nowIso.slice(0, 10));
    const missed: Array<{ jobType: string; expectedDate: string; scheduledHour: number }> = [];
    const dailyJobs = INGESTION_CRON_DEFINITIONS.filter(
      (d) =>
        d.expression.startsWith('0 ') &&
        !d.jobType.startsWith('MACRO_IPCA') &&
        !d.jobType.startsWith('CALENDAR'),
    );
    for (const definition of dailyJobs) {
      const calendarType =
        definition.jobType.includes('BANKING') ||
        definition.jobType.includes('CDI') ||
        definition.jobType.includes('FX') ||
        definition.jobType === 'MACRO_SELIC_EFFECTIVE'
          ? 'BANKING'
          : 'B3_TRADING';
      const from = new Date(Date.UTC(today.year, today.month - 1, today.day) - 7 * 86_400_000);
      const fromDate = LocalDate.fromParts(
        from.getUTCFullYear(),
        from.getUTCMonth() + 1,
        from.getUTCDate(),
      );
      const days = await this.calendars.findDays(calendarType as never, fromDate, today);
      const openDates = days.filter((d) => d.isOpen).map((d) => d.date);
      const jobRuns = runs.filter((r) => r.jobType === definition.jobType);
      missed.push(
        ...detectMissedDailySchedules({
          jobType: definition.jobType,
          openDates,
          runs: jobRuns,
          nowIso,
          schedulerEnabled: true,
        }),
      );
    }
    void now;
    return missed;
  }

  private findStaleRunning(
    items: Array<{ status: string; startedAt: string }>,
    nowIso: string,
  ): Array<{ jobType: string; jobRunId: string }> {
    const cutoff = new Date(nowIso).getTime() - STALE_RUNNING_THRESHOLD_MS;
    return (
      items as Array<{ status: string; startedAt: string; jobType: string; jobRunId: string }>
    )
      .filter(
        (r) =>
          (r.status === 'RUNNING' || r.status === 'PENDING') &&
          new Date(r.startedAt).getTime() < cutoff,
      )
      .map((r) => ({ jobType: r.jobType, jobRunId: r.jobRunId }));
  }

  private buildConditions(
    sources: OperationalFreshnessStatus[],
    latestRuns: OperationsLatestRun[],
    missed: Array<{ jobType: string; expectedDate: string }>,
    staleRunning: Array<{ jobType: string; jobRunId: string }>,
    recentItems: Array<{
      status: string;
      errorCode?: string;
      jobType: string;
      triggerType: string;
      attempt: number;
    }>,
  ): DetectedCondition[] {
    void latestRuns;
    const conditions: DetectedCondition[] = [];
    for (const source of sources) {
      if (source.state === 'FAILED' && source.reasonCode !== 'CALENDAR_COVERAGE_MISSING') {
        conditions.push({
          alertType: 'DATA_STALE',
          severity: (source.lagPeriods ?? 0) > 5 ? 'CRITICAL' : 'WARNING',
          source: source.source,
          reasonCode: source.reasonCode,
          metadata: {
            lagPeriods: source.lagPeriods ?? 0,
            expectedThrough: source.expectedThrough ?? '',
          },
        });
      }
      if (source.reasonCode === 'CALENDAR_COVERAGE_MISSING' && source.state !== 'HEALTHY') {
        conditions.push({
          alertType: 'CALENDAR_COVERAGE_LOW',
          severity: 'WARNING',
          source: source.source,
          reasonCode: source.reasonCode,
        });
      }
    }
    const perJobLatest = new Map<string, (typeof recentItems)[number]>();
    for (const item of recentItems) {
      if (!perJobLatest.has(item.jobType)) perJobLatest.set(item.jobType, item);
    }
    for (const [jobType, run] of perJobLatest) {
      if (run.status === 'FAILED') {
        conditions.push({
          alertType: 'INGESTION_FAILED',
          severity: 'WARNING',
          source: jobType,
          reasonCode: 'LAST_RUN_FAILED',
          metadata: { jobType },
        });
      } else if (run.status === 'PARTIAL') {
        conditions.push({
          alertType: 'INGESTION_PARTIAL',
          severity: 'WARNING',
          source: jobType,
          reasonCode: 'PARTIAL_RUN',
          metadata: { jobType },
        });
      }
    }
    for (const miss of missed) {
      conditions.push({
        alertType: 'MISSED_SCHEDULE',
        severity: 'WARNING',
        source: miss.jobType,
        reasonCode: 'MISSED_SCHEDULE',
        metadata: { expectedDate: miss.expectedDate },
      });
    }
    for (const stale of staleRunning) {
      conditions.push({
        alertType: 'STALE_RUNNING_JOB',
        severity: 'WARNING',
        source: stale.jobType,
        reasonCode: 'STALE_RUNNING_JOB',
        metadata: { jobRunId: stale.jobRunId },
      });
    }
    const providerFailures = recentItems.filter(
      (r) =>
        r.status === 'FAILED' &&
        r.errorCode &&
        /PROVIDER|TIMEOUT|RATE_LIMITED|UNAVAILABLE/.test(r.errorCode),
    );
    const byJob = new Map<string, number>();
    for (const failure of providerFailures) {
      byJob.set(failure.jobType, (byJob.get(failure.jobType) ?? 0) + 1);
    }
    for (const [jobType, count] of byJob) {
      if (count >= 3 && perJobLatest.get(jobType)?.status !== 'SUCCESS') {
        conditions.push({
          alertType: 'REPEATED_PROVIDER_FAILURE',
          severity: 'CRITICAL',
          source: jobType,
          reasonCode: 'PROVIDER_FAILURE',
          metadata: { failures: count },
        });
      }
    }
    const backfillFailures = recentItems.filter(
      (r) => r.triggerType === 'BACKFILL' && (r.status === 'FAILED' || r.status === 'PARTIAL'),
    );
    if (backfillFailures.length > 0) {
      conditions.push({
        alertType: 'BACKFILL_INCOMPLETE',
        severity: 'WARNING',
        source: 'BACKFILL',
        reasonCode: 'PARTIAL_RUN',
        metadata: { failures: backfillFailures.length },
      });
    }
    return conditions;
  }

  private buildIssues(
    sources: OperationalFreshnessStatus[],
    missed: Array<{ jobType: string; expectedDate: string }>,
    latestRuns: OperationsLatestRun[],
    staleRunning: Array<{ jobType: string; jobRunId: string }>,
    retryExhausted: Array<{ jobType: string }>,
  ): OperationsIssue[] {
    const issues: OperationsIssue[] = [];
    for (const source of sources) {
      if (source.state === 'FAILED') {
        issues.push({
          severity: 'CRITICAL',
          code: source.reasonCode,
          source: source.source,
          detail: `expected ${source.expectedThrough ?? '?'} actual ${source.actualThrough ?? 'none'}`,
        });
      } else if (source.state === 'STALE' || source.state === 'DEGRADED') {
        issues.push({
          severity: 'WARNING',
          code: source.reasonCode,
          source: source.source,
          detail: `lag ${source.lagPeriods ?? '?'} expected ${source.expectedThrough ?? '?'}`,
        });
      }
    }
    for (const miss of missed) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSED_SCHEDULE',
        source: miss.jobType,
        detail: `expected run for ${miss.expectedDate} missing`,
      });
    }
    for (const run of latestRuns.filter((r) => r.status === 'FAILED').slice(0, 5)) {
      issues.push({
        severity: 'WARNING',
        code: 'LAST_RUN_FAILED',
        source: run.jobType,
        detail: 'latest run failed',
      });
    }
    for (const stale of staleRunning.slice(0, 5)) {
      issues.push({
        severity: 'WARNING',
        code: 'STALE_RUNNING_JOB',
        source: stale.jobType,
        detail: `run ${stale.jobRunId} exceeds stale lease`,
      });
    }
    for (const retry of retryExhausted.slice(0, 5)) {
      issues.push({
        severity: 'WARNING',
        code: 'RETRY_EXHAUSTED',
        source: retry.jobType,
        detail: 'max attempts exhausted without success',
      });
    }
    return issues;
  }

  private overallState(issues: OperationsIssue[]): OperationsDataStatus['overall'] {
    if (issues.some((i) => i.severity === 'CRITICAL')) return 'FAILED';
    if (issues.some((i) => i.code === 'MISSED_SCHEDULE' || i.code === 'LAST_RUN_FAILED'))
      return 'DEGRADED';
    if (issues.some((i) => i.severity === 'WARNING')) return 'STALE';
    return 'HEALTHY';
  }
}
