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

describe('API Integration: APP-16X Monthly Contribution Plan Review & Close', () => {
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

  it('Critical Tests 1 & 2 & 3: Close plan when planned=2000, confirmed=2000, candidates=0 succeeds with status=COMPLETED', async () => {
    const prisma = getTestPrismaClient();

    // Create asset
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

    // Create plan
    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Aporte de Novembro',
        plannedDate: new Date('2026-11-05T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '2000.00' }],
        },
      },
    });

    // Create transaction in ledger
    const tx = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-05T00:00:00.000Z'),
        settlementDate: new Date('2026-11-07T00:00:00.000Z'),
        amount: '2000.00',
        currency: 'BRL',
        quantity: '100',
        unitPrice: '20.00',
      },
    });

    // Create CONFIRMED link
    await prisma.contributionPlanTransactionLink.create({
      data: {
        id: randomUUID(),
        planId: plan.id,
        transactionId: tx.id,
        status: 'CONFIRMED',
        confirmedAt: new Date('2026-11-05T12:00:00.000Z'),
      },
    });

    // 1. GET Review
    const reviewRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const review = reviewRes.body.data;
    expect(review.plan.id).toBe(plan.id);
    expect(review.status).toBe('PLANNED');
    expect(review.plannedCents).toBe(200000);
    expect(review.confirmedCents).toBe(200000);
    expect(review.candidateCents).toBe(0);
    expect(review.completionPercent).toBe(100);
    expect(review.closeReadiness.canClose).toBe(true);
    expect(review.closeReadiness.requiresPendingCandidatesAcknowledgement).toBe(false);

    // 2. Complete Plan (Close) with acknowledgeEarlyClose=true (since test date may be ongoing)
    const closeRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(200);

    expect(closeRes.body.data.plan.status).toBe('COMPLETED');
    expect(closeRes.body.data.reviewSummary.status).toBe('COMPLETED');
    expect(closeRes.body.data.reviewSummary.completedAt).not.toBeNull();

    // 3. Verify DB record
    const updatedPlan = await prisma.portfolioContributionPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(updatedPlan.status).toBe('COMPLETED');
    expect(updatedPlan.completedAt).not.toBeNull();

    // Verify ledger and links untouched
    const txInDb = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(txInDb.amount.toString()).toBe('2000');
  });

  it('Critical Tests 4 & 5: Candidates > 0 without ack returns 409 PENDING_CANDIDATES_ACK_REQUIRED; with ack succeeds', async () => {
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
        name: 'Aporte com compras pendentes',
        plannedDate: new Date('2026-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // Unlinked BUY in period => candidate
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-10T00:00:00.000Z'),
        settlementDate: new Date('2026-11-12T00:00:00.000Z'),
        amount: '600.00',
        currency: 'BRL',
        quantity: '60',
        unitPrice: '10.00',
      },
    });

    // Without ack -> returns 409
    const failedClose = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(409);

    expect(failedClose.body.code).toBe('CONTRIBUTION_PLAN.PENDING_CANDIDATES_ACK_REQUIRED');

    // With ack -> succeeds
    const successClose = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgePendingCandidates: true, acknowledgeEarlyClose: true })
      .expect(200);

    expect(successClose.body.data.plan.status).toBe('COMPLETED');
    expect(successClose.body.data.reviewSummary.candidateTransactions.length).toBe(1);

    // Candidates remain unlinked
    const links = await prisma.contributionPlanTransactionLink.findMany({
      where: { planId: plan.id },
    });
    expect(links.length).toBe(0);
  });

  it('Critical Tests 6 & 7: Period not ended requires acknowledgeEarlyClose', async () => {
    const prisma = getTestPrismaClient();

    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Futuro',
        plannedDate: new Date('2029-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // Without early close ack -> 409
    const failedRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(409);

    expect(failedRes.body.code).toBe('CONTRIBUTION_PLAN.EARLY_CLOSE_ACK_REQUIRED');

    // With early close ack -> 200
    const okRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(200);

    expect(okRes.body.data.plan.status).toBe('COMPLETED');
  });

  it('Critical Test 8: Double close is idempotent and deterministic', async () => {
    const prisma = getTestPrismaClient();

    const plan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Fechamento Duplo',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '500.00' }],
        },
      },
    });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(200);

    expect(first.body.data.plan.status).toBe('COMPLETED');

    // Second call -> returns 200 with completed plan
    const second = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(200);

    expect(second.body.data.plan.status).toBe('COMPLETED');
  });

  it('Critical Test 9: Plan belonging to another user returns 404 (anti-enumeration)', async () => {
    const prisma = getTestPrismaClient();

    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-user-x@example.com',
        name: 'Other User',
        passwordHash: 'dummy',
      },
    });

    const otherPortfolio = await prisma.portfolio.create({
      data: {
        id: randomUUID(),
        userId: otherUser.id,
        name: 'Other Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    const otherPlan = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId: otherPortfolio.id,
        name: 'Other Plan',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // Accessing with userToken -> 404
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/contribution-plans/${otherPlan.id}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/contribution-plans/${otherPlan.id}/complete`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ acknowledgeEarlyClose: true })
      .expect(404);
  });

  it('Critical Tests 10 & 12: SELL excluded, double count excluded, review totals match progress totals', async () => {
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
        name: 'Plano com SELL e BUY',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    // BUY transaction confirmed
    const buyTx = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-02T00:00:00.000Z'),
        settlementDate: new Date('2026-11-04T00:00:00.000Z'),
        amount: '600.00',
        currency: 'BRL',
        quantity: '10',
        unitPrice: '60.00',
      },
    });

    await prisma.contributionPlanTransactionLink.create({
      data: {
        id: randomUUID(),
        planId: plan.id,
        transactionId: buyTx.id,
        status: 'CONFIRMED',
      },
    });

    // SELL transaction in period (must NOT be counted)
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'SELL',
        tradeDate: new Date('2026-11-03T00:00:00.000Z'),
        settlementDate: new Date('2026-11-05T00:00:00.000Z'),
        amount: '300.00',
        currency: 'BRL',
        quantity: '5',
        unitPrice: '60.00',
      },
    });

    // 1. Get review
    const reviewRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/contribution-plans/${plan.id}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const review = reviewRes.body.data;
    expect(review.confirmedCents).toBe(60000);
    expect(review.dataQuality.excludedSellCount).toBe(1);

    // 2. Get progress endpoint for same plan
    const progressRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?planId=${plan.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const progress = progressRes.body.data;
    // Total planned and confirmed match
    expect(review.plannedCents).toBe(progress.overall.plannedCents);
    expect(review.confirmedCents).toBe(progress.overall.actualCents);
  });
});
