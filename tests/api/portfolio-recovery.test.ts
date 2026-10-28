import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';
import { IntegrationSchedulerService } from '../../apps/api/src/application/imports/integration-scheduler.service';
import { RetryPortfolioImportUseCase } from '../../apps/api/src/application/imports/retry-portfolio-import.use-case';
import { SourceSyncExecutorRegistry } from '../../apps/api/src/application/imports/source-sync-executor';
import { IntegrationConnectionService } from '../../apps/api/src/application/imports/integration-connection.service';
import {
  PORTFOLIO_REPOSITORY,
  INTEGRATION_RUN_REPOSITORY,
  INTEGRATION_SCHEDULE_REPOSITORY,
  INTEGRATION_JOB_REPOSITORY,
  PRISMA_CLIENT,
} from '../../apps/api/src/database/tokens';

/**
 * Phase 5S-F — Operational Reliability & Recovery API Integration Tests.
 *
 * Verifies:
 * 1. Operations center surfaces interrupted runs and factual recovery state.
 * 2. Run detail includes pure recovery model.
 * 3. Retry mutation:
 *    - Creates a new attempt (IntegrationRun in AWAITING_REVIEW).
 *    - Keeps original run completely immutable.
 *    - Preserves ledger correctness (zero direct transaction writes).
 *    - Rejects non-retryable runs with 400.
 *    - Rejects cross-portfolio calls with 404.
 *    - Concurrency mutex prevents duplicate executions on double clicks.
 * 4. Process restart / interrupted run detection is deterministic.
 * 5. Scheduler overlap safety: active job prevents duplicate enqueue.
 */
describe('API Integration: Operational Reliability & Recovery (Phase 5S-F)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
  });

  it('surfaces interrupted runs and operational recovery summary in operations center', async () => {
    // Seed an interrupted run (started 30 min ago in STARTED status)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const interruptedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: 'STARTED',
        startedAt: thirtyMinAgo,
        createdAt: thirtyMinAgo,
        updatedAt: thirtyMinAgo,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/operations-center`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const body = res.body.data;
    expect(body.recovery).toBeDefined();
    expect(body.recovery.interruptedCount).toBeGreaterThanOrEqual(1);
    expect(body.recovery.items.some((item: { runId: string }) => item.runId === interruptedRun.id)).toBe(true);

    // Attention should include SYNC_INTERRUPTED
    const attentionCodes = body.attention.preview.map((item: { code: string }) => item.code);
    expect(attentionCodes).toContain('SYNC_INTERRUPTED');
  });

  it('includes factual recovery metadata on GET run detail', async () => {
    const failedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        errorMessage: 'Simulated network timeout',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/imports/runs/${failedRun.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const data = res.body.data;
    expect(data.id).toBe(failedRun.id);
    expect(data.recovery).toBeDefined();
    expect(data.recovery.recoveryState).toBe('RETRY_AVAILABLE');
    expect(data.recovery.canRetry).toBe(true);
    expect(data.recovery.recommendedAction).toBe('RETRY');
  });

  it('successfully retries a retryable run, creating a new run and leaving original immutable', async () => {
    // Count transactions before retry
    const txCountBefore = await prisma.transaction.count({ where: { portfolioId } });

    const failedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        errorMessage: 'Temporary failure',
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        completedAt: new Date(Date.now() - 9 * 60 * 1000),
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/runs/${failedRun.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const result = res.body.data;
    expect(result.originalRunId).toBe(failedRun.id);
    expect(result.newRunId).toBeDefined();
    expect(result.newRunId).not.toBe(failedRun.id);
    expect(result.status).toBe('AWAITING_REVIEW');

    // 1. Original run must remain COMPLETELY UNTOUCHED
    const originalAfter = await prisma.integrationRun.findUnique({ where: { id: failedRun.id } });
    expect(originalAfter).not.toBeNull();
    expect(originalAfter!.status).toBe('FAILED');
    expect(originalAfter!.errorCode).toBe('INTEGRATION.SCHEDULED_SYNC_FAILED');
    expect(originalAfter!.completedAt?.getTime()).toBe(failedRun.completedAt!.getTime());

    // 2. New run must exist in AWAITING_REVIEW
    const newRun = await prisma.integrationRun.findUnique({ where: { id: result.newRunId } });
    expect(newRun).not.toBeNull();
    expect(newRun!.status).toBe('AWAITING_REVIEW');
    expect(newRun!.portfolioId).toBe(portfolioId);

    // 3. Ledger transactions must NOT have been written directly (retry is preview-only)
    const txCountAfter = await prisma.transaction.count({ where: { portfolioId } });
    expect(txCountAfter).toBe(txCountBefore);
  });

  it('rejects retry on non-retryable run with 400 Bad Request', async () => {
    // Completed run
    const completedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/runs/${completedRun.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(res.body.code).toBe('IMPORT.RETRY_NOT_AVAILABLE');

    // Run awaiting review (must route to review, not retry)
    const awaitingRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        status: 'AWAITING_REVIEW',
        startedAt: new Date(),
      },
    });

    const resAwaiting = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/runs/${awaitingRun.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(resAwaiting.body.code).toBe('IMPORT.RETRY_NOT_AVAILABLE');
  });

  it('rejects cross-portfolio retry with 404 anti-enumeration', async () => {
    // Another user's portfolio and run
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `other-${Date.now()}@example.com`,
        passwordHash: 'dummy',
        name: 'Other User',
      },
    });
    const otherPortfolio = await prisma.portfolio.create({
      data: {
        id: randomUUID(),
        userId: otherUser.id,
        name: 'Other Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const foreignRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId: otherPortfolio.id,
        source: 'B3',
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Attempting to retry foreign run with our user's token
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${otherPortfolio.id}/imports/runs/${foreignRun.id}/retry`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  it('prevents duplicate executions on concurrent double-click retry requests (single flight)', async () => {
    const failedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        errorMessage: 'Temporary network issue',
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        completedAt: new Date(Date.now() - 4 * 60 * 1000),
      },
    });

    // Count runs before
    const runsBefore = await prisma.integrationRun.count({ where: { portfolioId } });

    // Fire two simultaneous retry requests
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/imports/runs/${failedRun.id}/retry`)
        .set('Authorization', `Bearer ${authToken}`),
      request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/imports/runs/${failedRun.id}/retry`)
        .set('Authorization', `Bearer ${authToken}`),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Both requests must return the EXACT same newRunId (idempotent single flight)
    expect(res1.body.data.newRunId).toBe(res2.body.data.newRunId);

    // Exactly ONE new IntegrationRun must have been created in the database
    const runsAfter = await prisma.integrationRun.count({ where: { portfolioId } });
    expect(runsAfter).toBe(runsBefore + 1);
  });

  it('scheduler overlap safety: skips enqueuing when a job is already active', async () => {
    const scheduler = app.get(IntegrationSchedulerService);

    // Create authorized connection so schedule is eligible
    await prisma.integrationConnection.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'AUTHORIZED',
        authorizedAt: new Date(),
      },
    });

    // Create schedule
    const schedule = await prisma.integrationSchedule.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        cadence: 'DAILY',
        hourLocal: 20,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
        nextRunAt: new Date('2026-10-28T23:00:00.000Z'),
      },
    });

    // Create active job for this schedule (status = RUNNING)
    await prisma.integrationJob.create({
      data: {
        id: randomUUID(),
        scheduleId: schedule.id,
        portfolioId,
        source: 'B3',
        environment: 'SIMULATED',
        scheduledFor: new Date('2026-10-28T23:00:00.000Z'),
        status: 'RUNNING',
      },
    });

    // Tick at the due time
    const tickResult = await scheduler.tick(new Date('2026-10-28T23:05:00.000Z'));

    // Should skip due to overlap
    expect(tickResult.skippedOverlap).toBeGreaterThanOrEqual(1);
    expect(tickResult.enqueued).toBe(0);
  });

  it('cross-process retry safety: independent use case instances produce exactly 1 effective attempt (T7/T8)', async () => {
    const failedRun = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        errorMessage: 'Temporary network issue',
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        completedAt: new Date(Date.now() - 4 * 60 * 1000),
      },
    });

    const portfolios = app.get(PORTFOLIO_REPOSITORY);
    const runs = app.get(INTEGRATION_RUN_REPOSITORY);
    const registry = app.get(SourceSyncExecutorRegistry);
    const atlasPrisma = app.get(PRISMA_CLIENT);

    // Two independent use case instances simulating two separate API processes
    // (each has its own internal in-memory retryLocks map)
    const useCaseA = new RetryPortfolioImportUseCase(portfolios, runs, registry, atlasPrisma);
    const useCaseB = new RetryPortfolioImportUseCase(portfolios, runs, registry, atlasPrisma);

    const runsBefore = await prisma.integrationRun.count({ where: { portfolioId } });

    // Concurrent execution across the two independent instances
    const [resultA, resultB] = await Promise.all([
      useCaseA.execute({ portfolioId, runId: failedRun.id, userId }),
      useCaseB.execute({ portfolioId, runId: failedRun.id, userId }),
    ]);

    // Both instances return the exact same new attempt identity
    expect(resultA.newRunId).toBe(resultB.newRunId);

    // Exactly ONE new attempt was created in the database across both processes
    const runsAfter = await prisma.integrationRun.count({ where: { portfolioId } });
    expect(runsAfter).toBe(runsBefore + 1);

    // T8: Restart / subsequent call check — calling retry again returns existing attempt without creating another run
    const useCaseC = new RetryPortfolioImportUseCase(portfolios, runs, registry, atlasPrisma);
    const resultAfterRestart = await useCaseC.execute({ portfolioId, runId: failedRun.id, userId });
    expect(resultAfterRestart.newRunId).toBe(resultA.newRunId);
    const runsAfterRestart = await prisma.integrationRun.count({ where: { portfolioId } });
    expect(runsAfterRestart).toBe(runsBefore + 1);
  });

  it('scheduler dual tick race: two concurrent ticks create exactly one job (T11)', async () => {
    // Create authorized connection
    await prisma.integrationConnection.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'AUTHORIZED',
        authorizedAt: new Date(),
      },
    });

    const dueSlot = new Date('2026-10-28T22:00:00.000Z');
    const schedule = await prisma.integrationSchedule.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        cadence: 'DAILY',
        hourLocal: 19,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
        nextRunAt: dueSlot,
      },
    });

    const schedules = app.get(INTEGRATION_SCHEDULE_REPOSITORY);
    const jobs = app.get(INTEGRATION_JOB_REPOSITORY);
    const connections = app.get(IntegrationConnectionService);

    const schedulerA = app.get(IntegrationSchedulerService);
    const schedulerB = new IntegrationSchedulerService(schedules, jobs, connections);

    const tickTime = new Date('2026-10-28T22:05:00.000Z');

    // Run dual tick concurrently
    const [tickA, tickB] = await Promise.all([
      schedulerA.tick(tickTime),
      schedulerB.tick(tickTime),
    ]);

    // Exactly one job exists in database for this (scheduleId, scheduledFor)
    const jobsCount = await prisma.integrationJob.count({
      where: { scheduleId: schedule.id, scheduledFor: dueSlot },
    });
    expect(jobsCount).toBe(1);

    // One scheduler enqueued, the other detected already enqueued
    expect(tickA.enqueued + tickB.enqueued).toBe(1);
    expect(tickA.alreadyEnqueued + tickB.alreadyEnqueued).toBe(1);
  });

  it('worker attempt fencing: superseded worker cannot finalize after lease expiration (T12)', async () => {
    const jobs = app.get(INTEGRATION_JOB_REPOSITORY);

    const schedule = await prisma.integrationSchedule.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        cadence: 'DAILY',
        hourLocal: 10,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
    });

    const scheduledFor = new Date('2026-10-28T13:00:00.000Z');

    // Ensure job exists in PENDING
    const { row: job } = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId,
      source: 'B3',
      environment: 'SIMULATED',
      scheduledFor,
    });

    // Worker 1 claims the job at T0 (claim increments attempt from initial 1 to 2)
    const t0 = new Date('2026-10-28T13:05:00.000Z');
    const claim1 = await jobs.claimDue(t0, 5000); // 5 sec lease
    expect(claim1).not.toBeNull();
    expect(claim1!.id).toBe(job.id);
    expect(claim1!.attempt).toBe(2);

    // Lease expires at T0 + 10s. Worker 2 claims the job (attempt incremented to 3)
    const t1 = new Date('2026-10-28T13:05:10.000Z');
    const claim2 = await jobs.claimDue(t1, 5000);
    expect(claim2).not.toBeNull();
    expect(claim2!.id).toBe(job.id);
    expect(claim2!.attempt).toBe(3);

    // Worker 1 (stale attempt = 2) tries to finalize markSucceeded
    await expect(
      jobs.markSucceeded({
        id: job.id,
        portfolioId,
        attempt: 2, // Stale attempt!
        runId: randomUUID(),
      }),
    ).rejects.toThrow();

    // The job in DB is still RUNNING at attempt 3 (Worker 1 was completely fenced out)
    const currentJob = await prisma.integrationJob.findUnique({ where: { id: job.id } });
    expect(currentJob!.status).toBe('RUNNING');
    expect(currentJob!.attempt).toBe(3);

    // Worker 2 (active attempt = 3) can finalize successfully
    const successResult = await jobs.markSucceeded({
      id: job.id,
      portfolioId,
      attempt: 3,
      runId: randomUUID(),
    });
    expect(successResult.status).toBe('SUCCEEDED');
  });
});
