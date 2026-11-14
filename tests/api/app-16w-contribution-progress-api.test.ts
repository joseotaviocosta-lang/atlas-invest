import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  createAuthenticatedUserSession,
  getTestPrismaClient,
} from './setup';

describe('API Integration: APP-16W Contribution Plan Progress Tracking', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
  let accountId: string;

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
    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;
  });

  it('GET /decision-brief/contribution-progress returns 200 with planned vs actual progress and zero DB mutations', async () => {
    const prisma = getTestPrismaClient();

    const initialTxCount = await prisma.transaction.count({ where: { portfolioId } });

    // Seed 2 active holdings
    const asset1 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const asset2 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'ITUB4',
        name: 'Itaú Unibanco PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Seed historical buy transactions before the plan period to establish active positions
    await prisma.transaction.createMany({
      data: [
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: asset1.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '28.00',
          amount: '2800.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: asset2.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '32.00',
          amount: '3200.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        // Seed buy transactions within November 2026
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: asset1.id,
          type: 'BUY',
          tradeDate: new Date('2026-11-05T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '20.00',
          amount: '2000.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: asset2.id,
          type: 'BUY',
          tradeDate: new Date('2026-11-10T00:00:00.000Z'),
          quantity: '50',
          unitPrice: '10.00',
          amount: '500.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
      ],
    });

    const now = new Date();
    await prisma.marketQuoteRecord.createMany({
      data: [
        {
          id: randomUUID(),
          assetId: asset1.id,
          tradingDate: now,
          currency: 'BRL',
          close: '28.50',
          provider: 'BRAPI',
          providerSymbol: 'BBAS3',
          firstFetchedAt: now,
          lastFetchedAt: now,
        },
        {
          id: randomUUID(),
          assetId: asset2.id,
          tradingDate: now,
          currency: 'BRL',
          close: '35.00',
          provider: 'BRAPI',
          providerSymbol: 'ITUB4',
          firstFetchedAt: now,
          lastFetchedAt: now,
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11&contributionAmount=3000.00`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const progress = res.body.data;
    expect(progress.portfolioId).toBe(portfolioId);
    expect(progress.periodStart).toBe('2026-11-01');
    expect(progress.periodEnd).toBe('2026-11-30');
    expect(progress.overall.plannedCents).toBeGreaterThan(0);
    expect(progress.overall.actualCents).toBe(250000); // 2000 + 500 = 2500.00 = 250000 cents
    expect(progress.observedTransactions).toHaveLength(2);
    expect(progress.sourceTransparencyNote).toContain('2 compra(s) registradas no ledger');
    expect(progress.cashSourceLimitationNote).toContain('não distingue com precisão a origem do caixa');

    // Verify zero mutations occurred
    const finalTxCount = await prisma.transaction.count({ where: { portfolioId } });
    expect(finalTxCount).toBe(initialTxCount + 4);
  });

  it('GET /decision-brief/contribution-progress rejects invalid period format with 400', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-13`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });

  it('GET /decision-brief/contribution-progress enforces anti-enumeration 404 for other user portfolio', async () => {
    const prisma = getTestPrismaClient();
    const otherUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: otherUserId,
        email: `other-${Date.now()}@test.com`,
        name: 'Other User',
        passwordHash: 'dummyhash123',
      },
    });
    const otherUserAuth = await createAuthenticatedUserSession(otherUserId);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${otherUserAuth.token}`);

    expect(res.status).toBe(404);
  });
});
