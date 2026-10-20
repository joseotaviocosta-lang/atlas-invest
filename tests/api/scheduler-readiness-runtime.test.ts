/**
 * Phase 5H-H2 - Scheduler readiness runtime semantics (atlas_test only).
 *
 * Proves the corrected contract:
 * - CASE 1 disabled flag -> NOT_READY, runtime STOPPED.
 * - CASE 2 flag true + missing config -> NOT_READY, scheduler not started.
 * - CASE 3 flag true + valid config, scheduler stopped -> READY, STOPPED.
 * - CASE 4 scheduler legitimately running -> READY, RUNNING (steady state).
 * - CASE 5 second start -> no-op, still one registration, still READY.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { SchedulerReadinessService } from '../../apps/api/src/ingestion/operations/scheduler-readiness.service';
import { NodeCronIngestionScheduler } from '../../apps/api/src/ingestion/scheduler/node-cron-ingestion.scheduler';
import { getTestPrismaClient } from './setup';

const prisma = getTestPrismaClient();
const savedEnv = { ...process.env };

function calendarsStub() {
  return {
    getCoverage: async () => ({
      minDate: LocalDate.from('2026-01-01'),
      maxDate: LocalDate.from('2027-12-31'),
    }),
  };
}

function fakeScheduler() {
  const state = { running: false };
  return {
    state,
    isRunning: () => state.running,
    start: () => {
      state.running = true;
    },
    stop: () => {
      state.running = false;
    },
  };
}

function setEnv(patch: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('5H-H2 readiness runtime semantics', () => {
  it('CASE 1: flag unset -> NOT_READY, runtime STOPPED, nothing started', async () => {
    setEnv({ NODE_ENV: 'staging', INGESTION_SCHEDULER_ENABLED: undefined });
    const readiness = new SchedulerReadinessService(calendarsStub() as never, fakeScheduler() as never);
    const verdict = await readiness.check();
    expect(verdict.ready).toBe(false);
    expect(verdict.runtimeState).toBe('STOPPED');
    expect(verdict.checks.some((c) => c.reasonCode === 'SCHEDULER_DISABLED')).toBe(true);
  });

  it('CASE 2: flag true + missing allowlist -> NOT_READY, runtime STOPPED', async () => {
    setEnv({ NODE_ENV: 'staging', INGESTION_SCHEDULER_ENABLED: 'true', INGESTION_OPERATOR_USER_IDS: '' });
    const scheduler = fakeScheduler();
    const readiness = new SchedulerReadinessService(calendarsStub() as never, scheduler as never);
    const verdict = await readiness.check();
    expect(verdict.ready).toBe(false);
    expect(verdict.runtimeState).toBe('STOPPED');
    expect(scheduler.isRunning()).toBe(false);
  });

  it('CASE 3: flag true + valid config, stopped scheduler -> READY, STOPPED, 10 definitions', async () => {
    setEnv({
      NODE_ENV: 'staging',
      INGESTION_SCHEDULER_ENABLED: 'true',
      INGESTION_OPERATOR_USER_IDS: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const readiness = new SchedulerReadinessService(calendarsStub() as never, fakeScheduler() as never);
    const verdict = await readiness.check();
    expect(verdict.ready).toBe(true);
    expect(verdict.runtimeState).toBe('STOPPED');
    expect(verdict.checks.find((c) => c.name === 'ten-definitions-once')?.pass).toBe(true);
    expect(verdict.checks.find((c) => c.name === 'timezone-america-sao-paulo')?.pass).toBe(true);
    expect(
      verdict.checks.find((c) => c.name === 'scheduler-not-already-running'),
    ).toMatchObject({ pass: true, reasonCode: 'UP_TO_DATE' });
  });

  it('CASE 4: legitimately running scheduler stays READY with runtime RUNNING', async () => {
    setEnv({
      NODE_ENV: 'staging',
      INGESTION_SCHEDULER_ENABLED: 'true',
      INGESTION_OPERATOR_USER_IDS: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const scheduler = fakeScheduler();
    scheduler.start();
    const readiness = new SchedulerReadinessService(calendarsStub() as never, scheduler as never);
    const verdict = await readiness.check();
    expect(verdict.ready).toBe(true);
    expect(verdict.runtimeState).toBe('RUNNING');
    expect(
      verdict.checks.find((c) => c.name === 'scheduler-not-already-running'),
    ).toMatchObject({ pass: true, reasonCode: 'ALREADY_RUNNING' });
  });

  it('CASE 5: second start is a no-op (no duplicate registration), stays READY/RUNNING', async () => {
    const adapter = new NodeCronIngestionScheduler({ run: async () => undefined } as never);
    try {
      adapter.start();
      expect(adapter.isRunning()).toBe(true);
      expect(adapter.scheduledJobTypes()).toHaveLength(10);
      adapter.start();
      adapter.start();
      expect(adapter.isRunning()).toBe(true);
      expect(adapter.scheduledJobTypes()).toHaveLength(10);
      expect(new Set(adapter.scheduledJobTypes()).size).toBe(10);
    } finally {
      adapter.stop();
      expect(adapter.isRunning()).toBe(false);
    }
    setEnv({
      NODE_ENV: 'staging',
      INGESTION_SCHEDULER_ENABLED: 'true',
      INGESTION_OPERATOR_USER_IDS: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const readiness = new SchedulerReadinessService(
      calendarsStub() as never,
      adapter as never,
    );
    const verdict = await readiness.check();
    expect(verdict.ready).toBe(true);
    expect(verdict.runtimeState).toBe('STOPPED');
  });

  it('production mode alone never auto-enables the scheduler', async () => {
    const { isIngestionSchedulerEnabled } = await import(
      '../../apps/api/src/ingestion/scheduler/ingestion-scheduler'
    );
    setEnv({ NODE_ENV: 'production', INGESTION_SCHEDULER_ENABLED: undefined });
    expect(isIngestionSchedulerEnabled()).toBe(false);
    vi.restoreAllMocks();
    expect(prisma).toBeDefined();
  });
});
