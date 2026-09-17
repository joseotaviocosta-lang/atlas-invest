import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: Portfolio History Endpoint (GET /api/v1/portfolios/:id/history)', () => {
  let app: INestApplication;
  let authToken: string;
  const prisma = getTestPrismaClient();

  const userId = '11111111-1111-4111-8111-111111111111';
  let portfolioId: string;
  let account1Id: string;
  let account2Id: string;
  let assetPetr4Id: string;
  let assetVale3Id: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();

    await prisma.user.create({
      data: {
        id: userId,
        email: 'portfolio-hist-tester@atlas.dev',
        name: 'Portfolio History Tester',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Test Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolioId = portfolio.id;

    const institution = await prisma.institution.create({
      data: {
        name: 'XP Investimentos',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const acc1 = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Account 1',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account1Id = acc1.id;

    const acc2 = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Account 2',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account2Id = acc2.id;

    const petr4 = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetPetr4Id = petr4.id;

    const vale3 = await prisma.asset.create({
      data: {
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetVale3Id = vale3.id;

    // Seed transactions across dates
    // 2026-01-05: DEPOSIT 10000 BRL in Account 1 -> CASH_FLOW
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account1Id,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-05T10:00:00Z'),
        settlementDate: new Date('2026-01-05T10:00:00Z'),
        amount: '10000.00',
        currency: 'BRL',
      },
    });

    // 2026-01-10: BUY 100 PETR4 @ 30 in Account 1
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account1Id,
        assetId: assetPetr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00Z'),
        settlementDate: new Date('2026-01-12T10:00:00Z'),
        quantity: '100',
        unitPrice: '30.00',
        amount: '3000.00',
        currency: 'BRL',
        fees: '10.00',
      },
    });

    // 2026-01-15: DIVIDEND PETR4 150 BRL in Account 1 -> INCOME
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account1Id,
        assetId: assetPetr4Id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-01-15T10:00:00Z'),
        settlementDate: new Date('2026-01-15T10:00:00Z'),
        amount: '150.00',
        currency: 'BRL',
      },
    });

    // 2026-01-20: TRANSFER_IN 200 VALE3 in Account 2 -> TRANSFER
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account2Id,
        assetId: assetVale3Id,
        type: 'TRANSFER_IN',
        tradeDate: new Date('2026-01-20T10:00:00Z'),
        settlementDate: new Date('2026-01-20T10:00:00Z'),
        quantity: '200',
        amount: '0',
        currency: 'BRL',
      },
    });

    // 2026-02-01: SELL 50 PETR4 @ 35 in Account 1 -> REALIZED_DISPOSAL
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account1Id,
        assetId: assetPetr4Id,
        type: 'SELL',
        tradeDate: new Date('2026-02-01T10:00:00Z'),
        settlementDate: new Date('2026-02-03T10:00:00Z'),
        quantity: '50',
        unitPrice: '35.00',
        amount: '1750.00',
        currency: 'BRL',
      },
    });
  });

  it('should return portfolio history in reverse chronological order with pagination metadata', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // History includes: SELL (Feb 01), TRANSFER (Jan 20), DIVIDEND (Jan 15), DEPOSIT (Jan 05) = 4 items
    expect(res.body.data).toHaveLength(4);
    expect(res.body.meta.totalCount).toBe(4);
    expect(res.body.meta.hasMore).toBe(false);

    // Order: Feb 01 SELL, Jan 20 TRANSFER, Jan 15 DIVIDEND, Jan 05 DEPOSIT
    const items = res.body.data;
    expect(items[0].tradeDate).toBe('2026-02-01');
    expect(items[0].kind).toBe('REALIZED_DISPOSAL');
    expect(items[0].details.realizedGainLoss).toBeDefined();

    expect(items[1].tradeDate).toBe('2026-01-20');
    expect(items[1].kind).toBe('TRANSFER');
    expect(items[1].assetId).toBe(assetVale3Id);

    expect(items[2].tradeDate).toBe('2026-01-15');
    expect(items[2].kind).toBe('INCOME');

    expect(items[3].tradeDate).toBe('2026-01-05');
    expect(items[3].kind).toBe('CASH_FLOW');
  });

  it('should filter history by assetId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?assetId=${assetVale3Id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].assetId).toBe(assetVale3Id);
    expect(res.body.data[0].kind).toBe('TRANSFER');
  });

  it('should filter history by accountId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?accountId=${account2Id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].accountId).toBe(account2Id);
    expect(res.body.data[0].assetId).toBe(assetVale3Id);
  });

  it('should filter history by type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?type=income`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].kind).toBe('INCOME');
    expect(res.body.data[0].details.amount.amount).toBe('150');
  });

  it('should filter history by date range', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?from=2026-01-12&to=2026-01-25`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Jan 15 DIVIDEND and Jan 20 TRANSFER fall in range
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].tradeDate).toBe('2026-01-20');
    expect(res.body.data[1].tradeDate).toBe('2026-01-15');
  });

  it('should paginate history using limit and cursor', async () => {
    const firstPage = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=2`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.hasMore).toBe(true);
    expect(firstPage.body.meta.nextCursor).toBeDefined();

    const cursor = firstPage.body.meta.nextCursor;

    const secondPage = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=2&cursor=${cursor}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(secondPage.body.data).toHaveLength(2);
    expect(secondPage.body.meta.hasMore).toBe(false);

    // Verify disjoint items
    const idsPage1 = firstPage.body.data.map((i: { id: string }) => i.id);
    const idsPage2 = secondPage.body.data.map((i: { id: string }) => i.id);
    expect(idsPage1).not.toEqual(idsPage2);
    for (const id of idsPage2) {
      expect(idsPage1).not.toContain(id);
    }
  });

  it('should return 400 when from is after to', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?from=2026-02-01&to=2026-01-01`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(res.body.code).toBe('PORTFOLIO.INVALID_DATE_RANGE');
  });
});
