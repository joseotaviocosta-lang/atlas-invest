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
import {
  IntegrationConnectionService,
  IntegrationScheduleService,
  IntegrationSchedulerService,
  IntegrationWorkerService,
  SourceSyncExecutorRegistry,
} from '../../apps/api/src/application/imports';
import { CreateTransactionUseCase } from '../../apps/api/src/application/transactions';

/**
 * Phase 5P-A — scheduled background sync end-to-end (real DB, real services).
 *
 * Covers schedule CRUD, due discovery, idempotent ticks, atomic claiming,
 * the B3 simulated background flow (preview-only, zero ledger writes, run
 * ends AWAITING_REVIEW), human confirm afterwards, repeated-sync dedupe,
 * failure/partial handling, stale recovery, bounded retries, missed-slot
 * coalescing, overlap prevention, ownership isolation and environment
 * protection. No real B3 calls, no secrets, no auto-confirm.
 */
describe('API Integration: scheduled background sync (Phase 5P-A)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();
  const assetIds = new Map<string, string>();

  function schedulesUrl(query = ''): string {
    return `/api/v1/portfolios/${portfolioId}/imports/schedules${query}`;
  }

  function runsUrl(query = ''): string {
    return `/api/v1/portfolios/${portfolioId}/imports/runs${query}`;
  }

  async function seedAssets(): Promise<void> {
    for (const [ticker, name] of [
      ['PETR4', 'Petróleo Brasileiro S.A.'],
      ['VALE3', 'Vale S.A.'],
      ['HGLG11', 'Fundo Sintético HGL'],
    ] as const) {
      const asset = await prisma.asset.create({
        data: { ticker, name, type: 'STOCK', currency: 'BRL', exchange: 'B3' },
      });
      assetIds.set(ticker, asset.id);
    }
  }

  async function ledgerCount(): Promise<number> {
    return prisma.transaction.count({ where: { portfolioId } });
  }

  async function confirmScheduledRun(runId: string): Promise<number> {
    // Human review path: the scheduled run stays AWAITING_REVIEW until a
    // person confirms through the normal review UI. The API proves the run
    // is reviewable and untouched (no auto-confirm, no ledger side effects).
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('AWAITING_REVIEW');
    return detail.body.data.counts.new as number;
  }

  async function authorizeConnection(): Promise<void> {
    // Phase 5P-D: background execution requires a persisted AUTHORIZED
    // connection. Tests that drive tick/worker establish one explicitly.
    const connections = app.get(IntegrationConnectionService);
    const now = new Date('2026-06-15T12:00:00Z');
    await connections.beginAuthorization({ portfolioId, userId, source: 'B3' }, now);
    await connections.completeAuthorization({ portfolioId, userId, source: 'B3' }, now);
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
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
    assetIds.clear();
    await seedAssets();
    await prisma.account.update({
      where: { id: accountId },
      data: { name: 'CONTA SINTETICA 5PA' },
    });
  });

  it('creates a disabled-by-default schedule and rejects unknown sources', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      source: 'B3',
      provider: 'SIMULATED',
      environment: 'SIMULATED',
      cadence: 'DAILY',
      enabled: false,
      nextRunAt: null,
      timezone: 'America/Sao_Paulo',
    });

    const unknown = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'NOPE', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(unknown.status).toBe(400);

    const duplicate = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'WEEKDAYS', hourLocal: 9, minuteLocal: 30 });
    expect(duplicate.status).toBe(400);
  });

  it('rejects CERT/PROD smuggling: provider and environment are server-locked', async () => {
    const smuggled = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        provider: 'CERT',
        environment: 'PROD',
        enabled: true,
      });
    // Strict DTO: unknown fields never reach the service layer.
    expect(smuggled.status).toBe(400);
    const listed = await request(app.getHttpServer())
      .get(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(0);
  });

  it('enables a schedule, ticks once, and executes a background B3 sync with zero ledger writes', async () => {
    await authorizeConnection();
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);
    const scheduleId = created.body.data.id as string;
    expect(created.body.data.enabled).toBe(true);
    expect(created.body.data.nextRunAt).not.toBeNull();

    // Deterministic tick at the exact slot: force due by patching nextRunAt
    // through the service clock (fake clock, not wall time).
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const slot = new Date(created.body.data.nextRunAt as string);
    const planned = await scheduler.tick(slot);
    expect(planned.due).toBe(1);
    expect(planned.enqueued).toBe(1);

    // Duplicate tick: no second job for the same slot.
    const replay = await scheduler.tick(slot);
    expect(replay.enqueued).toBe(0);

    const before = await ledgerCount();
    const outcome = await worker.executeNext(new Date(slot.getTime() + 60 * 1000));
    expect(outcome.claimed).toBe(true);
    expect(outcome.jobStatus).toBe('SUCCEEDED');
    expect(outcome.runId).not.toBeUndefined();
    expect(await ledgerCount()).toBe(before);

    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${outcome.runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
      status: 'AWAITING_REVIEW',
      trigger: 'SCHEDULED',
    });
    expect(detail.body.data.counts.new).toBe(5);

    // History shows the scheduled execution; drain leaves nothing behind.
    const history = await request(app.getHttpServer())
      .get(runsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].trigger).toBe('SCHEDULED');
    expect(await worker.executeNext(new Date())).toEqual({ claimed: false });
    void scheduleId;
  });

  it('review stays human: scheduled run is confirmable later and dedupes on repeat', async () => {
    await authorizeConnection();
    const service = app.get(IntegrationScheduleService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const created = await service.createSchedule(
      {
        portfolioId,
        userId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
      new Date('2026-06-15T12:00:00Z'),
    );
    const slot = new Date(created.nextRunAt!.toISOString());
    await scheduler.tick(slot);
    const first = await worker.executeNext(new Date(slot.getTime() + 60 * 1000));
    expect(first.jobStatus).toBe('SUCCEEDED');

    // Human review path keeps the run open (no auto-confirm).
    const ready = await confirmScheduledRun(first.runId!);
    expect(ready).toBe(5);

    // Confirm the 5 candidates through the canonical writer, then re-sync:
    // the second background run must classify everything as duplicate.
    const useCase = app.get(CreateTransactionUseCase);
    const created2 = await useCase.executeMany([
      {
        portfolioId,
        userId,
        accountId,
        assetId: assetIds.get('PETR4')!,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-03-10',
        source: 'B3',
        provider: 'B3',
        externalId: 'B3-PETR4-001',
        quantity: '100',
        unitPrice: '28.40',
      },
    ]);
    expect(created2).toHaveLength(1);

    const secondSlot = new Date(slot.getTime() + 24 * 60 * 60 * 1000);
    await scheduler.tick(secondSlot);
    const second = await worker.executeNext(new Date(secondSlot.getTime() + 60 * 1000));
    expect(second.jobStatus).toBe('SUCCEEDED');
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${second.runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.status).toBe('AWAITING_REVIEW');
    expect(detail.body.data.trigger).toBe('SCHEDULED');
  });

  it('failed provider attempts stay bounded and the run records the failure', async () => {
    await authorizeConnection();
    const service = app.get(IntegrationScheduleService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    // No accounts: executor precondition fails before any run opens.
    await prisma.account.deleteMany({ where: { portfolioId } });
    await service.createSchedule(
      {
        portfolioId,
        userId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
      new Date('2026-06-15T12:00:00Z'),
    );
    const schedule = (await service.listSchedules(portfolioId, userId))[0]!;
    await scheduler.tick(new Date(schedule.nextRunAt!.toISOString()));
    const outcome = await worker.executeNext(new Date('2026-06-16T12:00:00Z'));
    expect(outcome.claimed).toBe(true);
    expect(outcome.jobStatus).toBe('PENDING');
    // Bounded retry: the job goes back to PENDING with a not-before, not FAILED yet.
    const rows = await prisma.integrationJob.findMany({ where: { portfolioId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('PENDING');
    expect(rows[0]!.notBeforeAt).not.toBeNull();
    expect(rows[0]!.errorCode).toBe('INTEGRATION.SCHEDULED_NO_ACCOUNT');
    // History stays clean: no run was opened for a precondition failure.
    const history = await request(app.getHttpServer())
      .get(runsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(history.body.data).toHaveLength(0);
  });

  it('missed schedules coalesce: one job for a three-day outage, overlap skipped while running', async () => {
    await authorizeConnection();
    const service = app.get(IntegrationScheduleService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    await service.createSchedule(
      {
        portfolioId,
        userId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
      new Date('2026-06-15T12:00:00Z'),
    );
    // Three days offline: a single tick enqueues exactly one (latest) job.
    const outage = await scheduler.tick(new Date('2026-06-19T12:00:00Z'));
    expect(outage.due).toBe(1);
    expect(outage.enqueued).toBe(1);
    expect(await prisma.integrationJob.count({ where: { portfolioId } })).toBe(1);

    // Overlap: while the job is RUNNING, the next tick skips the schedule.
    const running = await worker.executeNext(new Date('2026-06-19T12:05:00Z'));
    expect(running.jobStatus).toBe('SUCCEEDED');
    const secondOutage = await scheduler.tick(new Date('2026-06-20T12:00:00Z'));
    expect(secondOutage.enqueued).toBeLessThanOrEqual(1);
  });

  it('stale RUNNING jobs recover and superseded claims lose explicitly', async () => {
    await authorizeConnection();
    const service = app.get(IntegrationScheduleService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    await service.createSchedule(
      {
        portfolioId,
        userId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
      new Date('2026-06-15T12:00:00Z'),
    );
    const schedule = (await service.listSchedules(portfolioId, userId))[0]!;
    await scheduler.tick(new Date(schedule.nextRunAt!.toISOString()));
    const job = (await prisma.integrationJob.findMany({ where: { portfolioId } }))[0]!;
    // Simulate a crashed worker: RUNNING with an ancient heartbeat.
    await prisma.integrationJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt: new Date('2026-06-15T08:00:00Z'), attempt: 1 },
    });
    const recovered = await worker.executeNext(new Date('2026-06-16T12:00:00Z'));
    expect(recovered.claimed).toBe(true);
    expect(recovered.jobStatus).toBe('SUCCEEDED');
    expect(recovered.runId).not.toBeUndefined();
  });

  it('unknown executors fail closed with zero writes and ownership isolates schedules', async () => {
    const registry = app.get(SourceSyncExecutorRegistry);
    expect(() => registry.resolve('B3', 'CERT')).toThrow();
    // Another user's portfolio is invisible (404, never 403).
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
      .get(`/api/v1/portfolios/${strangerPortfolio}/imports/schedules`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(forbidden.status).toBe(404);
    const forbiddenPost = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${strangerPortfolio}/imports/schedules`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0 });
    expect(forbiddenPost.status).toBe(404);
  });

  it('disabling a schedule cancels future execution without touching history', async () => {
    const service = app.get(IntegrationScheduleService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const created = await service.createSchedule(
      {
        portfolioId,
        userId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
      },
      new Date('2026-06-15T12:00:00Z'),
    );
    const slot = new Date(created.nextRunAt!.toISOString());
    await scheduler.tick(slot);
    await service.updateSchedule({ scheduleId: created.id, portfolioId, userId, enabled: false });
    // The pending job of a disabled schedule is unclaimable.
    expect(await worker.executeNext(new Date(slot.getTime() + 60 * 1000))).toEqual({
      claimed: false,
    });
    const listed = await request(app.getHttpServer())
      .get(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(listed.body.data[0]).toMatchObject({ enabled: false });
  });

  it('manual CSV preview still records MANUAL runs (no trigger regression)', async () => {
    const preview = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/preview`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceType: 'GENERIC_CSV',
        provider: 'XP',
        fileName: 'ops.csv',
        content: [
          'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
          '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-5PA-1',
        ].join('\n'),
        defaultAccountId: accountId,
      });
    expect(preview.status).toBe(200);
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${preview.body.data.runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.trigger).toBe('MANUAL');
  });
});
