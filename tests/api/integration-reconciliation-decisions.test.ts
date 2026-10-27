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
 * Phase 5S-B-R1 — human reconciliation decisions (append-only).
 *
 * CONFIRM_MATCH / NOT_A_MATCH on (run, linked transaction) pairs with
 * server-derived identity and audit. Idempotent repeats, 409 on
 * conflict, ledger and run facts untouched.
 */
describe('API Integration: reconciliation decisions (Phase 5S-B-R1)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function decisionsUrl(runId: string): string {
    return `/api/v1/integration-reviews/${runId}/decisions`;
  }

  function detailUrl(runId: string): string {
    return `/api/v1/integration-reviews/${runId}`;
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
  });

  let tickerSeq = 0;
  async function createAsset() {
    tickerSeq += 1;
    const ticker = `P5R${tickerSeq}`;
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

  async function seedRun(status = 'COMPLETED'): Promise<string> {
    const id = randomUUID();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status,
        recordsFetched: 2,
        recordsNormalized: 2,
        confirmed: 0,
        ignored: 0,
        trigger: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return id;
  }

  async function link(runId: string, transactionId: string): Promise<void> {
    await prisma.integrationRunTransaction.create({
      data: { runId, portfolioId, transactionId },
    });
  }

  it('confirms and rejects matches with server-derived identity and audit', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r1-${randomUUID()}`);
    const runId = await seedRun();
    await link(runId, tx);

    const confirm = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'CONFIRM_MATCH' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({
      runId,
      portfolioId,
      source: 'B3',
      decision: 'CONFIRM_MATCH',
      localTransactionId: tx,
      decidedByCurrentUser: true,
    });
    expect(typeof confirm.body.data.id).toBe('string');
    expect(typeof confirm.body.data.decidedAt).toBe('string');
    // No internal source key, no provider payload in the response.
    expect(confirm.body.data).not.toHaveProperty('sourceItemKey');
    expect(confirm.body.data).not.toHaveProperty('provider');
    expect(confirm.body.data).not.toHaveProperty('externalId');
    expect(confirm.body.data).not.toHaveProperty('decidedByPrincipal');

    // Detail reread shows the persisted decision deterministically.
    const detail = await request(app.getHttpServer())
      .get(detailUrl(runId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    const linked = detail.body.data.linkedTransactions.find(
      (row: { transactionId: string }) => row.transactionId === tx,
    );
    expect(linked).toMatchObject({ decision: 'CONFIRM_MATCH' });
    expect(typeof linked.decidedAt).toBe('string');
  });

  it('is idempotent on repeat and rejects conflicting decisions', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r1-i-${randomUUID()}`);
    const runId = await seedRun();
    await link(runId, tx);

    const first = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'NOT_A_MATCH' });
    expect(first.status).toBe(200);
    const second = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'NOT_A_MATCH' });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    // Same pair, conflicting decision: 409, no overwrite.
    const conflict = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'CONFIRM_MATCH' });
    expect(conflict.status).toBe(409);
    const rows = await prisma.reconciliationDecisionRecord.findMany({
      where: { integrationRunId: runId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.decision).toBe('NOT_A_MATCH');

    // Concurrent identical submissions create exactly one row.
    const asset2 = await createAsset();
    const tx2 = await buy(asset2.id, `tx-5r1-c-${randomUUID()}`);
    await link(runId, tx2);
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(decisionsUrl(runId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({ transactionId: tx2, decision: 'CONFIRM_MATCH' }),
      request(app.getHttpServer())
        .post(decisionsUrl(runId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({ transactionId: tx2, decision: 'CONFIRM_MATCH' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 200]);
    expect(a.body.data.id).toBe(b.body.data.id);
  });

  it('rejects invalid, foreign and unlinked targets without writing', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r1-f-${randomUUID()}`);
    const runId = await seedRun();
    await link(runId, tx);

    const invalid = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'MAYBE' });
    expect(invalid.status).toBe(400);

    const extra = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'CONFIRM_MATCH', reason: 'looks good' });
    expect(extra.status).toBe(400);

    const foreignRun = await request(app.getHttpServer())
      .post(decisionsUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'CONFIRM_MATCH' });
    expect(foreignRun.status).toBe(404);

    const foreignTx = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: randomUUID(), decision: 'CONFIRM_MATCH' });
    expect(foreignTx.status).toBe(404);

    // Linked-table membership is required: unlinked transaction 404s.
    const asset2 = await createAsset();
    const tx2 = await buy(asset2.id, `tx-5r1-u-${randomUUID()}`);
    const unlinked = await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx2, decision: 'CONFIRM_MATCH' });
    expect(unlinked.status).toBe(404);

    // Historical runs without linked transactions stay read-only.
    const bareRunId = await seedRun('COMPLETED');
    const bare = await request(app.getHttpServer())
      .get(detailUrl(bareRunId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(bare.status).toBe(200);
    expect(bare.body.data.linkedTransactions).toEqual([]);

    const decisions = await prisma.reconciliationDecisionRecord.count();
    expect(decisions).toBe(0);
  });

  it('leaves ledger and run facts byte-identical', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, `tx-5r1-l-${randomUUID()}`);
    const runId = await seedRun();
    await link(runId, tx);

    const beforeTx = await prisma.transaction.findMany({ where: { portfolioId } });
    const beforeRun = await prisma.integrationRun.findUniqueOrThrow({ where: { id: runId } });
    const beforeLinks = await prisma.integrationRunTransaction.count({ where: { portfolioId } });

    await request(app.getHttpServer())
      .post(decisionsUrl(runId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: tx, decision: 'CONFIRM_MATCH' });

    const afterTx = await prisma.transaction.findMany({ where: { portfolioId } });
    const afterRun = await prisma.integrationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(afterTx).toEqual(beforeTx);
    expect(afterRun).toEqual(beforeRun);
    expect(await prisma.integrationRunTransaction.count({ where: { portfolioId } })).toBe(
      beforeLinks,
    );
  });
});
