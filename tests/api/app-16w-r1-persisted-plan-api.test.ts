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

describe('API Integration: APP-16W-R1 Persisted Plan Baseline & Historical Stability', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
  let accountId: string;
  let otherUserToken: string;

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

    const prisma = getTestPrismaClient();
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `other-user-${Date.now()}@test.com`,
        passwordHash: 'dummy',
        name: 'Other User',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUser.id);
    otherUserToken = otherAuth.token;
  });

  it('Critical Test 1 & 2: Persisted plan baseline remains stable and is not recalculated with current radar or changed scores/targets', async () => {
    const prisma = getTestPrismaClient();

    // 1. Create a persisted contribution plan in November 2026 with 2 category items
    const planId = randomUUID();
    await prisma.portfolioContributionPlan.create({
      data: {
        id: planId,
        portfolioId,
        name: 'Plano Novembro 2026',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [
            { id: randomUUID(), category: 'STOCK', amount: '1200.00' },
            { id: randomUUID(), category: 'FII', amount: '800.00' },
          ],
        },
      },
    });

    // 2. Query progress for period 2026-11
    const res1 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res1.status).toBe(200);
    const progress1 = res1.body.data;
    expect(progress1.plan.id).toBe(planId);
    expect(progress1.plan.source).toBe('PERSISTED_PLAN');
    expect(progress1.plan.baselineMode).toBe('PERSISTED_PLAN');
    expect(progress1.plan.baselineStable).toBe(true);
    expect(progress1.plan.plannedCents).toBe(200000); // 1200 + 800 = 2000.00
    expect(progress1.plan.categoryAllocations).toHaveLength(2);
    const stockCat = progress1.plan.categoryAllocations.find((c: any) => c.category === 'STOCK');
    const fiiCat = progress1.plan.categoryAllocations.find((c: any) => c.category === 'FII');
    expect(stockCat).toBeDefined();
    expect(stockCat.plannedAmount).toBe('1200.00');
    expect(fiiCat).toBeDefined();
    expect(fiiCat.plannedAmount).toBe('800.00');

    // 3. Seed market data changes and positions that would alter the live radar allocation
    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-10T00:00:00.000Z'),
        quantity: '10',
        unitPrice: '60.00',
        amount: '600.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    // 4. Query again - baseline MUST remain stable (not reconstructed from live radar)
    const res2 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res2.status).toBe(200);
    const progress2 = res2.body.data;
    expect(progress2.plan.id).toBe(planId);
    expect(progress2.plan.source).toBe('PERSISTED_PLAN');
    expect(progress2.plan.baselineStable).toBe(true);
    expect(progress2.plan.plannedCents).toBe(200000);
    const stockCat2 = progress2.plan.categoryAllocations.find((c: any) => c.category === 'STOCK');
    const fiiCat2 = progress2.plan.categoryAllocations.find((c: any) => c.category === 'FII');
    expect(stockCat2.plannedAmount).toBe('1200.00');
    expect(fiiCat2.plannedAmount).toBe('800.00');
    expect(progress2.overall.plannedCents).toBe(200000);
    expect(progress2.overall.actualCents).toBe(60000); // 600.00
  });

  it('Critical Test 3: Historical goal versioning respects requested competence month', async () => {
    const prisma = getTestPrismaClient();

    // Seed 2 goal versions:
    // Version 1: 2026-08 (R$ 1500.00) effective until 2026-10-01
    // Version 2: 2026-10 (R$ 3000.00) open-ended
    await prisma.portfolioContributionGoal.createMany({
      data: [
        {
          id: randomUUID(),
          portfolioId,
          amount: '1500.00',
          currency: 'BRL',
          effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          id: randomUUID(),
          portfolioId,
          amount: '3000.00',
          currency: 'BRL',
          effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
    });

    // Query competence 2026-08: must use historical goal 1500.00, not 3000.00
    const resAugust = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-08`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(resAugust.status).toBe(200);
    expect(resAugust.body.data.plan.source).toBe('SAVED_GOAL');
    expect(resAugust.body.data.plan.baselineMode).toBe('LIVE_SIMULATION');
    expect(resAugust.body.data.plan.baselineStable).toBe(false);
    expect(parseFloat(resAugust.body.data.plan.plannedAmount)).toBe(1500.00);

    // Query competence 2026-11: must use open goal 3000.00
    const resNovember = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(resNovember.status).toBe(200);
    expect(resNovember.body.data.plan.source).toBe('SAVED_GOAL');
    expect(parseFloat(resNovember.body.data.plan.plannedAmount)).toBe(3000.00);
  });

  it('Critical Test 4 & 5: No plan / No goal fallback mode', async () => {
    // Portfolio has no goals and no plans
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-07`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.plan.source).toBe('NO_PLAN');
    expect(res.body.data.plan.baselineMode).toBe('NO_PLAN');
    expect(res.body.data.plan.baselineStable).toBe(false);
    expect(res.body.data.plan.plannedCents).toBe(0);
  });

  it('Confirmed & Rejected transaction link semantics: confirmed counted, rejected excluded', async () => {
    const prisma = getTestPrismaClient();

    const planId = randomUUID();
    await prisma.portfolioContributionPlan.create({
      data: {
        id: planId,
        portfolioId,
        name: 'Plano com Links',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'ITUB4',
        name: 'Itaú Unibanco',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const txAId = randomUUID();
    const txBId = randomUUID();
    const txCId = randomUUID();

    // Seed 3 transactions with unitPrice and quantity
    await prisma.transaction.createMany({
      data: [
        {
          id: txAId,
          portfolioId,
          accountId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-11-05T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '40.00',
          amount: '400.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: txBId,
          portfolioId,
          accountId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-11-12T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '30.00',
          amount: '300.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: txCId,
          portfolioId,
          accountId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-11-20T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '25.00',
          amount: '250.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
      ],
    });

    // Seed links:
    // Tx A: CONFIRMED to planId
    // Tx C: REJECTED for planId
    // Tx B: Unlinked (Candidate)
    await prisma.contributionPlanTransactionLink.createMany({
      data: [
        {
          id: randomUUID(),
          planId,
          transactionId: txAId,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
        {
          id: randomUUID(),
          planId,
          transactionId: txCId,
          status: 'REJECTED',
          rejectedAt: new Date(),
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const progress = res.body.data;
    expect(progress.dataQuality.confirmedLinkCount).toBe(1);
    expect(progress.dataQuality.rejectedLinkCount).toBe(1);

    // Rejected transaction txCId should be excluded from actual
    const observedIds = progress.observedTransactions.map((tx: any) => tx.id);
    expect(observedIds).toContain(txAId);
    expect(observedIds).toContain(txBId);
    expect(observedIds).not.toContain(txCId);
  });

  it('Anti-enumeration: other user cannot query progress with portfolioId or planId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PORTFOLIO.NOT_FOUND');
  });
});
