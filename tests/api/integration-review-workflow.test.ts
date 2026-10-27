import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5S-B-R2 — human reconciliation workflow completion.
 *
 * Decisions drive a derived workflow state (PENDING / PARTIALLY_RESOLVED
 * / RESOLVED / NOT_ACTIONABLE) without touching engine facts, run
 * status, reconciliation summaries or the ledger. Filters expose the
 * workflow; counts stay consistent across inbox, detail and the
 * operations center.
 */
describe('API Integration: reconciliation workflow (Phase 5S-B-R2)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
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
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
  });

  let tickerSeq = 0;
  async function createAsset() {
    tickerSeq += 1;
    const ticker = `P5W${tickerSeq}`;
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });
    return asset;
  }

  async function buy(assetId: string, externalId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId,
      });
    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  async function seedRun(status = 'AWAITING_REVIEW', source = 'B3'): Promise<string> {
    const id = randomUUID();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId,
        source,
        provider: 'B3',
        environment: 'SIMULATED',
        status,
        recordsFetched: 2,
        recordsNormalized: 2,
        newCandidates: status === 'AWAITING_REVIEW' ? 2 : 0,
        confirmed: 0,
        ignored: 0,
        trigger: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return id;
  }

  async function decide(runId: string, transactionId: string, decision: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/integration-reviews/${runId}/decisions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId, decision });
    expect(res.status).toBe(200);
    return res.body.data;
  }

  it('derives pending → partial → resolved as decisions land', async () => {
    const asset = await createAsset();
    const tx1 = await buy(asset.id, `tx-5r2-a-${randomUUID()}`);
    const tx2 = await buy(asset.id, `tx-5r2-b-${randomUUID()}`);
    const runId = await seedRun();
    await prisma.integrationRunTransaction.createMany({
      data: [
        { runId, portfolioId, transactionId: tx1 },
        { runId, portfolioId, transactionId: tx2 },
      ],
    });

    const fresh = await request(app.getHttpServer())
      .get(`/api/v1/integration-reviews/${runId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(fresh.body.data.pairReview).toEqual({
      status: 'PENDING',
      totalPairs: 2,
      decidedPairs: 0,
    });

    await decide(runId, tx1, 'CONFIRM_MATCH');
    const partial = await request(app.getHttpServer())
      .get(`/api/v1/integration-reviews/${runId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(partial.body.data.pairReview).toEqual({
      status: 'PARTIALLY_RESOLVED',
      totalPairs: 2,
      decidedPairs: 1,
    });

    await decide(runId, tx2, 'NOT_A_MATCH');
    const done = await request(app.getHttpServer())
      .get(`/api/v1/integration-reviews/${runId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(done.body.data.pairReview).toEqual({
      status: 'RESOLVED',
      totalPairs: 2,
      decidedPairs: 2,
    });
    // Run and reconciliation facts are untouched by decisions.
    const run = await prisma.integrationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe('AWAITING_REVIEW');
    expect(run.reconciliationMatched).toBeNull();
  });

  it('filters the inbox by workflow state without breaking cursors', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r2-f-${randomUUID()}`);
    const pendingRun = await seedRun();
    const resolvedRun = await seedRun();
    await prisma.integrationRunTransaction.create({
      data: { runId: pendingRun, portfolioId, transactionId: tx },
    });
    const asset2 = await createAsset();
    const tx2 = await buy(asset2.id, `tx-5r2-f2-${randomUUID()}`);
    await prisma.integrationRunTransaction.create({
      data: { runId: resolvedRun, portfolioId, transactionId: tx2 },
    });
    await decide(resolvedRun, tx2, 'CONFIRM_MATCH');

    const all = await request(app.getHttpServer())
      .get('/api/v1/integration-reviews?limit=50')
      .set('Authorization', `Bearer ${authToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toMatchObject({ limit: 50, hasMore: false });
    expect(all.body.meta.workflow).toEqual({ pendingPairs: 1, resolvedPairs: 1, totalPairs: 2 });

    const pending = await request(app.getHttpServer())
      .get('/api/v1/integration-reviews?limit=50&state=PENDING')
      .set('Authorization', `Bearer ${authToken}`);
    expect(pending.body.data.map((row: { runId: string }) => row.runId)).toEqual([pendingRun]);
    expect(pending.body.data[0].pairReview.status).toBe('PENDING');

    const resolved = await request(app.getHttpServer())
      .get('/api/v1/integration-reviews?limit=50&state=RESOLVED')
      .set('Authorization', `Bearer ${authToken}`);
    expect(resolved.body.data.map((row: { runId: string }) => row.runId)).toEqual([resolvedRun]);
    expect(resolved.body.data[0].pairReview).toMatchObject({ status: 'RESOLVED', totalPairs: 1 });

    const invalid = await request(app.getHttpServer())
      .get('/api/v1/integration-reviews?limit=50&state=DONE')
      .set('Authorization', `Bearer ${authToken}`);
    expect(invalid.status).toBe(400);
  });

  it('keeps operations center consistent with workflow counts', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r2-o-${randomUUID()}`);
    const runId = await seedRun();
    await prisma.integrationRunTransaction.create({
      data: { runId, portfolioId, transactionId: tx },
    });

    const before = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/operations-center`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(before.body.data.reviewWorkflow).toEqual({
      pendingPairs: 1,
      decidedPairs: 0,
      totalPairs: 1,
    });

    await decide(runId, tx, 'CONFIRM_MATCH');

    const after = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/operations-center`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data.reviewWorkflow).toEqual({
      pendingPairs: 0,
      decidedPairs: 1,
      totalPairs: 1,
    });
    // Engine reconciliation counts are unchanged by human decisions.
    expect(after.body.data.reconciliation).toEqual(before.body.data.reconciliation);
    expect(after.body.data.dataQuality).toEqual(before.body.data.dataQuality);

    // Zero new writes on GET: decisions live only in their own table.
    const txCount = await prisma.transaction.count({ where: { portfolioId } });
    const runCount = await prisma.integrationRun.count({ where: { portfolioId } });
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/operations-center`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(txCount);
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(runCount);
    expect(JSON.stringify(after.body.data)).not.toMatch(/sourceItemKey|externalId|secret|token/i);
  });
});
