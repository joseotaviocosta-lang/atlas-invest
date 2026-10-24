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
  IntegrationSchedulerService,
  IntegrationWorkerService,
} from '../../apps/api/src/application/imports';

/**
 * Phase 5P-D — persistent integration connection lifecycle end-to-end
 * (real DB, real API, real scheduler/worker).
 *
 * Covers the connection state machine over HTTP (begin → complete →
 * authorized; revoke; re-authorize; invalid transitions; idempotency;
 * concurrency; ownership; strict input rejection), the scheduler/worker
 * eligibility gate (only AVAILABLE + AUTHORIZED executes; everything else
 * is blocked without runs, ledger writes or fake failures), and settings
 * integration (persisted connection replaces the implicit authorization).
 * No real B3 calls, no secrets, no auto-confirm.
 */
describe('API Integration: integration connection lifecycle (Phase 5P-D)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();
  const assetIds = new Map<string, string>();

  function connectionsUrl(source = 'B3', action = ''): string {
    return `/api/v1/portfolios/${portfolioId}/integrations/${source}${action}`;
  }

  function settingsUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/integrations`;
  }

  function schedulesUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/schedules`;
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

  async function authorizeConnection(): Promise<void> {
    const connections = app.get(IntegrationConnectionService);
    const now = new Date('2026-06-15T12:00:00Z');
    await connections.beginAuthorization({ portfolioId, userId, source: 'B3' }, now);
    await connections.completeAuthorization({ portfolioId, userId, source: 'B3' }, now);
  }

  async function ledgerCount(): Promise<number> {
    return prisma.transaction.count({ where: { portfolioId } });
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
      data: { name: 'CONTA SINTETICA 5PD' },
    });
  });

  it('starts NOT_CONNECTED and opens the flow over HTTP', async () => {
    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(settings.status).toBe(200);
    expect(settings.body.data.sources[0].connection.state).toBe('NOT_CONNECTED');
    expect(settings.body.data.sources[0].status).toBe('NOT_CONNECTED');
    expect(settings.body.data.sources[0].connection.authorizedAt).toBeNull();
    expect(await prisma.integrationConnection.count({ where: { portfolioId } })).toBe(0);

    const begin = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(begin.status).toBe(200);
    expect(begin.body.data.status).toBe('AWAITING_AUTHORIZATION');

    const after = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data.sources[0].connection.state).toBe('AWAITING_AUTHORIZATION');
    expect(after.body.data.sources[0].status).toBe('AWAITING_AUTHORIZATION');
  });

  it('completes the simulated flow and persists authorization across requests', async () => {
    await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    const complete = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/complete-authorization'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('AUTHORIZED');
    expect(complete.body.data.authorizedAt).not.toBeNull();

    const row = await prisma.integrationConnection.findFirst({ where: { portfolioId } });
    expect(row).toMatchObject({
      source: 'B3',
      provider: 'SIMULATED',
      environment: 'SIMULATED',
      status: 'AUTHORIZED',
    });
    expect(row!.authorizedAt).not.toBeNull();

    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(settings.body.data.sources[0].connection.state).toBe('AUTHORIZED');
    expect(settings.body.data.sources[0].connection.authorizedAt).not.toBeNull();
    expect(settings.body.data.sources[0].status).toBe('READY');
  });

  it('revokes, preserves history and schedule, and surfaces re-auth', async () => {
    await authorizeConnection();
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);

    const revoke = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/revoke'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.status).toBe('REVOKED');

    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const [b3] = settings.body.data.sources;
    expect(b3.connection.state).toBe('NEEDS_REAUTH');
    expect(b3.status).toBe('NEEDS_REAUTH');
    // Preference preserved: the enabled schedule row is untouched.
    expect(b3.schedule).toMatchObject({ enabled: true, cadence: 'DAILY' });

    // Re-authorize through a fresh begin.
    const rebegin = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(rebegin.status).toBe(200);
    expect(rebegin.body.data.status).toBe('AWAITING_AUTHORIZATION');
    const recomplete = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/complete-authorization'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(recomplete.status).toBe(200);
    expect(recomplete.body.data.status).toBe('AUTHORIZED');
    expect(await prisma.integrationConnection.count({ where: { portfolioId } })).toBe(1);
  });

  it('fails closed on invalid transitions', async () => {
    // Complete with no open flow.
    const orphan = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/complete-authorization'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(orphan.status).toBe(400);

    // Revoke with no connection row.
    const nothing = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/revoke'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(nothing.status).toBe(400);
  });

  it('is idempotent and concurrency-safe: repeats never duplicate', async () => {
    const first = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(first.status).toBe(200);
    const second = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('AWAITING_AUTHORIZATION');

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(connectionsUrl('B3', '/authorize'))
        .set('Authorization', `Bearer ${authToken}`)
        .send({}),
      request(app.getHttpServer())
        .post(connectionsUrl('B3', '/authorize'))
        .set('Authorization', `Bearer ${authToken}`)
        .send({}),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await prisma.integrationConnection.count({ where: { portfolioId } })).toBe(1);

    await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/complete-authorization'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    const revokeOnce = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/revoke'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(revokeOnce.status).toBe(200);
    const revokeTwice = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/revoke'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(revokeTwice.status).toBe(200);
    expect(revokeTwice.body.data.status).toBe('REVOKED');
  });

  it('rejects unknown sources and protects foreign portfolios', async () => {
    const unknown = await request(app.getHttpServer())
      .post(connectionsUrl('BROKER_X', '/authorize'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(unknown.status).toBe(400);

    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5pd@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
    for (const action of ['/authorize', '/complete-authorization', '/revoke', '/check']) {
      const forbidden = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${strangerPortfolio}/integrations/B3${action}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(forbidden.status).toBe(404);
    }
  });

  it('rejects injected fields: provider, environment, URLs, tokens', async () => {
    for (const body of [
      { provider: 'CERT' },
      { environment: 'PROD' },
      { environment: 'CERT' },
      { provider: 'B3', environment: 'SIMULATED' },
      { redirectUrl: 'https://b3.example.com/oauth' },
      { token: 'fake-token' },
      { source: 'B3' },
    ]) {
      for (const action of ['/authorize', '/complete-authorization', '/revoke', '/check']) {
        const res = await request(app.getHttpServer())
          .post(connectionsUrl('B3', action))
          .set('Authorization', `Bearer ${authToken}`)
          .send(body);
        expect(res.status).toBe(400);
      }
    }
    // Untouched: no connection row was created by rejected requests.
    expect(await prisma.integrationConnection.count({ where: { portfolioId } })).toBe(0);
  });

  it('check refreshes the local truth without creating runs', async () => {
    const fresh = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/check'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.status).toBe('NOT_CONNECTED');
    expect(await prisma.integrationConnection.count({ where: { portfolioId } })).toBe(0);

    await authorizeConnection();
    const checked = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/check'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(checked.status).toBe(200);
    expect(checked.body.data.status).toBe('AUTHORIZED');
    expect(checked.body.data.lastCheckedAt).not.toBeNull();
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(0);
  });

  it('executes only with an authorized connection: happy path', async () => {
    await authorizeConnection();
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);

    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const slot = new Date(created.body.data.nextRunAt as string);
    const planned = await scheduler.tick(slot);
    expect(planned.enqueued).toBe(1);
    expect(planned.skippedIneligible).toBe(0);

    const before = await ledgerCount();
    const outcome = await worker.executeNext(new Date(slot.getTime() + 60 * 1000));
    expect(outcome.claimed).toBe(true);
    expect(outcome.jobStatus).toBe('SUCCEEDED');
    expect(outcome.runId).not.toBeUndefined();
    expect(await ledgerCount()).toBe(before);
  });

  it('blocks execution without a connection: no job, no run, no ledger write', async () => {
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);

    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const slot = new Date(created.body.data.nextRunAt as string);
    const planned = await scheduler.tick(slot);
    expect(planned.due).toBe(1);
    expect(planned.enqueued).toBe(0);
    expect(planned.skippedIneligible).toBe(1);

    expect(await prisma.integrationJob.count({ where: { portfolioId } })).toBe(0);
    expect(await worker.executeNext(new Date(slot.getTime() + 60 * 1000))).toEqual({
      claimed: false,
    });
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(0);
    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(settings.body.data.sources[0].status).toBe('NOT_CONNECTED');
  });

  it('blocks awaiting, revoked and re-auth connections while preserving preference', async () => {
    const connections = app.get(IntegrationConnectionService);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);
    const slot = new Date(created.body.data.nextRunAt as string);

    // Awaiting.
    await connections.beginAuthorization({ portfolioId, userId, source: 'B3' }, slot);
    expect((await scheduler.tick(slot)).enqueued).toBe(0);

    // Authorized → revoked: tick blocked, schedule still enabled.
    await connections.completeAuthorization({ portfolioId, userId, source: 'B3' }, slot);
    await connections.revoke({ portfolioId, userId, source: 'B3' }, slot);
    const revoked = await scheduler.tick(slot);
    expect(revoked.enqueued).toBe(0);
    expect(revoked.skippedIneligible).toBe(1);
    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(settings.body.data.sources[0].status).toBe('NEEDS_REAUTH');
    expect(settings.body.data.sources[0].schedule).toMatchObject({ enabled: true });

    // Re-auth required via provider check: still blocked.
    await connections.checkAuthorization(
      {
        portfolioId,
        userId,
        source: 'B3',
        providerStatus: 'REQUIRES_REAUTHORIZATION',
      },
      slot,
    );
    expect((await scheduler.tick(slot)).enqueued).toBe(0);
    expect(await prisma.integrationJob.count({ where: { portfolioId } })).toBe(0);
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(0);
    expect(await worker.executeNext(new Date(slot.getTime() + 60 * 1000))).toEqual({
      claimed: false,
    });
  });

  it('cancels a claimed job when the connection drops before execution', async () => {
    await authorizeConnection();
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
        status: 'PENDING',
        attempt: 0,
        updatedAt: new Date(),
      },
    });
    // Connection revoked between enqueue and claim.
    const connections = app.get(IntegrationConnectionService);
    await connections.revoke({ portfolioId, userId, source: 'B3' });

    const worker = app.get(IntegrationWorkerService);
    const before = await ledgerCount();
    const outcome = await worker.executeNext(new Date('2026-06-16T12:00:00Z'));
    expect(outcome.claimed).toBe(true);
    expect(outcome.jobStatus).toBe('CANCELLED');
    expect(outcome.runId).toBeUndefined();
    expect(await ledgerCount()).toBe(before);
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(0);
    const rows = await prisma.integrationJob.findMany({ where: { portfolioId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('CANCELLED');
    expect(rows[0]!.errorCode).toBeNull();
  });

  it('provider check marks revoked and re-auth states durably', async () => {
    await authorizeConnection();
    const connections = app.get(IntegrationConnectionService);
    const revoked = await connections.checkAuthorization(
      { portfolioId, userId, source: 'B3', providerStatus: 'REVOKED' },
      new Date('2026-06-16T13:00:00Z'),
    );
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revokedAt).not.toBeNull();

    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(settings.body.data.sources[0].connection.state).toBe('NEEDS_REAUTH');
    expect(settings.body.data.sources[0].status).toBe('NEEDS_REAUTH');
    expect(await connections.isEligible(portfolioId, 'B3')).toBe(false);
  });

  it('responses carry no tokens, secrets or PII', async () => {
    await authorizeConnection();
    const settings = await request(app.getHttpServer())
      .get(settingsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const payload = JSON.stringify(settings.body);
    expect(payload).not.toMatch(/token|secret|private|cert|password|cpf|fingerprint|externalId/i);
    const check = await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/check'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(JSON.stringify(check.body)).not.toMatch(/token|secret|private|cert|password|cpf/i);
  });

  it('concurrent authorize/revoke races keep a single coherent row', async () => {
    const connections = app.get(IntegrationConnectionService);
    await connections.beginAuthorization({ portfolioId, userId, source: 'B3' });
    await connections.completeAuthorization({ portfolioId, userId, source: 'B3' });

    const outcomes = await Promise.allSettled([
      connections.beginAuthorization({ portfolioId, userId, source: 'B3' }),
      connections.revoke({ portfolioId, userId, source: 'B3' }),
      connections.checkAuthorization({ portfolioId, userId, source: 'B3' }),
      connections.revoke({ portfolioId, userId, source: 'B3' }),
    ]);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('fulfilled');
    }
    const rows = await prisma.integrationConnection.findMany({ where: { portfolioId } });
    expect(rows).toHaveLength(1);
    expect([
      'NOT_CONNECTED',
      'AWAITING_AUTHORIZATION',
      'AUTHORIZED',
      'REQUIRES_REAUTHORIZATION',
      'REVOKED',
    ]).toContain(rows[0]!.status);
    // Coherence: a revoked row always carries revokedAt; an authorized row never does.
    if (rows[0]!.status === 'REVOKED') expect(rows[0]!.revokedAt).not.toBeNull();
    if (rows[0]!.status === 'AUTHORIZED') expect(rows[0]!.revokedAt).toBeNull();
  });

  it('revoke preserves runs, schedule and ledger; review stays readable', async () => {
    await authorizeConnection();
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);

    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const slot = new Date(created.body.data.nextRunAt as string);
    await scheduler.tick(slot);
    const outcome = await worker.executeNext(new Date(slot.getTime() + 60 * 1000));
    expect(outcome.jobStatus).toBe('SUCCEEDED');
    const runId = outcome.runId as string;
    const ledgerBefore = await ledgerCount();

    await request(app.getHttpServer())
      .post(connectionsUrl('B3', '/revoke'))
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    // History, schedule and ledger untouched.
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(1);
    expect(await prisma.integrationSchedule.count({ where: { portfolioId } })).toBe(1);
    expect(await ledgerCount()).toBe(ledgerBefore);

    // The already-previewed run stays reviewable: run detail returns the
    // stored preview snapshot, no source re-fetch, no authorization gate.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/imports/runs/${runId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ status: 'AWAITING_REVIEW', source: 'B3' });
  });

  it('failures record only static safe error copy (canary-free)', async () => {
    await authorizeConnection();
    // No accounts: the executor precondition fails with a static message.
    await prisma.account.deleteMany({ where: { portfolioId } });
    const created = await request(app.getHttpServer())
      .post(schedulesUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source: 'B3', cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, enabled: true });
    expect(created.status).toBe(201);
    const scheduler = app.get(IntegrationSchedulerService);
    const worker = app.get(IntegrationWorkerService);
    const slot = new Date(created.body.data.nextRunAt as string);
    await scheduler.tick(slot);
    const outcome = await worker.executeNext(new Date(slot.getTime() + 60 * 1000));
    // Bounded retry: back to PENDING, no run opened, no ledger write.
    expect(outcome.jobStatus).toBe('PENDING');

    const jobs = await prisma.integrationJob.findMany({ where: { portfolioId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.errorCode).toBe('INTEGRATION.SCHEDULED_NO_ACCOUNT');
    // Exact static copy: failure paths never interpolate dynamic content,
    // so no secret can flow into persisted errors or API responses.
    expect(jobs[0]!.errorMessage).toBe(
      'Sincronização agendada exige ao menos uma conta na carteira',
    );
    expect(JSON.stringify(jobs[0])).not.toMatch(
      /CLIENT_SECRET_CANARY|TOKEN_CANARY|CERT_PASSWORD_CANARY|CPF_CANARY|private_key|BEGIN CERTIFICATE/i,
    );
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });
});
