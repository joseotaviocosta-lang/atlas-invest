/**
 * Phase 5G - Alert lifecycle tests (atlas_test only, real table).
 *
 * Proves: failure -> ACTIVE INGESTION_FAILED; re-detection bumps the same row
 * (no spam); resolution on clear persists history; repeat failure dedupes;
 * stale RUNNING detected via jobs health.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestPrismaClient } from '../database/setup';
import { PrismaJobRepository } from '../../apps/api/src/ingestion/job-repository';
import { PrismaJobLock } from '../../apps/api/src/ingestion/job-lock';
import { JobRunner } from '../../apps/api/src/ingestion/job-runner';
import { OperationalAlertDetector, OperationalAlertRepository } from '../../apps/api/src/ingestion/operations/operational-alerts';
import { buildAlertDedupeKey } from '../../apps/api/src/ingestion/operations/operational-state';

const prisma = getTestPrismaClient();
const createdKeys: string[] = [];

function core() {
  const repository = new PrismaJobRepository(prisma);
  const lock = new PrismaJobLock(prisma);
  return { repository, lock, runner: new JobRunner(repository, lock), alerts: new OperationalAlertRepository(prisma) };
}

async function cleanup(): Promise<void> {
  for (const key of createdKeys.splice(0)) {
    await prisma.$executeRawUnsafe(`DELETE FROM ingestion_job_runs WHERE logical_job_key = '${key}'`);
  }
  await prisma.$executeRawUnsafe(`DELETE FROM operational_alert_events WHERE dedupe_key LIKE 'TEST:%'`);
}

describe('5G alert lifecycle', () => {
  beforeAll(async () => {
    const db = (await prisma.$queryRawUnsafe<Array<{ db: string }>>('SELECT current_database() AS db'))[0].db;
    expect(db).toBe('atlas_test');
  });

  afterAll(async () => {
    await cleanup();
  });

  it('failure activates INGESTION_FAILED; repeat bumps same row; clear resolves', async () => {
    const { runner, alerts } = core();
    const key = 'MARKET_QUOTES_DAILY:2026-09-01';
    createdKeys.push(key);
    const failing = async () => ({
      status: 'FAILED' as const,
      itemsFailed: 1,
      errorCode: 'MARKET_DATA.PROVIDER_UNAVAILABLE',
      errorMessage: 'simulated outage',
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });
    await runner.run({ jobType: 'MARKET_QUOTES_DAILY', triggerType: 'SCHEDULED', targetPeriod: '2026-09-01', targetPeriodGranularity: 'DAY', scheduledFor: '2026-09-01', execute: failing, maxAttempts: 1 });

    const detector = new OperationalAlertDetector(alerts, new PrismaJobLock(prisma));
    const dedupe = buildAlertDedupeKey('INGESTION_FAILED', 'MARKET_QUOTES_DAILY');
    await prisma.$executeRawUnsafe(`DELETE FROM operational_alert_events WHERE dedupe_key = 'TEST:${dedupe}'`);
    const namespaced = { alertType: 'INGESTION_FAILED' as const, severity: 'WARNING' as const, source: `TEST:${dedupe}`, reasonCode: 'LAST_RUN_FAILED' as const };

    const first = await detector.reconcile([{ ...namespaced, source: 'TEST:SRC' }], '2026-10-20T10:00:00.000Z');
    const active = first.filter((r) => r.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'TEST:SRC'));
    expect(active).toHaveLength(1);
    expect(active[0]!.occurrenceCount).toBe(1);

    const second = await detector.reconcile([{ ...namespaced, source: 'TEST:SRC' }], '2026-10-20T11:00:00.000Z');
    const same = second.filter((r) => r.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'TEST:SRC'));
    expect(same).toHaveLength(1);
    expect(same[0]!.occurrenceCount).toBe(2);
    expect(same[0]!.id).toBe(active[0]!.id);

    const cleared = await detector.reconcile([], '2026-10-20T12:00:00.000Z');
    expect(cleared.filter((r) => r.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'TEST:SRC'))).toHaveLength(0);
    const history = await alerts.listHistory(50);
    const resolved = history.find((r) => r.dedupeKey === buildAlertDedupeKey('INGESTION_FAILED', 'TEST:SRC'));
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  it('stale RUNNING jobs are detected via jobs health', async () => {
    const { repository } = core();
    const key = 'BENCHMARK_IBOV_DAILY:2026-09-02';
    createdKeys.push(key);
    await repository.createRun({
      logicalJobKey: key,
      jobType: 'BENCHMARK_IBOV_DAILY',
      triggerType: 'SCHEDULED',
      targetPeriod: '2026-09-02',
      targetPeriodGranularity: 'DAY',
      scheduledFor: '2026-09-02',
      attempt: 1,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const stale = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM ingestion_job_runs WHERE logical_job_key = '${key}' AND status = 'RUNNING' AND started_at < NOW() - INTERVAL '1 hour'`,
    );
    expect(stale[0].c).toBe(1);
  });
});
