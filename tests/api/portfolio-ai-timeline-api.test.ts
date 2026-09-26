import 'reflect-metadata';

process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.RATE_BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';

describe('API Integration: Portfolio AI Timeline Grounding (GET /api/v1/portfolios/:portfolioId/ai/grounding/timeline, Phase 3X)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Timeline Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolioWithEvents(token: string) {
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Histórico', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;

    const institution = await prisma.institution.create({
      data: { name: 'Corretora XP', type: 'BROKER', country: 'BR' },
    });

    const account = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta BRL',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    const petr4 = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });

    const vale3 = await prisma.asset.create({
      data: {
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });

    // 1. BUY PETR4 on 2026-08-10
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: petr4.id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 35.0,
        currency: 'BRL',
        tradeDate: new Date('2026-08-10T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    // 2. BUY VALE3 on 2026-08-20
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: vale3.id,
        type: 'BUY',
        quantity: 50,
        unitPrice: 60.0,
        currency: 'BRL',
        tradeDate: new Date('2026-08-20T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    // 3. DIVIDEND on PETR4 on 2026-09-01
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: petr4.id,
        type: 'DIVIDEND',
        quantity: 0,
        unitPrice: 0,
        amount: 150.0,
        currency: 'BRL',
        tradeDate: new Date('2026-09-01T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    return { portfolioId, petr4Id: petr4.id, vale3Id: vale3.id };
  }

  it('rejects unauthenticated request with 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/some-id/ai/grounding/timeline')
      .expect(401);
  });

  it('returns 404 anti-enumeration for non-existent or other user portfolio', async () => {
    const userId = '11111111-1111-4111-8111-000000000001';
    await ensureUser(userId);
    const userA = await createAuthenticatedUserSession(userId);

    const nonExistentPortfolioId = '99999999-9999-4999-8999-999999999999';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${nonExistentPortfolioId}/ai/grounding/timeline`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(404);

    expect(res.body.code).toBe('PORTFOLIO.NOT_FOUND');
  });

  it('returns 200 with canonical timeline grounding context for entire portfolio', async () => {
    const userId = '11111111-1111-4111-8111-000000000002';
    await ensureUser(userId);
    const user = await createAuthenticatedUserSession(userId);

    const { portfolioId } = await seedPortfolioWithEvents(user.token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/ai/grounding/timeline?startDate=2026-08-01&endDate=2026-09-10`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const body = res.body.data;
    expect(body.schemaVersion).toBe('1.0');
    expect(body.portfolioId).toBe(portfolioId);
    expect(body.scope.type).toBe('TIMELINE');
    expect(body.period).toEqual({ from: '2026-08-01', to: '2026-09-10' });
    expect(body.events.length).toBe(3);
    expect(body.summaryFacts.eventCountIncluded).toBe(3);
    expect(body.summaryFacts.hasMore).toBe(false);
    expect(body.capabilities.canExplainTimelineEvents).toBe(true);
    expect(body.facts.length).toBeGreaterThan(0);
  });

  it('filters events strictly when assetId is provided (ASSET_TIMELINE scope)', async () => {
    const userId = '11111111-1111-4111-8111-000000000003';
    await ensureUser(userId);
    const user = await createAuthenticatedUserSession(userId);

    const { portfolioId, petr4Id } = await seedPortfolioWithEvents(user.token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/ai/grounding/timeline?startDate=2026-08-01&endDate=2026-09-10&assetId=${petr4Id}`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const body = res.body.data;
    expect(body.scope.type).toBe('ASSET_TIMELINE');
    expect(body.scope.assetId).toBe(petr4Id);
    expect(body.scope.symbol).toBe('PETR4');
    expect(body.events.length).toBe(2); // BUY and DIVIDEND on PETR4, excluding VALE3
    for (const evt of body.events) {
      expect(evt.assetId).toBe(petr4Id);
    }
  });

  it('returns 404 anti-enumeration when assetId does not exist in portfolio history', async () => {
    const userId = '11111111-1111-4111-8111-000000000004';
    await ensureUser(userId);
    const user = await createAuthenticatedUserSession(userId);

    const { portfolioId } = await seedPortfolioWithEvents(user.token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/ai/grounding/timeline?startDate=2026-08-01&endDate=2026-09-10&assetId=unrelated-asset-id`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);

    expect(res.body.code).toBe('PORTFOLIO.ASSET_NOT_FOUND');
  });

  it('returns 400 when date range is inverted (startDate > endDate)', async () => {
    const userId = '11111111-1111-4111-8111-000000000005';
    await ensureUser(userId);
    const user = await createAuthenticatedUserSession(userId);

    const { portfolioId } = await seedPortfolioWithEvents(user.token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/ai/grounding/timeline?startDate=2026-09-10&endDate=2026-08-01`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);

    expect(res.body.code).toBe('PORTFOLIO.INVALID_DATE_RANGE');
  });

  it('returns 400 when date range exceeds 366 days window', async () => {
    const userId = '11111111-1111-4111-8111-000000000006';
    await ensureUser(userId);
    const user = await createAuthenticatedUserSession(userId);

    const { portfolioId } = await seedPortfolioWithEvents(user.token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/ai/grounding/timeline?startDate=2025-01-01&endDate=2026-09-01`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);

    expect(res.body.code).toBe('PORTFOLIO.DATE_RANGE_EXCEEDED');
  });
});
