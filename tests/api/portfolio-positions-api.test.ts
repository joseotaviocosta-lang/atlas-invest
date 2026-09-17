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

describe('API Integration: Portfolio Positions Endpoint (GET /api/v1/portfolios/:id/positions)', () => {
  let app: INestApplication;
  let authToken: string;
  const prisma = getTestPrismaClient();

  const userId = '11111111-1111-4111-8111-111111111111';
  let portfolioId: string;
  let account1Id: string;
  let account2Id: string;
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
        email: 'portfolio-pos-tester@atlas.dev',
        name: 'Portfolio Positions Tester',
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

    const account1 = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta XP 1',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account1Id = account1.id;

    const account2 = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta XP 2',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account2Id = account2.id;

    const asset = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetPetr4Id = asset.id;

    // Account 1 buys 100 PETR4
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account1Id,
        assetId: assetPetr4Id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 20.0,
        currency: 'BRL',
        tradeDate: new Date('2026-01-10T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    // Account 2 buys 50 PETR4
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account2Id,
        assetId: assetPetr4Id,
        type: 'BUY',
        quantity: 50,
        unitPrice: 30.0,
        currency: 'BRL',
        tradeDate: new Date('2026-01-12T00:00:00Z'),
        source: 'MANUAL',
      },
    });
  });

  it('GET /positions should return consolidated positions by default', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.portfolioId).toBe(portfolioId);
    expect(res.body.data.accountId).toBeNull();
    expect(res.body.data.positions).toHaveLength(1);
    expect(res.body.data.positions[0].quantity).toBe('150');
    expect(res.body.data.positions[0].totalCost).toEqual({ amount: '3500', currency: 'BRL' });
  });

  it('GET /positions?accountId=... should filter positions to single account', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions?accountId=${account2Id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accountId).toBe(account2Id);
    expect(res.body.data.positions).toHaveLength(1);
    expect(res.body.data.positions[0].quantity).toBe('50');
    expect(res.body.data.positions[0].totalCost).toEqual({ amount: '1500', currency: 'BRL' });
  });

  it('GET /positions?accountId=... should return 404 if account does not belong to portfolio', async () => {
    const fakeAccountId = 'd0000000-0000-4000-8000-999999999999';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions?accountId=${fakeAccountId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PORTFOLIO.INVALID_ACCOUNT_SCOPE');
  });
});
