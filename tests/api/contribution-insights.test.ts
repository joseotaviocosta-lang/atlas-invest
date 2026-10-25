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
 * Phase 5Q-I — contribution insights (facts only, read-only).
 *
 * Aggregates plans + CONFIRMED links + ledger rows. Candidates never
 * counted, rejected invisible, cancelled out of planned totals, no
 * auto-status changes, no ledger writes. Dates are civil YYYY-MM-DD and
 * must lie within the queried period (periods end at the wall-clock day).
 */
describe('API Integration: contribution insights (Phase 5Q-I)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function insightsUrl(id: string = portfolioId, query = ''): string {
    return `/api/v1/portfolios/${id}/contribution-insights${query}`;
  }

  function plansUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans`;
  }

  function planUrl(planId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans/${planId}`;
  }

  function trackingUrl(planId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans/${planId}/tracking`;
  }

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

  async function createPlan(body: unknown = PLAN_BODY('Plano')) {
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data.plan as { id: string; total: string };
  }

  /**
   * New plans reject past dates (server wall-clock); tests simulate the
   * passage of time with a direct date update — the API then behaves
   * against the stored state exactly as it would months later.
   */
  async function backdate(planId: string, plannedDate: string) {
    await prisma.portfolioContributionPlan.update({
      where: { id: planId },
      data: { plannedDate: new Date(`${plannedDate}T00:00:00.000Z`) },
    });
  }

  const PLAN_BODY = (name: string, plannedDate = '2026-11-10') => ({
    name,
    plannedDate,
    items: [
      { category: 'STOCK', amount: '2.000' },
      { category: 'CASH', amount: '3.000' },
    ],
  });

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

  it('reports an empty period factually', async () => {
    const res = await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeNull();
    expect(res.body.data.period).toBe('1A');
    expect(res.body.data.limitations).toEqual(['NO_PLANS_IN_PERIOD']);
    expect(res.body.data.generatedAt).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/score|forecast|streak|discipline|performance/i);
  });

  it('aggregates one planned and one completed plan with actuals', async () => {
    const planned = await createPlan(PLAN_BODY('Setembro'));
    await backdate(planned.id, '2026-09-10');
    const done = await createPlan(PLAN_BODY('Agosto', '2026-11-15'));
    await backdate(done.id, '2026-08-05');
    const dep1 = await deposit('1800', '2026-09-12');
    const dep2 = await deposit('2900', '2026-09-15');
    const dep3 = await deposit('4000', '2026-08-06');
    for (const [planId, txId] of [
      [planned.id, dep1.id],
      [planned.id, dep2.id],
      [done.id, dep3.id],
    ] as Array<[string, string]>) {
      await request(app.getHttpServer())
        .post(`${trackingUrl(planId)}/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ transactionId: txId })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`${planUrl(done.id)}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.plannedTotal).toBe('10000');
    expect(summary.confirmedTotal).toBe('8700');
    expect(summary.difference).toBe('-1300');
    expect(summary.completionBp).toBe(8700);
    expect(summary.plannedPlanCount).toBe(1);
    expect(summary.completedPlanCount).toBe(1);
    expect(summary.cancelledPlanCount).toBe(0);
    expect(summary.plansWithConfirmed).toBe(2);
    expect(summary.plansWithoutConfirmed).toBe(0);
    expect(summary.completedWithoutConfirmedCount).toBe(0);
    expect(summary.plannedWithConfirmedCount).toBe(1);
    expect(summary.confirmedTransactionCount).toBe(3);
    const stock = res.body.data.byCategory.find(
      (row: { category: string }) => row.category === 'STOCK',
    );
    expect(stock).toMatchObject({ planned: '4000', confirmed: '0', difference: '-4000' });
    const cash = res.body.data.byCategory.find(
      (row: { category: string }) => row.category === 'CASH',
    );
    expect(cash).toMatchObject({ planned: '6000', confirmed: '8700', difference: '2700' });
    const august = res.body.data.timeline.find((row: { month: string }) => row.month === '2026-08');
    expect(august).toMatchObject({
      planned: '5000',
      confirmed: '4000',
      plannedCount: 1,
      completedCount: 1,
    });
    const september = res.body.data.timeline.find(
      (row: { month: string }) => row.month === '2026-09',
    );
    expect(september).toMatchObject({ planned: '5000', confirmed: '4700' });
    expect(res.body.data.recentPlans).toHaveLength(2);
    expect(res.body.data.recentPlans[0].name).toBe('Setembro');
    expect(res.body.data.recentPlans[0]).toMatchObject({
      confirmedTotal: '4700',
      confirmedCount: 2,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/score|forecast|streak|discipline|performance/i);
  });

  it('excludes cancelled plans from planned totals but keeps them visible', async () => {
    const kept = await createPlan(PLAN_BODY('Mantido'));
    await backdate(kept.id, '2026-09-10');
    const dropped = await createPlan(PLAN_BODY('Desistido', '2026-11-20'));
    await backdate(dropped.id, '2026-07-01');
    await request(app.getHttpServer())
      .post(`${planUrl(dropped.id)}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.summary.plannedTotal).toBe('5000');
    expect(res.body.data.summary.cancelledPlannedTotal).toBe('5000');
    expect(res.body.data.summary).toMatchObject({ cancelledPlanCount: 1 });
    expect(res.body.data.statusBreakdown).toContainEqual(
      expect.objectContaining({ status: 'CANCELLED', count: 1, plannedTotal: '5000' }),
    );
    expect(kept.id).toBeDefined();
  });

  it('flags completed-without-actual and planned-with-actual without changing status', async () => {
    const done = await createPlan(PLAN_BODY('Feito', '2026-11-15'));
    await backdate(done.id, '2026-08-05');
    await request(app.getHttpServer())
      .post(`${planUrl(done.id)}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const active = await createPlan(PLAN_BODY('Ativo'));
    await backdate(active.id, '2026-09-10');
    const dep = await deposit('1000', '2026-09-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(active.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.summary.completedWithoutConfirmedCount).toBe(1);
    expect(res.body.data.summary.plannedWithConfirmedCount).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(planUrl(active.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.plan.status).toBe('PLANNED');
  });

  it('filters by period and rejects invalid presets', async () => {
    const antigo = await createPlan(PLAN_BODY('Antigo', '2026-11-20'));
    await backdate(antigo.id, '2024-01-10');
    const meio = await createPlan(PLAN_BODY('Meio', '2026-11-21'));
    await backdate(meio.id, '2026-05-05');
    await createPlan(PLAN_BODY('Futuro', '2026-11-10'));
    const filtered = await request(app.getHttpServer())
      .get(insightsUrl(portfolioId, '?period=3M'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(filtered.body.data.period).toBe('3M');
    expect(filtered.body.data.summary).toBeNull();
    expect(filtered.body.data.limitations).toContain('NO_PLANS_IN_PERIOD');
    const ytd = await request(app.getHttpServer())
      .get(insightsUrl(portfolioId, '?period=YTD'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(ytd.body.data.period).toBe('YTD');
    expect(ytd.body.data.summary.plannedTotal).toBe('5000');
    const inception = await request(app.getHttpServer())
      .get(insightsUrl(portfolioId, '?period=INCEPTION'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(inception.body.data.summary.plannedTotal).toBe('10000');
    expect(
      (
        await request(app.getHttpServer())
          .get(insightsUrl(portfolioId, '?period=CUSTOM'))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .get(insightsUrl(portfolioId, '?period=nope'))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
  });

  it('groups by currency instead of mixing money', async () => {
    const brl = await createPlan({ ...PLAN_BODY('BRL plan', '2026-11-10') });
    await backdate(brl.id, '2026-05-05');
    await prisma.portfolioContributionPlan.create({
      data: {
        portfolioId,
        name: 'USD plan',
        plannedDate: new Date('2026-05-05'),
        status: 'PLANNED',
        currency: 'USD',
        items: { create: [{ category: 'CASH', amount: '100' }] },
      },
    });
    const res = await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeNull();
    expect(res.body.data.limitations).toContain('MIXED_CURRENCIES');
    expect(res.body.data.summariesByCurrency).toHaveLength(2);
    const byCurrency = new Map(
      res.body.data.summariesByCurrency.map((item: { currency: string; plannedTotal: string }) => [
        item.currency,
        item.plannedTotal,
      ]),
    );
    expect(byCurrency.get('BRL')).toBe('5000');
    expect(byCurrency.get('USD')).toBe('100');
  });

  it('protects foreign portfolios and performs zero writes', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qi@atlas.dev', name: 'S', passwordHash: 'x' },
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
          .get(insightsUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    const plan = await createPlan();
    await backdate(plan.id, '2026-09-10');
    const dep = await deposit('1000', '2026-09-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const linksBefore = await prisma.contributionPlanTransactionLink.count();
    const txBefore = await prisma.transaction.count({ where: { portfolioId } });
    await request(app.getHttpServer())
      .get(insightsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await prisma.contributionPlanTransactionLink.count()).toBe(linksBefore);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(txBefore);
    const serialized = JSON.stringify(
      (
        await request(app.getHttpServer())
          .get(insightsUrl())
          .set('Authorization', `Bearer ${authToken}`)
      ).body,
    );
    expect(serialized).not.toMatch(/passwordHash|refreshToken|externalId|fingerprint|provider/i);
  });
});
