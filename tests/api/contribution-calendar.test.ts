import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5Q-K — contribution planning calendar (read-only temporal view).
 *
 * Goal versions + plans + CONFIRMED actuals composed per calendar month.
 * Plans bucket by plannedDate, actuals by tradeDate (linkage never moves
 * money). Cancelled listed but never summed; candidates and rejected
 * never counted. Zero writes, zero new persistence.
 */
describe('API Integration: contribution planning calendar (Phase 5Q-K)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let userId: string;
  let accountId: string;
  const prisma = getTestPrismaClient();

  function calendarUrl(id: string = portfolioId, query = ''): string {
    return `/api/v1/portfolios/${id}/contribution-calendar${query}`;
  }

  function plansUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans`;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
  });

  async function deposit(amount: string, tradeDate: string) {
    return prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        type: 'DEPOSIT',
        tradeDate: new Date(`${tradeDate}T12:00:00.000Z`),
        amount,
        currency: 'BRL',
      },
    });
  }

  async function createPlan(name: string, plannedDate: string, status = 'PLANNED') {
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name,
        plannedDate: '2026-11-20',
        items: [
          { category: 'STOCK', amount: '2.000' },
          { category: 'CASH', amount: '3.000' },
        ],
      });
    expect(res.status).toBe(201);
    const plan = res.body.data.plan as { id: string };
    await prisma.portfolioContributionPlan.update({
      where: { id: plan.id },
      data: { plannedDate: new Date(`${plannedDate}T00:00:00.000Z`) },
    });
    if (status !== 'PLANNED') {
      const action = status === 'COMPLETED' ? 'complete' : 'cancel';
      await request(app.getHttpServer())
        .post(`${plansUrl()}/${plan.id}/${action}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    }
    return plan.id;
  }

  async function confirmDeposit(planId: string, transactionId: string) {
    await request(app.getHttpServer())
      .post(`${plansUrl()}/${planId}/tracking/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId })
      .expect(200);
  }

  async function putGoal(amount: string, effectiveMonth: string) {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/portfolios/${portfolioId}/contribution-goal`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount, effectiveMonth });
    expect(res.status).toBe(200);
  }

  it('defaults to the current calendar year', async () => {
    const res = await request(app.getHttpServer())
      .get(calendarUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const year = new Date().getFullYear().toString();
    expect(res.body.data.range).toEqual({ from: `${year}-01`, to: `${year}-12` });
    expect(res.body.data.months).toHaveLength(12);
    expect(res.body.data.limitations).toContain('NO_ACTIVITY');
  });

  it('rejects invalid, reversed and oversized ranges', async () => {
    for (const query of [
      '?from=2026-13',
      '?from=26-01',
      '?from=2026-01-01',
      '?to=not-a-month',
      '?from=2026-05&to=2026-03',
      '?from=2020-01&to=2022-02',
      '?from=2026-01&to=2028-01',
    ]) {
      const res = await request(app.getHttpServer())
        .get(calendarUrl(portfolioId, query))
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status, query).toBe(400);
    }
  });

  it('protects foreign portfolios with 404', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qk@atlas.dev', name: 'S', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'SP',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(calendarUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('composes goal versions, plans and confirmed actuals per month', async () => {
    const oct = await createPlan('Aporte outubro', '2026-10-10', 'COMPLETED');
    const nov = await createPlan('Aporte novembro', '2026-11-10');
    await confirmDeposit(oct, (await deposit('2500', '2026-10-12')).id);
    // Candidate (never linked) and rejected deposits never count.
    await deposit('999', '2026-10-15');
    const rejected = await deposit('111', '2026-10-16');
    await request(app.getHttpServer())
      .post(`${plansUrl()}/${oct}/tracking/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: rejected.id })
      .expect(200);

    await putGoal('3000', '2026-11');
    await prisma.portfolioContributionGoal.updateMany({
      where: { portfolioId },
      data: { effectiveFrom: new Date('2026-10-01T00:00:00.000Z') },
    });
    const switched = await request(app.getHttpServer())
      .put(`/api/v1/portfolios/${portfolioId}/contribution-goal`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '4000', effectiveMonth: '2026-11' });
    expect(switched.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(calendarUrl(portfolioId, '?from=2026-10&to=2026-11'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.range).toEqual({ from: '2026-10', to: '2026-11' });
    const [october, november] = res.body.data.months;
    expect(october.month).toBe('2026-10');
    expect(october.goal).toMatchObject({ amount: '3000', currency: 'BRL' });
    expect(october.goalChange).toBe(true);
    expect(october.plans.map((row: { id: string }) => row.id)).toEqual([oct]);
    expect(october.confirmedActuals).toHaveLength(1);
    expect(october.confirmedActuals[0]).toMatchObject({
      tradeDate: '2026-10-12',
      amount: '2500',
      currency: 'BRL',
      type: 'DEPOSIT',
      linkedPlanId: oct,
    });
    expect(october.confirmedActuals[0].linkedPlanName).toBe('Aporte outubro');
    expect(october.confirmedActuals[0]).not.toHaveProperty('transactionId');
    expect(october.plannedDifferenceToGoal).toBe('2000');
    expect(october.confirmedDifferenceToGoal).toBe('-500');
    expect(november.month).toBe('2026-11');
    expect(november.goal).toMatchObject({ amount: '4000', currency: 'BRL' });
    expect(november.goalChange).toBe(true);
    expect(november.plans.map((row: { id: string }) => row.id)).toEqual([nov]);
    expect(november.plannedDifferenceToGoal).toBe('1000');
    const summary = res.body.data.summaryByCurrency;
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      currency: 'BRL',
      goalTotal: '7000',
      plannedTotal: '10000',
      confirmedTotal: '2500',
      monthsWithGoal: 2,
      monthsWithoutGoal: 0,
    });
  });

  it('keeps cross-month links in their factual months', async () => {
    const oct = await createPlan('Aporte outubro', '2026-10-10');
    await confirmDeposit(oct, (await deposit('2500', '2026-11-05')).id);
    const res = await request(app.getHttpServer())
      .get(calendarUrl(portfolioId, '?from=2026-10&to=2026-11'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const [october, november] = res.body.data.months;
    expect(october.plans.map((row: { id: string }) => row.id)).toEqual([oct]);
    expect(october.confirmedActuals).toEqual([]);
    expect(november.plans).toEqual([]);
    expect(november.confirmedActuals).toHaveLength(1);
    expect(november.confirmedActuals[0]).toMatchObject({
      tradeDate: '2026-11-05',
      linkedPlanId: oct,
      linkedPlanName: 'Aporte outubro',
    });
  });

  it('lists cancelled plans without summing them', async () => {
    const cancelled = await createPlan('Cancelado', '2026-10-10', 'CANCELLED');
    const res = await request(app.getHttpServer())
      .get(calendarUrl(portfolioId, '?from=2026-10&to=2026-10'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const [month] = res.body.data.months;
    expect(month.plans.map((row: { id: string }) => row.id)).toEqual([cancelled]);
    expect(month.totalsByCurrency).toEqual([
      {
        currency: 'BRL',
        planned: '0',
        plannedCount: 0,
        completedCount: 0,
        cancelledCount: 1,
        confirmed: '0',
        confirmedCount: 0,
      },
    ]);
    expect(month.plannedDifferenceToGoal).toBeNull();
  });

  it('never sums across currencies', async () => {
    await createPlan('Aporte outubro', '2026-10-10');
    await prisma.portfolioContributionGoal.create({
      data: {
        portfolioId,
        amount: '5000',
        currency: 'USD',
        effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    const res = await request(app.getHttpServer())
      .get(calendarUrl(portfolioId, '?from=2026-10&to=2026-10'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const [month] = res.body.data.months;
    expect(month.goal).toMatchObject({ amount: '5000', currency: 'USD' });
    expect(month.plannedDifferenceToGoal).toBeNull();
    expect(month.confirmedDifferenceToGoal).toBeNull();
    expect(res.body.data.currencies).toEqual(['BRL', 'USD']);
    expect(res.body.data.limitations).toContain('MIXED_CURRENCIES');
    expect(res.body.data.summaryByCurrency).toHaveLength(2);
  });

  it('performs zero writes and exposes no internal IDs', async () => {
    const planId = await createPlan('Aporte outubro', '2026-10-10');
    await confirmDeposit(planId, (await deposit('2500', '2026-10-12')).id);
    await putGoal('3000', '2026-11');
    const counts = () =>
      Promise.all([
        prisma.portfolioContributionPlan.count({ where: { portfolioId } }),
        prisma.portfolioContributionGoal.count({ where: { portfolioId } }),
        prisma.contributionPlanTransactionLink.count(),
        prisma.transaction.count({ where: { portfolioId } }),
      ]);
    const before = await counts();
    await request(app.getHttpServer())
      .get(calendarUrl(portfolioId, '?from=2026-01&to=2027-12'))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await counts()).toEqual(before);
    const serialized = JSON.stringify(
      (
        await request(app.getHttpServer())
          .get(calendarUrl(portfolioId, '?from=2026-01&to=2027-12'))
          .set('Authorization', `Bearer ${authToken}`)
      ).body,
    );
    expect(serialized).not.toMatch(
      /passwordHash|refreshToken|externalId|fingerprint|provider|secret|token/i,
    );
  });
});
