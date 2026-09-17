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

describe('API Integration: Portfolio asOf Historical Semantics', () => {
  let app: INestApplication;
  let authToken: string;
  const prisma = getTestPrismaClient();

  const userId = '11111111-1111-4111-8111-111111111111';
  let portfolioId: string;
  let accountId: string;
  let assetPetr4Id: string;

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
        email: 'portfolio-asof-tester@atlas.dev',
        name: 'Portfolio asOf Tester',
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

    const acc = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Account 1',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    accountId = acc.id;

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

    // Event 1: 2026-01-10 BUY 100 @ 30
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00Z'),
        settlementDate: new Date('2026-01-12T10:00:00Z'),
        quantity: 100,
        unitPrice: 30.0,
        amount: 3000.0,
        currency: 'BRL',
      },
    });

    // Event 2: 2026-01-20 SELL 50 @ 40 (Gain 500)
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T10:00:00Z'),
        settlementDate: new Date('2026-01-22T10:00:00Z'),
        quantity: 50,
        unitPrice: 40.0,
        amount: 2000.0,
        currency: 'BRL',
      },
    });
  });

  it('asOf before first transaction returns empty state', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-01-01`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.asOfDate).toBe('2026-01-01');
    expect(res.body.data.positions).toHaveLength(0);
    expect(res.body.data.realizedSummaries).toHaveLength(0);
    expect(res.body.data.replayMetadata.processedTransactionCount).toBe(0);
  });

  it('asOf between BUY and SELL returns state with 100 shares and 0 realized gain', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-01-15`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.asOfDate).toBe('2026-01-15');
    expect(res.body.data.positions).toHaveLength(1);
    expect(res.body.data.positions[0].quantity).toBe('100');
    expect(res.body.data.positions[0].totalCost.amount).toBe('3000');
    expect(res.body.data.realizedSummaries).toHaveLength(0);
    expect(res.body.data.replayMetadata.processedTransactionCount).toBe(1);
  });

  it('asOf on or after SELL returns state with 50 shares and 500 realized gain', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-01-20`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.asOfDate).toBe('2026-01-20');
    expect(res.body.data.positions).toHaveLength(1);
    expect(res.body.data.positions[0].quantity).toBe('50');
    expect(res.body.data.positions[0].totalCost.amount).toBe('1500');
    expect(res.body.data.realizedSummaries).toHaveLength(1);
    expect(res.body.data.realizedSummaries[0].realizedGainLoss.amount).toBe('500');
    expect(res.body.data.replayMetadata.processedTransactionCount).toBe(2);
  });

  it('asOf on positions endpoint correctly filters historical position balances', async () => {
    const resBeforeSell = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions?asOf=2026-01-15`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(resBeforeSell.body.data.positions).toHaveLength(1);
    expect(resBeforeSell.body.data.positions[0].quantity).toBe('100');

    const resAfterSell = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions?asOf=2026-01-25`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(resAfterSell.body.data.positions).toHaveLength(1);
    expect(resAfterSell.body.data.positions[0].quantity).toBe('50');
  });

  it('invalid asOf date string returns 400 Bad Request with PORTFOLIO.INVALID_AS_OF_DATE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=not-a-date`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(res.body.code).toBe('PORTFOLIO.INVALID_AS_OF_DATE');
  });

  it('invalid calendar date returns 400 Bad Request with PORTFOLIO.INVALID_AS_OF_DATE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-02-30`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(res.body.code).toBe('PORTFOLIO.INVALID_AS_OF_DATE');
  });
});
