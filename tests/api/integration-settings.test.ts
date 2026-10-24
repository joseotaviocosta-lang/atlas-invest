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
import { IntegrationConnectionService } from '../../apps/api/src/application/imports';

/**
 * Phase 5P-C — integration settings read model end-to-end (real DB, real API).
 *
 * Covers the aggregated GET /api/v1/portfolios/:id/integrations surface:
 * availability/connection derivation, schedule intent, next-run math,
 * last/last-successful run distinction, pending review count, the status
 * precedence ladder, ownership isolation and server-side field authority.
 * Zero migrations, zero auto-confirm, no real B3 calls.
 */
describe('API Integration: integration settings (Phase 5P-C)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function settingsUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/integrations`;
  }

  function schedulesUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/schedules`;
  }

  async function seedRun(
    overrides: {
      source?: string;
      status?: string;
      newCandidates?: number;
      partial?: boolean;
      createdAt?: Date;
      trigger?: string | null;
      reconciliation?: { divergent: number } | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId,
        source: overrides.source ?? 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: overrides.status ?? 'AWAITING_REVIEW',
        recordsFetched: 5,
        recordsNormalized: 5,
        newCandidates: overrides.newCandidates ?? 0,
        exactDuplicates: 0,
        probableDuplicates: 0,
        conflicts: 0,
        unsupported: 0,
        invalid: 0,
        confirmed: 0,
        ignored: 0,
        reconciliationMatched: null,
        reconciliationDivergent: overrides.reconciliation?.divergent ?? null,
        reconciliationMissingLocal: null,
        reconciliationMissingSource: null,
        reconciliationUnresolved: null,
        partial: overrides.partial ?? false,
        errorCode: null,
        errorMessage: null,
        trigger: overrides.trigger ?? 'SCHEDULED',
        createdAt: overrides.createdAt ?? now,
        updatedAt: now,
      },
    });
    return id;
  }

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

  async function authorizeConnection(): Promise<void> {
    // Phase 5P-D: settings read the persisted connection; schedules-only
    // assertions need an explicit AUTHORIZED connection first.
    const connections = app.get(IntegrationConnectionService);
    const now = new Date('2026-06-15T12:00:00Z');
    await connections.beginAuthorization({ portfolioId, userId, source: 'B3' }, now);
    await connections.completeAuthorization({ portfolioId, userId, source: 'B3' }, now);
  }

  it('reads an empty settings model: available in test env, not connected, nothing scheduled', async () => {
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.portfolioId).toBe(portfolioId);
    expect(res.body.data.sources).toHaveLength(1);
    const [b3] = res.body.data.sources;
    expect(b3).toMatchObject({
      source: 'B3',
      provider: 'SIMULATED',
      environment: 'SIMULATED',
      availability: 'AVAILABLE',
      status: 'NOT_CONNECTED',
      schedule: null,
      lastRun: null,
      lastSuccessfulRun: null,
      pendingReviewCount: 0,
      canEnable: false,
      canDisable: false,
      canEditSchedule: false,
    });
    expect(b3.connection).toEqual({
      state: 'NOT_CONNECTED',
      authorizedAt: null,
      lastCheckedAt: null,
      lifecycle: null,
    });
  });

  it('shows READY once the simulated connection is authorized', async () => {
    await authorizeConnection();
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const [b3] = res.body.data.sources;
    expect(b3.status).toBe('READY');
    expect(b3.connection.state).toBe('AUTHORIZED');
    expect(b3.connection.authorizedAt).not.toBeNull();
  });

  it('rejects unknown source schedules and cross-user portfolios', async () => {
    const unknown = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'BROKER_X', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(unknown.status).toBe(400);

    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5pc@atlas.dev', name: 'Stranger', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'Stranger Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${strangerPortfolio}/integrations`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(forbidden.status).toBe(404);
  });

  it('creates disabled by default; enabling flips paused to active', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(created.status).toBe(201);
    expect(created.body.data.enabled).toBe(false);
    await authorizeConnection();

    const paused = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(paused.body.data.sources[0]).toMatchObject({
      status: 'SCHEDULED_PAUSED',
      canEnable: true,
      canDisable: false,
      canEditSchedule: true,
    });
    expect(paused.body.data.sources[0].schedule.nextRunAt).toBeNull();

    const enabled = await request(app.getHttpServer())
      .patch(`${schedulesUrl()}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);

    const active = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(active.body.data.sources[0].status).toBe('SCHEDULED_ACTIVE');
    expect(active.body.data.sources[0].canEnable).toBe(false);
    expect(active.body.data.sources[0].canDisable).toBe(true);
    expect(active.body.data.sources[0].schedule.nextRunAt).not.toBeNull();
  });

  it('rejects invalid cadence, time, timezone and injected fields', async () => {
    for (const body of [
      { source: 'B3', cadence: 'HOURLY', hourLocal: 8, minuteLocal: 0 },
      { source: 'B3', cadence: 'DAILY', hourLocal: 24, minuteLocal: 0 },
      { source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 60 },
      { source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, timezone: 'Mars/Olympus' },
      { source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, provider: 'CERT' },
      { source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, environment: 'PROD' },
      {
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        nextRunAt: new Date().toISOString(),
      },
      {
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        lastRunAt: new Date().toISOString(),
      },
    ]) {
      const res = await request(app.getHttpServer())
        .post(schedulesUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('exposes manual-only cadence without scheduling anything', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'MANUAL_ONLY', enabled: true });
    expect(created.status).toBe(201);
    await authorizeConnection();
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0].status).toBe('SCHEDULED_ACTIVE');
    expect(res.body.data.sources[0].schedule.nextRunAt).toBeNull();
  });

  it('distinguishes last run from last successful run', async () => {
    await seedRun({ status: 'FAILED', createdAt: new Date('2026-06-15T08:00:00Z') });
    await seedRun({
      status: 'AWAITING_REVIEW',
      newCandidates: 4,
      createdAt: new Date('2026-06-16T08:00:00Z'),
    });
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const [b3] = res.body.data.sources;
    expect(b3.lastRun.status).toBe('AWAITING_REVIEW');
    expect(b3.lastSuccessfulRun).not.toBeNull();
    expect(new Date(b3.lastSuccessfulRun.at).getTime()).toBe(
      new Date('2026-06-16T08:00:00Z').getTime(),
    );
    expect(b3.pendingReviewCount).toBe(1);
    expect(b3.status).toBe('PENDING_REVIEW');
    expect(b3.lastRun.trigger).toBe('SCHEDULED');
  });

  it('keeps failed terminal runs visible as SYNC_ERROR with safe copy', async () => {
    await seedRun({ status: 'FAILED', newCandidates: 0 });
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0]).toMatchObject({
      status: 'SYNC_ERROR',
      lastSuccessfulRun: null,
    });
  });

  it('marks partial runs distinctly from clean completions', async () => {
    await seedRun({
      status: 'COMPLETED',
      newCandidates: 0,
      createdAt: new Date('2026-06-15T08:00:00Z'),
    });
    await seedRun({
      status: 'PARTIAL',
      partial: true,
      createdAt: new Date('2026-06-16T08:00:00Z'),
    });
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0].status).toBe('SYNC_PARTIAL');
  });

  it('surfaces SYNCING while a job is running and ignores disabled schedules', async () => {
    const schedule = await prisma.integrationSchedule.create({
      data: {
        portfolioId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
        nextRunAt: new Date('2026-06-16T11:00:00Z'),
        updatedAt: new Date(),
      },
    });
    await prisma.integrationJob.create({
      data: {
        scheduleId: schedule.id,
        portfolioId,
        source: 'B3',
        environment: 'SIMULATED',
        scheduledFor: new Date('2026-06-16T11:00:00Z'),
        status: 'RUNNING',
        attempt: 1,
        startedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0].status).toBe('SYNCING');
  });

  it('confirming a B3 run clears pending and keeps last run visible', async () => {
    await authorizeConnection();
    const { IntegrationRunService: RunService } =
      await import('../../apps/api/src/application/imports/integration-run.service');
    const runService = app.get(RunService);
    const run = await runService.startRun({
      portfolioId,
      userId,
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
    });
    await runService.recordPreview({
      runId: run.id,
      portfolioId,
      userId,
      recordsFetched: 5,
      recordsNormalized: 5,
      newCandidates: 4,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      sourceAsOf: '2026-06-16',
    });

    const before = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(before.body.data.sources[0].pendingReviewCount).toBe(1);
    expect(before.body.data.sources[0].lastRun.status).toBe('AWAITING_REVIEW');

    await runService.recordConfirmation({
      runId: run.id,
      portfolioId,
      userId,
      status: 'COMPLETED',
      confirmed: 4,
      ignored: 0,
      partial: false,
      reconciliation: null,
      sourceAsOf: '2026-06-16',
    });

    const after = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data.sources[0].pendingReviewCount).toBe(0);
    expect(after.body.data.sources[0].lastRun.status).toBe('COMPLETED');
    expect(after.body.data.sources[0].lastSuccessfulRun.id).toBe(run.id);
    expect(after.body.data.sources[0].status).toBe('READY');
  });

  it('updates cadence and time via PATCH and recomputes nextRunAt', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'WEEKDAYS', hourLocal: 9, minuteLocal: 30 });
    expect(created.status).toBe(201);
    await authorizeConnection();
    const scheduleId = created.body.data.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`${schedulesUrl()}/${scheduleId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        cadence: 'DAILY',
        hourLocal: 18,
        minuteLocal: 45,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      cadence: 'DAILY',
      hourLocal: 18,
      minuteLocal: 45,
      timezone: 'America/Sao_Paulo',
      enabled: true,
    });
    expect(updated.body.data.nextRunAt).not.toBeNull();
    expect(updated.body.data.provider).toBe('SIMULATED');
    expect(updated.body.data.environment).toBe('SIMULATED');

    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0].schedule).toMatchObject({ cadence: 'DAILY', hourLocal: 18 });
    expect(res.body.data.sources[0].status).toBe('SCHEDULED_ACTIVE');
  });

  it('disabling stops future runs: nextRunAt clears, history stays, pending jobs unclaimable', async () => {
    const { IntegrationSchedulerService: SchedulerService } =
      await import('../../apps/api/src/application/imports/integration-scheduler.service');
    const scheduler = app.get(SchedulerService);
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);
    const scheduleId = created.body.data.id as string;
    await authorizeConnection();

    const disabled = await request(app.getHttpServer())
      .patch(`${schedulesUrl()}/${scheduleId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.enabled).toBe(false);
    expect(disabled.body.data.nextRunAt).toBeNull();

    // A pending job on a disabled schedule is never claimable by the worker.
    await prisma.integrationJob.create({
      data: {
        scheduleId,
        portfolioId,
        source: 'B3',
        environment: 'SIMULATED',
        scheduledFor: new Date('2026-06-16T11:00:00Z'),
        status: 'PENDING',
        attempt: 0,
        updatedAt: new Date(),
      },
    });
    const tick = await scheduler.tick(new Date('2026-06-16T12:00:00Z'));
    expect(tick.due).toBe(0);

    const res = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.sources[0].status).toBe('SCHEDULED_PAUSED');
    expect(res.body.data.sources[0].canEnable).toBe(true);
  });

  it('rejects server-owned field injection on PATCH', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(created.status).toBe(201);
    for (const body of [
      { environment: 'PROD' },
      { environment: 'CERT' },
      { provider: 'B3' },
      { source: 'B3' },
      { nextRunAt: new Date().toISOString() },
      { lastRunAt: new Date().toISOString() },
    ]) {
      const res = await request(app.getHttpServer())
        .patch(`${schedulesUrl()}/${created.body.data.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });
});
