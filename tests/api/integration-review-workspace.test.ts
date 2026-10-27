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
 * Phase 5S-B — import & reconciliation workspace (read-only).
 *
 * Review list with source filter; review detail with run context,
 * linked local facts, reconciliation semantics and explicit
 * limitations. No mutations: source snapshots are never persisted,
 * decisions are never written.
 */
describe('API Integration: reconciliation workspace (Phase 5S-B)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function reviewsUrl(query = ''): string {
    return `/api/v1/integration-reviews${query}`;
  }

  function reviewUrl(runId: string): string {
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

  async function seedRun(
    overrides: {
      source?: string;
      status?: string;
      newCandidates?: number;
      conflicts?: number;
      reconciliation?: {
        matched: number;
        divergent: number;
        missingLocal: number;
        missingSource: number;
        unresolved: number;
      } | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId,
        source: overrides.source ?? 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: overrides.status ?? 'AWAITING_REVIEW',
        recordsFetched: 2,
        recordsNormalized: 2,
        newCandidates: overrides.newCandidates ?? 1,
        confirmed: 0,
        ignored: 0,
        conflicts: overrides.conflicts ?? 0,
        reconciliationMatched: overrides.reconciliation?.matched ?? null,
        reconciliationDivergent: overrides.reconciliation?.divergent ?? null,
        reconciliationMissingLocal: overrides.reconciliation?.missingLocal ?? null,
        reconciliationMissingSource: overrides.reconciliation?.missingSource ?? null,
        reconciliationUnresolved: overrides.reconciliation?.unresolved ?? null,
        trigger: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return id;
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

  it('lists reviews with source filter and paginated bounds', async () => {
    await seedRun({ source: 'B3', newCandidates: 2 });
    await seedRun({ source: 'CSV', newCandidates: 1 });

    const all = await request(app.getHttpServer())
      .get(reviewsUrl('?limit=50'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);

    const b3 = await request(app.getHttpServer())
      .get(reviewsUrl('?limit=50&source=B3'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(b3.status).toBe(200);
    expect(b3.body.data).toHaveLength(1);
    expect(b3.body.data[0].source).toBe('B3');

    const csv = await request(app.getHttpServer())
      .get(reviewsUrl('?limit=50&source=CSV'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(csv.status).toBe(200);
    expect(csv.body.data).toHaveLength(1);
    expect(csv.body.data[0].source).toBe('CSV');

    const invalid = await request(app.getHttpServer())
      .get(reviewsUrl('?limit=50&source=B3X'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(invalid.status).toBe(400);
  });

  it('returns detail with run context, recon semantics and honest source limits', async () => {
    const runId = await seedRun({
      source: 'B3',
      newCandidates: 2,
      reconciliation: {
        matched: 5,
        divergent: 2,
        missingLocal: 0,
        missingSource: 1,
        unresolved: 0,
      },
    });

    const res = await request(app.getHttpServer())
      .get(reviewUrl(runId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.state).toBe('ACTIONABLE');
    expect(data.item).toMatchObject({ runId, source: 'B3', status: 'AWAITING_REVIEW' });
    expect(typeof data.portfolioName).toBe('string');
    // Source itemization is never persisted: counts only, stated plainly.
    expect(data.linkedTransactions).toEqual([]);
    expect(data.limitations).toContain('SOURCE_FACTS_NOT_PERSISTED');
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/externalId|provider|secret|token|certificate|fingerprint/i);
  });

  it('exposes linked local transactions for confirmed runs without mutation', async () => {
    const asset = await createAsset();
    const tx1 = await buy(asset.id, `tx-5sw-1-${randomUUID()}`);
    const tx2 = await buy(asset.id, `tx-5sw-2-${randomUUID()}`);
    const runId = randomUUID();
    await prisma.integrationRun.create({
      data: {
        id: runId,
        portfolioId,
        source: 'CSV',
        status: 'COMPLETED',
        recordsFetched: 2,
        recordsNormalized: 2,
        newCandidates: 0,
        confirmed: 2,
        ignored: 0,
        trigger: 'MANUAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await prisma.integrationRunTransaction.createMany({
      data: [
        { runId, portfolioId, transactionId: tx1 },
        { runId, portfolioId, transactionId: tx2 },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(reviewUrl(runId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.state).toBe('RESOLVED');
    expect(data.resolvedReason).toBe('CONFIRMED');
    expect(data.linkedTransactionsTruncated).toBe(false);
    expect(data.linkedTransactions).toHaveLength(2);
    for (const row of data.linkedTransactions) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'amount',
          'assetId',
          'currency',
          'quantity',
          'ticker',
          'tradeDate',
          'transactionId',
          'type',
          'decision',
          'decidedAt',
          'rectified',
        ].sort(),
      );
      expect(row.ticker).toBe(asset.ticker);
      expect(row.type).toBe('BUY');
      expect(row.rectified).toBe(false);
    }
    const ids = data.linkedTransactions.map((row: { transactionId: string }) => row.transactionId);
    expect(ids).toContain(tx1);
    expect(ids).toContain(tx2);
  });

  it('404s foreign runs, stays read-only and deterministic', async () => {
    const runId = await seedRun({ source: 'B3' });
    const foreign = await request(app.getHttpServer())
      .get(reviewUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    const beforeTx = await prisma.transaction.count({ where: { portfolioId } });
    const beforeRuns = await prisma.integrationRun.count({ where: { portfolioId } });
    const beforeLinks = await prisma.integrationRunTransaction.count({ where: { portfolioId } });
    const first = await request(app.getHttpServer())
      .get(reviewUrl(runId))
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(reviewUrl(runId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(first.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(beforeTx);
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(beforeRuns);
    expect(await prisma.integrationRunTransaction.count({ where: { portfolioId } })).toBe(
      beforeLinks,
    );
  });
});
