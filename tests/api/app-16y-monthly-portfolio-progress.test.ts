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

describe('API Integration: APP-16Y Monthly Portfolio Progress & Goal History', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;

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
    const auth = await createAuthenticatedUserSession(userId);
    userToken = auth.token;
  });

  it('Critical Test 1: Goals are resolved by active competence window', async () => {
    const prisma = getTestPrismaClient();

    // Goal 1: 2026-01 to 2026-07 (effective 2026-01 through 2026-06)
    await prisma.portfolioContributionGoal.create({
      data: {
        id: randomUUID(),
        portfolioId,
        amount: '1000.00',
        currency: 'BRL',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-07-01T00:00:00.000Z'),
      },
    });

    // Goal 2: 2026-07 to open
    await prisma.portfolioContributionGoal.create({
      data: {
        id: randomUUID(),
        portfolioId,
        amount: '1500.00',
        currency: 'BRL',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-01&to=2026-08`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const timeline = res.body.data;
    expect(timeline.months).toHaveLength(8);

    // Jan - Jun: 1000.00
    for (let i = 0; i < 6; i++) {
      expect(timeline.months[i].goal?.amount).toBe('1000.00');
    }
    // Jul - Aug: 1500.00
    for (let i = 6; i < 8; i++) {
      expect(timeline.months[i].goal?.amount).toBe('1500.00');
    }
  });

  it('Critical Test 2 & 15: Multiple plans in same month are all preserved with money conservation', async () => {
    const prisma = getTestPrismaClient();

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    // Plan A
    const planA = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Aporte Ações Novembro',
        plannedDate: new Date('2026-11-05T00:00:00.000Z'),
        status: 'COMPLETED',
        currency: 'BRL',
        completedAt: new Date('2026-11-10T15:00:00.000Z'),
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1200.00' }],
        },
      },
    });

    // Plan B
    const planB = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Aporte FIIs Novembro',
        plannedDate: new Date('2026-11-20T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'FII', amount: '800.00' }],
        },
      },
    });

    // Ledger BUY transaction linked to Plan A
    const tx = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-06T00:00:00.000Z'),
        settlementDate: new Date('2026-11-08T00:00:00.000Z'),
        amount: '1200.00',
        currency: 'BRL',
        quantity: '60',
        unitPrice: '20.00',
      },
    });

    await prisma.contributionPlanTransactionLink.create({
      data: {
        id: randomUUID(),
        planId: planA.id,
        transactionId: tx.id,
        status: 'CONFIRMED',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-11&to=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const nov = res.body.data.months[0];
    expect(nov.monthStatus).toBe('MULTIPLE_PLANS');
    expect(nov.plans).toHaveLength(2);
    expect(nov.totalPlannedCents).toBe(200000);
    expect(nov.totalPlannedAmount).toBe('2000.00');
    expect(nov.totalConfirmedCents).toBe(120000);
    expect(nov.totalConfirmedAmount).toBe('1200.00');
    expect(nov.completedPlanCount).toBe(1);
    expect(nov.openPlanCount).toBe(1);
  });

  it('Critical Tests 3, 4 & 5: Confirmed vs unlinked BUY vs SELL semantics', async () => {
    const prisma = getTestPrismaClient();

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Novembro',
        plannedDate: new Date('2026-11-05T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // 1. Confirmed BUY: 700.00
    const txConfirmed = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-06T00:00:00.000Z'),
        settlementDate: new Date('2026-11-08T00:00:00.000Z'),
        amount: '700.00',
        currency: 'BRL',
        quantity: '10',
        unitPrice: '70.00',
      },
    });
    await prisma.contributionPlanTransactionLink.create({
      data: {
        id: randomUUID(),
        planId: plan.id,
        transactionId: txConfirmed.id,
        status: 'CONFIRMED',
      },
    });

    // 2. Unlinked BUY: 300.00
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-15T00:00:00.000Z'),
        settlementDate: new Date('2026-11-17T00:00:00.000Z'),
        amount: '300.00',
        currency: 'BRL',
        quantity: '3',
        unitPrice: '100.00',
      },
    });

    // 3. SELL transaction: 500.00
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'SELL',
        tradeDate: new Date('2026-11-20T00:00:00.000Z'),
        settlementDate: new Date('2026-11-22T00:00:00.000Z'),
        amount: '500.00',
        currency: 'BRL',
        quantity: '5',
        unitPrice: '100.00',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-11&to=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const nov = res.body.data.months[0];
    // Confirmed remains 700 (unlinked BUY of 300 is not counted as confirmed)
    expect(nov.totalConfirmedCents).toBe(70000);
    expect(nov.totalConfirmedAmount).toBe('700.00');

    // Purchase activity includes all BUYs (700 + 300 = 1000.00)
    expect(nov.purchaseActivityCents).toBe(100000);
    expect(nov.purchaseActivityAmount).toBe('1000.00');
    expect(nov.purchaseTransactionCount).toBe(2);

    // SELL transaction is tracked separately (500.00) and never reduces purchase activity
    expect(nov.sellActivityCents).toBe(50000);
    expect(nov.sellActivityAmount).toBe('500.00');
    expect(nov.sellTransactionCount).toBe(1);
  });

  it('Critical Tests 8, 9 & 11: Empty months continuity and historical capabilities UNAVAILABLE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-05&to=2026-07`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const timeline = res.body.data;
    expect(timeline.months).toHaveLength(3);
    expect(timeline.months[0].competence).toBe('2026-05');
    expect(timeline.months[1].competence).toBe('2026-06');
    expect(timeline.months[2].competence).toBe('2026-07');

    for (const m of timeline.months) {
      expect(m.goal).toBeNull();
      expect(m.plans).toHaveLength(0);
      expect(m.monthStatus).toBe('NO_GOAL');
      expect(m.dataQuality.valuationHistoryAvailable).toBe(false);
    }

    expect(timeline.historyCapabilities.valuationHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.allocationHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.targetHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.contributionPlanHistory).toBe('AVAILABLE');
    expect(timeline.historyCapabilities.contributionGoalHistory).toBe('AVAILABLE');
  });

  it('Critical Test 12: Range defaults to 12 months ordered oldest to newest', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const timeline = res.body.data;
    expect(timeline.months).toHaveLength(12);
    for (let i = 1; i < 12; i++) {
      expect(timeline.months[i].competence > timeline.months[i - 1].competence).toBe(true);
    }
  });

  it('Critical Test 13: Range validation rejects from > to and range > 60 months with 400', async () => {
    // from > to
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-12&to=2026-01`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    // range > 60 months (2020-01 to 2026-01 is 73 months)
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2020-01&to=2026-01`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);
  });

  it('Critical Test 14: Anti-enumeration returns 404 for another user portfolio', async () => {
    const prisma = getTestPrismaClient();
    const otherUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: otherUserId,
        email: 'other-user-16y@atlas.dev',
        name: 'Other User 16Y',
        passwordHash: 'dummy_hash',
      },
    });

    const otherUserSession = await createAuthenticatedUserSession(otherUserId);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress`)
      .set('Authorization', `Bearer ${otherUserSession.token}`)
      .expect(404);
  });

  it('APP-16Y-R1: Parity Invariant between APP-16X Review and APP-16Y Timeline candidateCents', async () => {
    const prisma = getTestPrismaClient();

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'ITSA4',
        name: 'Itausa PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Paridade 16X-16Y',
        plannedDate: new Date('2026-11-15T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '2000.00' }],
        },
      },
    });

    // Confirmed BUY tx: 800.00
    const txConfirmed = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-05T00:00:00.000Z'),
        settlementDate: new Date('2026-11-07T00:00:00.000Z'),
        amount: '800.00',
        currency: 'BRL',
        quantity: '80',
        unitPrice: '10.00',
      },
    });

    await prisma.contributionPlanTransactionLink.create({
      data: {
        id: randomUUID(),
        planId: plan.id,
        transactionId: txConfirmed.id,
        status: 'CONFIRMED',
      },
    });

    // Eligible candidate BUY tx (unlinked): 450.00
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-18T00:00:00.000Z'),
        settlementDate: new Date('2026-11-20T00:00:00.000Z'),
        amount: '450.00',
        currency: 'BRL',
        quantity: '45',
        unitPrice: '10.00',
      },
    });

    // 1. Fetch APP-16X Review
    const reviewRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const review = reviewRes.body.data;

    // 2. Fetch APP-16Y Timeline
    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-11&to=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const timeline = timelineRes.body.data;
    const timelinePlan = timeline.months[0].plans.find((p: any) => p.id === plan.id);

    expect(review.candidateCents).toBe(45000);
    expect(timelinePlan.candidateCents).toBe(review.candidateCents);
    expect(timelinePlan.confirmedCents).toBe(review.confirmedCents);
    expect(timeline.months[0].totalCandidateCents).toBe(45000);
    expect(timeline.months[0].totalConfirmedCents).toBe(80000);
  });

  it('APP-16Y-R2: Cross-feature Currency Mismatch Parity - USD BUY excluded from candidateCents in both Review and Timeline', async () => {
    const prisma = getTestPrismaClient();

    // Create BRL asset
    const assetBrl = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    // Create USD asset
    const assetUsd = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'AAPL',
        name: 'Apple Inc',
        type: 'STOCK',
        currency: 'USD',
        exchange: 'NASDAQ',
      },
    });

    // Create BRL contribution plan
    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano BRL com Operações Multimoeda',
        plannedDate: new Date('2026-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // 1. Eligible BRL BUY tx: 500.00 -> should be candidate (50000 cents)
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: assetBrl.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-12T00:00:00.000Z'),
        settlementDate: new Date('2026-11-14T00:00:00.000Z'),
        amount: '500.00',
        currency: 'BRL',
        quantity: '10',
        unitPrice: '50.00',
      },
    });

    // 2. USD BUY tx: 300.00 -> currency mismatch against BRL plan -> must be EXCLUDED from candidateCents
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: assetUsd.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-15T00:00:00.000Z'),
        settlementDate: new Date('2026-11-17T00:00:00.000Z'),
        amount: '300.00',
        currency: 'USD',
        quantity: '2',
        unitPrice: '150.00',
      },
    });

    // Fetch APP-16X Review
    const reviewRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const review = reviewRes.body.data;

    // Fetch APP-16Y Timeline
    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-11&to=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const timeline = timelineRes.body.data;
    const timelinePlan = timeline.months[0].plans.find((p: any) => p.id === plan.id);

    // Parity: Both review and timeline report candidateCents = 50000 (excluding USD 300.00)
    expect(review.candidateCents).toBe(50000);
    expect(review.candidateAmount).toBe('500.00');
    expect(timelinePlan.candidateCents).toBe(review.candidateCents);
    expect(timelinePlan.candidateAmount).toBe(review.candidateAmount);
    expect(timeline.months[0].totalCandidateCents).toBe(50000);
    expect(timeline.months[0].totalCandidateAmount).toBe('500.00');
  });

  it('APP-16Y-R1: Cross-feature Goal Parity - APP-16W resolved goal == APP-16Y resolved goal', async () => {
    const prisma = getTestPrismaClient();

    // Create overlapping goals for 2026-11
    // Goal 1: effectiveFrom 2026-01 to 2026-12 (closed in Dec)
    await prisma.portfolioContributionGoal.create({
      data: {
        id: randomUUID(),
        portfolioId,
        amount: '1000.00',
        currency: 'BRL',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
    });

    // Goal 2: effectiveFrom 2026-11 to null (open, more recent effectiveFrom -> should win in Nov)
    const activeGoal = await prisma.portfolioContributionGoal.create({
      data: {
        id: randomUUID(),
        portfolioId,
        amount: '3500.00',
        currency: 'BRL',
        effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
        effectiveTo: null,
        createdAt: new Date('2026-10-15T10:00:00.000Z'),
      },
    });

    // 1. Check APP-16W tracking resolution
    const trackingRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    // 2. Check APP-16Y timeline resolution
    const timelineRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress?from=2026-11&to=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const trackingPlan = trackingRes.body.data.plan;
    const timelineGoal = timelineRes.body.data.months[0].goal;

    expect(trackingPlan.source).toBe('SAVED_GOAL');
    expect(parseFloat(trackingPlan.plannedAmount)).toBe(3500);
    expect(timelineGoal?.amount).toBe('3500.00');
    expect(parseFloat(timelineGoal!.amount)).toBe(parseFloat(trackingPlan.plannedAmount));
    expect(timelineGoal?.sourceId).toBe(activeGoal.id);
  });

  it('Critical Test 16: Zero mutations occur (strictly read-only)', async () => {
    const prisma = getTestPrismaClient();

    const planCountBefore = await prisma.portfolioContributionPlan.count();
    const linkCountBefore = await prisma.contributionPlanTransactionLink.count();
    const txCountBefore = await prisma.transaction.count();
    const goalCountBefore = await prisma.portfolioContributionGoal.count();

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/monthly-progress`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const planCountAfter = await prisma.portfolioContributionPlan.count();
    const linkCountAfter = await prisma.contributionPlanTransactionLink.count();
    const txCountAfter = await prisma.transaction.count();
    const goalCountAfter = await prisma.portfolioContributionGoal.count();

    expect(planCountAfter).toBe(planCountBefore);
    expect(linkCountAfter).toBe(linkCountBefore);
    expect(txCountAfter).toBe(txCountBefore);
    expect(goalCountAfter).toBe(goalCountBefore);
  });
});
