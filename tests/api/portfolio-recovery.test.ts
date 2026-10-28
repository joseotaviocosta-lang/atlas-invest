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
});
