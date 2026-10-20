/**
 * Phase 5G-R1 - Detection contract tests (atlas_test only, fixed clock where used).
 *
 * Proves end-to-end via HTTP + direct repository writes:
 * FAILED/PARTIAL/stale-running/retry-exhaustion detection, provider health +
 * recovery, lock-contention mechanism, scheduler disabled/not-ready/ready,
 * production auto-enable OFF, and full zero-live-read.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession, getTestPrismaClient } from './setup';
import { PrismaJobRepository } from '../../apps/api/src/ingestion/job-repository';
import { PrismaJobLock } from '../../apps/api/src/ingestion/job-lock';
import { JobRunner } from '../../apps/api/src/ingestion/job-runner';
import { isIngestionSchedulerEnabled } from '../../apps/api/src/ingestion/scheduler/ingestion-scheduler';
import { buildAlertDedupeKey } from '../../apps/api/src/ingestion/operations/operational-state';

const OPERATOR_ID = 'f0000000-0000-4000-8000-000000000001';
const prisma = getTestPrismaClient();
const createdKeys: string[] = [];
const createdAlerts: string[] = [];

function core() {
  const repository = new PrismaJobRepository(prisma);
  const lock = new PrismaJobLock(prisma);
  return { repository, lock, runner: new JobRunner(repository, lock) };
}

async function cleanup(): Promise<void> {
  for (const key of createdKeys.splice(0)) {
    await prisma.$executeRawUnsafe(`DELETE FROM ingestion_job_runs WHERE logical_job_key = '${key}'`);
  }
  for (const key of createdAlerts.splice(0)) {
    await prisma.$executeRawUnsafe(`DELETE FROM operational_alert_events WHERE dedupe_key = '${key}'`);
  }
}

describe('5G-R1 detection contracts', () => {
  let app: INestApplication;
  let operatorToken = '';
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
    await prisma.user.upsert({ where: { id: OPERATOR_ID }, update: {}, create: { id: OPERATOR_ID, email: 'r1.operator@atlas.test', name: 'R1', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789' } });
    await prisma.session.deleteMany({ where: { userId: OPERATOR_ID } });
    app = await createTestApp();
    operatorToken = (await createAuthenticatedUserSession(OPERATOR_ID)).token;
  });

  afterAll(async () => {
    await cleanup();
    await closeTestApp();
  });

  it('FAILED run -> DEGRADED + INGESTION_FAILED alert; SUCCESS recovers + resolves', async () => {
    const { runner } = core();
    const key = 'MARKET_QUOTES_DAILY:2026-09-03';
    createdKeys.push(key);
    createdAlerts.push(buildAlertDedupeKey('INGESTION_FAILED', 'MARKET_QUOTES_DAILY'));
    const failing = async () => ({ status: 'FAILED' as const, itemsFailed: 1, errorCode: 'MARKET_DATA.PROVIDER_UNAVAILABLE', errorMessage: 'down', finishedAt: new Date().toISOString(), durationMs: 1 });
    await runner.run({ jobType: 'MARKET_QUOTES_DAILY', triggerType: 'SCHEDULED', targetPeriod: '2026-09-03', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-03', execute: failing, maxAttempts: 1 });
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const status = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(status.body.data.issues.some((i: { code: string }) => i.code === 'LAST_RUN_FAILED')).toBe(true);
    const active = status.body.data.activeAlerts.filter((a: { dedupeKey: string; status: string }) => a.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'MARKET_QUOTES_DAILY'));
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe('ACTIVE');

    const succeeding = async () => ({ status: 'SUCCESS' as const, itemsFailed: 0, finishedAt: new Date().toISOString(), durationMs: 1 });
    await runner.run({ jobType: 'MARKET_QUOTES_DAILY', triggerType: 'MANUAL', targetPeriod: '2026-09-03', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-03', execute: succeeding, maxAttempts: 1 });
    const after = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(after.body.data.activeAlerts.filter((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'MARKET_QUOTES_DAILY'))).toHaveLength(0);
    const history = await request(app.getHttpServer()).get('/api/v1/admin/operations/alerts?limit=50').set(auth).expect(200);
    const resolved = history.body.data.find((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'MARKET_QUOTES_DAILY'));
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedAt).not.toBeNull();
  }, 60000);

  it('PARTIAL run -> INGESTION_PARTIAL alert and non-healthy state', async () => {
    const { runner } = core();
    const key = 'BENCHMARK_IBOV_DAILY:2026-09-04';
    createdKeys.push(key);
    createdAlerts.push(buildAlertDedupeKey('INGESTION_PARTIAL', 'BENCHMARK_IBOV_DAILY'));
    await runner.run({ jobType: 'BENCHMARK_IBOV_DAILY', triggerType: 'SCHEDULED', targetPeriod: '2026-09-04', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-04', execute: async () => ({ status: 'PARTIAL' as const, itemsRequested: 2, itemsFailed: 1, finishedAt: new Date().toISOString(), durationMs: 1 }), maxAttempts: 1 });
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const status = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(status.body.data.overall).not.toBe('HEALTHY');
    expect(status.body.data.activeAlerts.some((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('INGESTION_PARTIAL', 'BENCHMARK_IBOV_DAILY'))).toBe(true);
    await cleanup();
  }, 60000);

  it('retry exhaustion (attempt>=3 FAILED) is explicitly signaled', async () => {
    const { runner } = core();
    const key = 'FX_USD_BRL_DAILY:2026-09-05';
    createdKeys.push(key);
    const failing = async () => ({ status: 'FAILED' as const, itemsFailed: 1, errorCode: 'VALIDATION.INVALID_DATE_RANGE', errorMessage: 'bad', finishedAt: new Date().toISOString(), durationMs: 1 });
    for (let i = 0; i < 3; i += 1) {
      await runner.run({ jobType: 'FX_USD_BRL_DAILY', triggerType: i === 0 ? 'SCHEDULED' : 'MANUAL', targetPeriod: '2026-09-05', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-05', execute: failing, maxAttempts: 1 });
    }
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const health = await request(app.getHttpServer()).get('/api/v1/admin/operations/jobs/health').set(auth).expect(200);
    expect(health.body.data.retryExhausted.some((r: { jobRunId: string }) => r.jobRunId)).toBe(true);
    const status = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(status.body.data.issues.some((issue: { code: string }) => issue.code === 'RETRY_EXHAUSTED')).toBe(true);
    await cleanup();
  }, 60000);

  it('stale RUNNING (>1h) detected without provider calls', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const { repository } = core();
    const key = 'CALENDAR_B3_REFRESH:2031';
    createdKeys.push(key);
    createdAlerts.push(buildAlertDedupeKey('STALE_RUNNING_JOB', 'CALENDAR_B3_REFRESH'));
    await repository.createRun({
      logicalJobKey: key, jobType: 'CALENDAR_B3_REFRESH', triggerType: 'SCHEDULED',
      targetPeriod: '2031', targetPeriodGranularity: 'YEAR', scheduledFor: '2026-09-01',
      attempt: 1, startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const health = await request(app.getHttpServer()).get('/api/v1/admin/operations/jobs/health').set(auth).expect(200);
    expect(health.body.data.staleRunning.length).toBeGreaterThan(0);
    const status = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(status.body.data.activeAlerts.some((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('STALE_RUNNING_JOB', 'CALENDAR_B3_REFRESH'))).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    await cleanup();
  }, 60000);

  it('lock contention: same logical key -> one executes, one SKIPPED_LOCKED, no extra row', async () => {
    const { runner } = core();
    const key = 'BENCHMARK_CDI_DAILY:2026-09-06';
    createdKeys.push(key);
    let calls = 0;
    const slow = async () => { calls += 1; await new Promise((r) => setTimeout(r, 300)); return { status: 'SUCCESS' as const, itemsFailed: 0, finishedAt: new Date().toISOString(), durationMs: 300 }; };
    const input = { jobType: 'BENCHMARK_CDI_DAILY' as const, triggerType: 'SCHEDULED' as const, targetPeriod: '2026-09-06', targetPeriodGranularity: 'DAY' as const, scheduledFor: '2026-09-06' };
    const [a, b] = await Promise.all([runner.run({ ...input, execute: slow }), runner.run({ ...input, execute: slow })]);
    expect([a.status, b.status].sort()).toEqual(['SKIPPED_LOCKED', 'SUCCESS']);
    expect(calls).toBe(1);
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(`SELECT COUNT(*)::int AS c FROM ingestion_job_runs WHERE logical_job_key = '${key}'`);
    expect(rows[0].c).toBe(1);
    await cleanup();
  }, 60000);

  it('provider health derives from real history: repeated failures -> CRITICAL, success recovers', async () => {
    const { runner } = core();
    const key = 'MARKET_QUOTES_DAILY:2026-09-07';
    createdKeys.push(key);
    createdAlerts.push(buildAlertDedupeKey('REPEATED_PROVIDER_FAILURE', 'MARKET_QUOTES_DAILY'));
    const failing = async () => ({ status: 'FAILED' as const, itemsFailed: 1, errorCode: 'MARKET_DATA.PROVIDER_UNAVAILABLE', errorMessage: 'down', finishedAt: new Date().toISOString(), durationMs: 1 });
    for (let i = 0; i < 3; i += 1) {
      await runner.run({ jobType: 'MARKET_QUOTES_DAILY', triggerType: 'SCHEDULED', targetPeriod: '2026-09-07', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-07', execute: failing, maxAttempts: 1 });
    }
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const status = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    const alert = status.body.data.activeAlerts.find((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('REPEATED_PROVIDER_FAILURE', 'MARKET_QUOTES_DAILY'));
    expect(alert).toBeDefined();
    expect(alert.severity).toBe('CRITICAL');
    const succeeding = async () => ({ status: 'SUCCESS' as const, itemsFailed: 0, finishedAt: new Date().toISOString(), durationMs: 1 });
    await runner.run({ jobType: 'MARKET_QUOTES_DAILY', triggerType: 'MANUAL', targetPeriod: '2026-09-07', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-07', execute: succeeding, maxAttempts: 1 });
    const after = await request(app.getHttpServer()).get('/api/v1/admin/operations/data-status').set(auth).expect(200);
    expect(after.body.data.activeAlerts.filter((a: { dedupeKey: string }) => a.dedupeKey === buildAlertDedupeKey('REPEATED_PROVIDER_FAILURE', 'MARKET_QUOTES_DAILY'))).toHaveLength(0);
    await cleanup();
  }, 90000);

  it('metrics expose runs by status/trigger, failures, retries, backfill and locked totals', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const res = await request(app.getHttpServer()).get('/api/v1/admin/operations/metrics').set(auth).expect(200);
    for (const key of ['runsTotal', 'byStatus', 'byTrigger', 'providerFailuresTotal', 'retryAttemptsTotal', 'backfillRunsTotal', 'jobsSkippedTotal', 'jobsLockedTotal', 'avgDurationMs', 'dataLagPeriods']) {
      expect(res.body.data).toHaveProperty(key);
    }
    expect(typeof res.body.data.jobsLockedTotal).toBe('number');
  });

  it('scheduler disabled by default: DISABLED, not FAILED; production alone never enables', async () => {
    expect(process.env.INGESTION_SCHEDULER_ENABLED).toBeUndefined();
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const readiness = await request(app.getHttpServer()).get('/api/v1/admin/operations/scheduler/readiness').set(auth).expect(200);
    expect(readiness.body.data.ready).toBe(false);
    expect(readiness.body.data.checks.some((c: { reasonCode: string }) => c.reasonCode === 'SCHEDULER_DISABLED')).toBe(true);
    const savedNodeEnv = process.env.NODE_ENV;
    const savedFlag = process.env.INGESTION_SCHEDULER_ENABLED;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.INGESTION_SCHEDULER_ENABLED;
      const { isIngestionSchedulerEnabled } = await import('../../apps/api/src/ingestion/scheduler/ingestion-scheduler');
      expect(isIngestionSchedulerEnabled()).toBe(false);
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      if (savedFlag === undefined) delete process.env.INGESTION_SCHEDULER_ENABLED;
      else process.env.INGESTION_SCHEDULER_ENABLED = savedFlag;
    }
  });

  it('scheduler readiness fails closed on missing config; ready with staging-like config', async () => {
    const { SchedulerReadinessService } = await import('../../apps/api/src/ingestion/operations/scheduler-readiness.service');
    const readiness = app.get(SchedulerReadinessService, { strict: false });
    const savedNodeEnv = process.env.NODE_ENV;
    const savedFlag = process.env.INGESTION_SCHEDULER_ENABLED;
    const savedAllow = process.env.INGESTION_OPERATOR_USER_IDS;
    try {
      process.env.NODE_ENV = 'staging';
      process.env.INGESTION_SCHEDULER_ENABLED = 'true';
      process.env.INGESTION_OPERATOR_USER_IDS = '';
      const notReady = await readiness.check();
      expect(notReady.ready).toBe(false);
      expect(notReady.checks.some((c) => c.pass === false)).toBe(true);
      expect(notReady.checks.some((c) => c.name === 'operator-allowlist-configured' && c.pass === false)).toBe(true);
      process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
      const ready = await readiness.check();
      expect(ready.ready).toBe(true);
      const defs = ready.checks.find((c) => c.name === 'ten-definitions-once');
      expect(defs?.pass).toBe(true);
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      if (savedFlag === undefined) delete process.env.INGESTION_SCHEDULER_ENABLED;
      else process.env.INGESTION_SCHEDULER_ENABLED = savedFlag;
      if (savedAllow === undefined) delete process.env.INGESTION_OPERATOR_USER_IDS;
      else process.env.INGESTION_OPERATOR_USER_IDS = savedAllow;
    }
  }, 60000);
});
