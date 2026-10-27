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

/**
 * Phase 5S-E — operational audit history API integration tests.
 *
 * Scoped by portfolio and authenticated user. Tests global deterministic ordering,
 * multi-source pagination, category filtering, tenant isolation and safety.
 */
describe('API Integration: portfolio audit history (Phase 5S-E)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function auditUrl(params?: Record<string, string | number>): string {
    const base = `/api/v1/portfolios/${portfolioId}/audit-history`;
    if (!params) return base;
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return `${base}?${query}`;
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
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    userId = fixtures.userId;
    const session = await createAuthenticatedUserSession(fixtures.userId);
    authToken = session.token;
  });

  it('returns empty audit history when no operational events exist', async () => {
    const res = await request(app.getHttpServer())
      .get(auditUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({
      limit: 25,
      cursor: null,
      nextCursor: null,
      hasMore: false,
      totalItemsInPage: 0,
    });
  });

  it('returns unified operational events across runs, rectifications, and reconciliation decisions', async () => {
    // 1. Seed an asset
    const assetId = randomUUID();
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    // 2. Seed a ledger transaction
    const txId = randomUUID();
    await prisma.transaction.create({
      data: {
        id: txId,
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-10-10'),
        settlementDate: new Date('2026-10-12'),
        currency: 'BRL',
        quantity: '100',
        unitPrice: '60.00',
        amount: '6000.00',
        fees: '0.00',
        source: 'MANUAL',
      },
    });

    // 3. Seed an IntegrationRun
    const runId = randomUUID();
    const runDate = new Date('2026-10-10T10:00:00.000Z');
    await prisma.integrationRun.create({
      data: {
        id: runId,
        portfolioId,
        source: 'CEI_CSV',
        status: 'COMPLETED',
        recordsFetched: 5,
        confirmed: 5,
        startedAt: runDate,
        completedAt: runDate,
        createdAt: runDate,
      },
    });

    // 4. Seed a Reconciliation Decision
    const decId = randomUUID();
    const decDate = new Date('2026-10-11T12:00:00.000Z');
    await prisma.reconciliationDecisionRecord.create({
      data: {
        id: decId,
        portfolioId,
        integrationRunId: runId,
        source: 'CEI_CSV',
        sourceItemKey: 'item:1',
        localTransactionId: txId,
        decision: 'CONFIRM_MATCH',
        decidedByPrincipal: userId,
        decidedAt: decDate,
        createdAt: decDate,
      },
    });

    // 5. Seed a Transaction Rectification
    const compTxId = randomUUID();
    const replTxId = randomUUID();
    await prisma.transaction.createMany({
      data: [
        {
          id: compTxId,
          portfolioId,
          accountId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-10-10'),
          settlementDate: new Date('2026-10-12'),
          currency: 'BRL',
          quantity: '100',
          unitPrice: '60.00',
          amount: '6000.00',
          fees: '0.00',
          source: 'MANUAL',
        },
        {
          id: replTxId,
          portfolioId,
          accountId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-10-10'),
          settlementDate: new Date('2026-10-12'),
          currency: 'BRL',
          quantity: '150',
          unitPrice: '60.00',
          amount: '9000.00',
          fees: '0.00',
          source: 'MANUAL',
        },
      ],
    });

    const rectId = randomUUID();
    const rectDate = new Date('2026-10-12T15:00:00.000Z');
    await prisma.transactionRectificationRecord.create({
      data: {
        id: rectId,
        portfolioId,
        originalTransactionId: txId,
        compensatingTransactionId: compTxId,
        replacementTransactionId: replTxId,
        mode: 'RECTIFY',
        reason: 'Corrigido quantidade de 100 para 150',
        decidedByPrincipal: userId,
        decidedAt: rectDate,
        createdAt: rectDate,
      },
    });

    // 6. Query audit feed
    const res = await request(app.getHttpServer())
      .get(auditUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(3);

    // Ordered by occurredAt DESC: Rectification (Oct 12) -> Decision (Oct 11) -> Run (Oct 10)
    const item0 = res.body.data[0];
    expect(item0.id).toBe(`rect:${rectId}`);
    expect(item0.eventType).toBe('TRANSACTION_RECTIFIED');
    expect(item0.title).toBe('Operação retificada');
    expect(item0.actor).toEqual({ kind: 'USER', label: 'Você' });
    expect(item0.reason).toBe('Corrigido quantidade de 100 para 150');
    expect(item0.entity).toMatchObject({
      type: 'TRANSACTION',
      id: replTxId,
      label: 'Ver operação',
    });

    const item1 = res.body.data[1];
    expect(item1.id).toBe(`decision:${decId}`);
    expect(item1.eventType).toBe('RECONCILIATION_DECISION_RECORDED');
    expect(item1.title).toBe('Reconciliação revisada');
    expect(item1.actor).toEqual({ kind: 'USER', label: 'Você' });
    expect(item1.reason).toBe('Correspondência confirmada');
    expect(item1.entity).toMatchObject({
      type: 'REVIEW',
      id: runId,
      label: 'Ver revisão',
    });

    const item2 = res.body.data[2];
    expect(item2.id).toBe(`run:${runId}`);
    expect(item2.eventType).toBe('IMPORT_COMPLETED');
    expect(item2.title).toBe('Importação concluída');
    expect(item2.actor).toBeNull();
  });

  it('filters by category correctly', async () => {
    const runId = randomUUID();
    const runDate = new Date('2026-10-10T10:00:00.000Z');
    await prisma.integrationRun.create({
      data: {
        id: runId,
        portfolioId,
        source: 'CEI_CSV',
        status: 'COMPLETED',
        recordsFetched: 3,
        confirmed: 3,
        createdAt: runDate,
      },
    });

    const res = await request(app.getHttpServer())
      .get(auditUrl({ category: 'IMPORTS' }))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('IMPORTS');

    const resEmpty = await request(app.getHttpServer())
      .get(auditUrl({ category: 'RECTIFICATIONS' }))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(resEmpty.body.data).toHaveLength(0);
  });

  it('paginates stably with cursor', async () => {
    // Seed 3 runs
    for (let i = 1; i <= 3; i++) {
      const d = new Date(`2026-10-10T1${i}:00:00.000Z`);
      await prisma.integrationRun.create({
        data: {
          id: `00000000-0000-4000-8000-00000000000${i}`,
          portfolioId,
          source: 'CEI_CSV',
          status: 'COMPLETED',
          recordsFetched: 1,
          confirmed: 1,
          createdAt: d,
        },
      });
    }

    // Page 1
    const res1 = await request(app.getHttpServer())
      .get(auditUrl({ limit: 2 }))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res1.body.data).toHaveLength(2);
    expect(res1.body.meta.hasMore).toBe(true);
    expect(res1.body.meta.nextCursor).toBeTruthy();

    // Page 2
    const res2 = await request(app.getHttpServer())
      .get(auditUrl({ limit: 2, cursor: res1.body.meta.nextCursor }))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.meta.hasMore).toBe(false);

    // No overlap
    const ids1 = res1.body.data.map((d: { id: string }) => d.id);
    const ids2 = res2.body.data.map((d: { id: string }) => d.id);
    expect(ids1).not.toContain(ids2[0]);
  });

  it('enforces portfolio ownership and returns 404 for foreign portfolios', async () => {
    const foreignPortfolioId = randomUUID();
    const foreignUserId = randomUUID();

    // Create foreign user & portfolio
    await prisma.user.create({
      data: {
        id: foreignUserId,
        email: 'foreign@atlas.test',
        name: 'Foreign User',
        passwordHash: 'dummyhash',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: foreignPortfolioId,
        userId: foreignUserId,
        name: 'Foreign Portfolio',
        type: 'PERSONAL',
        baseCurrency: 'BRL',
        status: 'ACTIVE',
      },
    });

    // Try to access foreign portfolio's audit history
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${foreignPortfolioId}/audit-history`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });
});
