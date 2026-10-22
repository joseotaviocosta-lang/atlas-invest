import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { IntegrationJobRepository, IntegrationScheduleRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const schedules = new IntegrationScheduleRepository(prisma);
const jobs = new IntegrationJobRepository(prisma);

const USER = 'ee444444-4444-4444-8444-444444444444';
const PORTFOLIO = 'e3333333-3333-4333-8333-333333333333';
const OTHER_PORTFOLIO = 'e4444444-4444-4444-8444-444444444444';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'scheduling@atlas.dev', name: 'Scheduling', passwordHash: 'x' },
  });
  await prisma.portfolio.create({
    data: {
      id,
      userId: USER,
      name: `P-${id.slice(0, 8)}`,
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });
}

const SLOT = new Date('2026-06-16T11:00:00Z');

describe('Phase 5P-A: integration schedule and job persistence', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await portfolio(PORTFOLIO);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a disabled-by-default schedule with a simulated-only environment', async () => {
    const created = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
    });
    expect(created.enabled).toBe(false);
    expect(created.environment).toBe('SIMULATED');
    expect(created.provider).toBe('SIMULATED');
    expect(created.nextRunAt).toBeNull();
  });

  it('enforces one schedule per portfolio and source', async () => {
    await schedules.create({ portfolioId: PORTFOLIO, source: 'B3', cadence: 'MANUAL_ONLY' });
    await expect(
      schedules.create({ portfolioId: PORTFOLIO, source: 'B3', cadence: 'MANUAL_ONLY' }),
    ).rejects.toThrow();
  });

  it('ensures one job per schedule slot (idempotent ticks)', async () => {
    const schedule = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: SLOT,
    });
    const first = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    expect(first.created).toBe(true);
    expect(first.row.status).toBe('PENDING');
    const second = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
  });

  it('claim is atomic: exactly one of two concurrent workers wins', async () => {
    const schedule = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: SLOT,
    });
    await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    const now = new Date('2026-06-16T12:00:00Z');
    const [winner, loser] = await Promise.all([
      jobs.claimDue(now, 60 * 60 * 1000),
      jobs.claimDue(now, 60 * 60 * 1000),
    ]);
    const claimed = [winner, loser].filter((row) => row !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.status).toBe('RUNNING');
    expect(claimed[0]!.attempt).toBe(2);
  });

  it('disabled schedules are unclaimable (disable cancels future execution)', async () => {
    const schedule = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: false,
      nextRunAt: SLOT,
    });
    await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    expect(await jobs.claimDue(new Date('2026-06-16T12:00:00Z'), 60 * 60 * 1000)).toBeNull();
  });

  it('stale RUNNING jobs are recoverable past the lease', async () => {
    const schedule = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: SLOT,
    });
    const { row } = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    const claimed = await jobs.claimDue(new Date('2026-06-16T12:00:00Z'), 60 * 60 * 1000);
    expect(claimed!.id).toBe(row.id);
    // Original worker lost: its fence (attempt 2) is superseded after a stale re-claim.
    const staleNow = new Date('2026-06-16T14:30:00Z');
    const reclaimed = await jobs.claimDue(staleNow, 60 * 60 * 1000);
    expect(reclaimed!.id).toBe(row.id);
    expect(reclaimed!.attempt).toBe(3);
    await expect(
      jobs.markSucceeded({ id: row.id, portfolioId: PORTFOLIO, attempt: 2, runId: null }),
    ).rejects.toThrow();
    const done = await jobs.markSucceeded({
      id: row.id,
      portfolioId: PORTFOLIO,
      attempt: 3,
      runId: null,
    });
    expect(done.status).toBe('SUCCEEDED');
  });

  it('failed jobs retry with backoff and stay scoped by portfolio', async () => {
    const schedule = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: SLOT,
    });
    const { row } = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: SLOT,
    });
    const claimed = await jobs.claimDue(new Date('2026-06-16T12:00:00Z'), 60 * 60 * 1000);
    const retryAt = new Date('2026-06-16T12:05:00Z');
    const failed = await jobs.markFailed({
      id: row.id,
      portfolioId: PORTFOLIO,
      attempt: claimed!.attempt,
      errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
      errorMessage: 'Falha na sincronização agendada. Tente novamente.',
      attemptsExhausted: false,
      notBeforeAt: retryAt,
    });
    expect(failed.status).toBe('PENDING');
    expect(failed.notBeforeAt).not.toBeNull();
    await portfolio(OTHER_PORTFOLIO);
    expect(await jobs.findById(row.id, OTHER_PORTFOLIO)).toBeNull();
    expect(await schedules.findById(schedule.id, OTHER_PORTFOLIO)).toBeNull();
  });

  it('lists due schedules and reports the active job for overlap prevention', async () => {
    const past = new Date('2026-06-16T11:00:00Z');
    const future = new Date('2026-06-20T11:00:00Z');
    const now = new Date('2026-06-17T12:00:00Z');
    const due = await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: past,
    });
    await schedules.create({
      portfolioId: PORTFOLIO,
      source: 'CSV',
      cadence: 'DAILY',
      hourLocal: 8,
      minuteLocal: 0,
      timezone: 'America/Sao_Paulo',
      enabled: true,
      nextRunAt: future,
    });
    const listed = await schedules.listDue(now, 200);
    expect(listed.map((row) => row.id)).toEqual([due.id]);
    expect(await jobs.findActiveBySchedule(due.id)).toBeNull();
    await jobs.ensure({
      scheduleId: due.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: past,
    });
    expect((await jobs.findActiveBySchedule(due.id))?.status).toBe('PENDING');
  });
});
