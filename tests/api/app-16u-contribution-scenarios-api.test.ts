import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import { GetOpportunityRadarUseCase } from '../../apps/api/src/application/portfolios/opportunity-radar/get-opportunity-radar.use-case';

describe('API Integration: APP-16U Contribution Scenario Comparison', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
  let radarUseCase: GetOpportunityRadarUseCase;

  beforeAll(async () => {
    app = await createTestApp();
    radarUseCase = app.get(GetOpportunityRadarUseCase);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;
  });

  it('POST /decision-brief/scenarios returns 200 with 3 canonical scenarios, exact cents conservation, and single radar execution', async () => {
    const prisma = getTestPrismaClient();

    // Count transactions before simulation to verify zero side effects
    const initialTxCount = await prisma.transaction.count({ where: { portfolioId } });

    // Seed 3 active holdings
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

    const asset3 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'MXRF11',
        name: 'Maxi Renda FII',
        type: 'FII',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: randomUUID(),
          portfolioId,
          accountId: '44444444-4444-4444-8444-444444444444',
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
          accountId: '44444444-4444-4444-8444-444444444444',
          assetId: asset2.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '32.00',
          amount: '3200.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: randomUUID(),
          portfolioId,
          accountId: '44444444-4444-4444-8444-444444444444',
          assetId: asset3.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '10.00',
          amount: '1000.00',
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
        {
          id: randomUUID(),
          assetId: asset3.id,
          tradingDate: now,
          currency: 'BRL',
          close: '10.50',
          provider: 'BRAPI',
          providerSymbol: 'MXRF11',
          firstFetchedAt: now,
          lastFetchedAt: now,
        },
      ],
    });

    // Spy on getDecisionBrief to verify single execution (Part CA)
    const briefSpy = vi.spyOn(radarUseCase, 'getDecisionBrief');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '3000.00' })
      .expect(200);

    // Verify spy was called exactly ONCE (not 3 times)
    expect(briefSpy).toHaveBeenCalledTimes(1);
    briefSpy.mockRestore();

    const data = res.body.data;
    expect(data.portfolioId).toBe(portfolioId);
    expect(data.contributionAmount).toBe('3000.00');
    expect(data.currency).toBe('BRL');
    expect(data.modelVersion).toBe('opportunity-v2.3.1');
    expect(data.scenarios).toHaveLength(3);

    const scenarioIds = data.scenarios.map((s: any) => s.id);
    expect(scenarioIds).toEqual(['CAUTIOUS', 'BALANCED', 'OPPORTUNITY_FOCUS']);

    for (const scenario of data.scenarios) {
      expect(scenario.totalCents).toBe(300000);
      expect(scenario.allocatedCents + scenario.unallocatedCents).toBe(300000);
      // Multi-asset concentration cap: <= 50%
      for (const alloc of scenario.allocations) {
        expect(alloc.targetCents).toBeLessThanOrEqual(150000);
      }
    }

    expect(data.comparisonInsights).toBeDefined();
    expect(Array.isArray(data.comparisonInsights)).toBe(true);

    // Confirm ZERO transactions or mutations were created
    const postTxCount = await prisma.transaction.count({ where: { portfolioId } });
    expect(postTxCount).toBe(initialTxCount + 3);
  });

  it('rejects invalid scenario simulation amounts with 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '-50' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '0' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 'xyz' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '100000000.01' })
      .expect(400);
  });

  it('enforces 404 anti-enumeration for portfolios owned by another user', async () => {
    const prisma = getTestPrismaClient();
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-user-scenarios@example.com',
        passwordHash: 'test-hash',
        name: 'Other User',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUser.id);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${otherAuth.token}`)
      .send({ amount: '2000.00' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${randomUUID()}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '2000.00' })
      .expect(404);
  });

  it('handles empty portfolio gracefully: all 3 scenarios 100% unallocated with honest warning', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '1000.00' })
      .expect(200);

    const data = res.body.data;
    expect(data.scenarios).toHaveLength(3);
    for (const s of data.scenarios) {
      expect(s.allocatedCents).toBe(0);
      expect(s.unallocatedCents).toBe(100000);
      expect(s.allocations).toHaveLength(0);
    }
    expect(data.comparisonInsights[0]).toContain('Nenhum ativo atingiu');
  });
});
