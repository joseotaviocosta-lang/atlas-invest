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

describe('API Integration: Portfolio Read Idempotency, 0 DB Mutations & Concurrency', () => {
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
        email: 'idempotency-tester@atlas.dev',
        name: 'Idempotency Tester',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Idempotency Portfolio',
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

    // Initial deposit and buy
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-01T10:00:00Z'),
        amount: '10000.00',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        amount: '2500.00',
        currency: 'BRL',
      },
    });
  });

  it('1. Repeated GET requests produce identical payload without DB mutations', async () => {
    // Record DB row counts before reads
    const txCountBefore = await prisma.transaction.count();
    const portCountBefore = await prisma.portfolio.count();
    const accCountBefore = await prisma.account.count();
    const userCountBefore = await prisma.user.count();

    const res1 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    const res2 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    const res3 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // Deep equality across successive reads
    expect(res1.body).toEqual(res2.body);
    expect(res2.body).toEqual(res3.body);

    // Verify exactly 0 DB mutations occurred
    const txCountAfter = await prisma.transaction.count();
    const portCountAfter = await prisma.portfolio.count();
    const accCountAfter = await prisma.account.count();
    const userCountAfter = await prisma.user.count();

    expect(txCountAfter).toBe(txCountBefore);
    expect(portCountAfter).toBe(portCountBefore);
    expect(accCountAfter).toBe(accCountBefore);
    expect(userCountAfter).toBe(userCountBefore);
  });

  it('2. Concurrent reads: 20 simultaneous requests across /state, /positions, /history succeed without races', async () => {
    const endpoints = [
      `/api/v1/portfolios/${portfolioId}/state`,
      `/api/v1/portfolios/${portfolioId}/positions`,
      `/api/v1/portfolios/${portfolioId}/history`,
    ];

    const requests = Array.from({ length: 20 }, (_, i) => {
      const endpoint = endpoints[i % endpoints.length];
      return request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${authToken}`);
    });

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    }
  });

  it('3. Append consistency: subsequent transaction immediately visible on next read', async () => {
    const preRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(preRes.body.data.positions[0].quantity).toBe('100');

    // Append new BUY transaction
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-01-20T10:00:00Z'),
        quantity: '50',
        unitPrice: '30.00',
        amount: '1500.00',
        currency: 'BRL',
      },
    });

    // Immediate read reflects appended transaction
    const postRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(postRes.status).toBe(200);
    expect(postRes.body.data.positions[0].quantity).toBe('150');
    expect(postRes.body.data.positions[0].totalCost).toEqual({ amount: '4000', currency: 'BRL' });
  });
});
