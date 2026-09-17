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

describe('API Integration: Portfolio State Endpoint (GET /api/v1/portfolios/:id/state)', () => {
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
        email: 'portfolio-state-tester@atlas.dev',
        name: 'Portfolio State Tester',
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

    const account = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta XP Principal',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    accountId = account.id;

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
  });

  it('GET /state should return empty positions and complete status for portfolio without transactions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.portfolioId).toBe(portfolioId);
    expect(res.body.data.asOfDate).toBeNull();
    expect(res.body.data.completeness.costBasis).toBe('COMPLETE');
    expect(res.body.data.positions).toEqual([]);
    expect(res.body.data.realizedSummaries).toEqual([]);
    expect(res.body.data.incomeSummaries).toEqual([]);
    expect(res.body.data.cashFlowSummaries).toEqual([]);
    expect(res.body.data.replayMetadata.processedTransactionCount).toBe(0);
  });

  it('GET /state should accurately reflect BUY transaction with exact string decimals', async () => {
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 28.5,
        currency: 'BRL',
        tradeDate: new Date('2026-01-10T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0].assetId).toBe(assetPetr4Id);
    expect(data.positions[0].quantity).toBe('100');
    expect(data.positions[0].costBasisStatus).toBe('KNOWN');
    expect(data.positions[0].totalCost).toEqual({ amount: '2850', currency: 'BRL' });
    expect(data.positions[0].averageCost).toEqual({ amount: '28.5', currency: 'BRL' });
  });

  it('GET /state should return null for cost basis when position is INCOMPLETE', async () => {
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'TRANSFER_IN',
        quantity: 50,
        currency: 'BRL',
        tradeDate: new Date('2026-01-10T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.completeness.costBasis).toBe('INCOMPLETE');
    expect(data.positions[0].costBasisStatus).toBe('INCOMPLETE');
    expect(data.positions[0].totalCost).toBeNull();
    expect(data.positions[0].averageCost).toBeNull();
    expect(data.positions[0].quantity).toBe('50');
  });

  it('GET /state should return 400 Bad Request when asOf date is invalid', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-02-30`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PORTFOLIO.INVALID_AS_OF_DATE');
  });
});
