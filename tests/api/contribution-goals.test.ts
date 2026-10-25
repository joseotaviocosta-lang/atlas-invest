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
 * Phase 5Q-J — user-defined monthly contribution goals.
 *
 * The user declares amount + effective month; the Atlas only compares.
 * No suggested amounts, no auto-tuning, no scheduler, no transactions.
 * History is versioned, never rewritten.
 */
describe('API Integration: contribution goals (Phase 5Q-J)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let userId: string;
  let accountId: string;
  const prisma = getTestPrismaClient();

  function goalsUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-goal`;
  }

  function plansUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans`;
  }

  function insightsUrl(id: string = portfolioId, query = ''): string {
    return `/api/v1/portfolios/${id}/contribution-insights${query}`;
  }

  async function putGoal(body: unknown) {
    return request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
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

  async function createPlan(name: string, plannedDate: string) {
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name,
        plannedDate,
        items: [
          { category: 'STOCK', amount: '2.000' },
          { category: 'CASH', amount: '3.000' },
        ],
      });
    expect(res.status).toBe(201);
    return res.body.data.plan as { id: string; total: string };
  }

  async function backdatePlan(planId: string, plannedDate: string) {
    await prisma.portfolioContributionPlan.update({
      where: { id: planId },
      data: { plannedDate: new Date(`${plannedDate}T00:00:00.000Z`) },
    });
  }

  async function confirmDeposit(planId: string, transactionId: string) {
    const res = await request(app.getHttpServer())
      .post(`${plansUrl()}/${planId}/tracking/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId });
    expect(res.status).toBe(200);
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

  it('reads an absent goal as null (no suggestions, no defaults)', async () => {
    const res = await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ current: null, upcoming: null, history: [] });
  });

  it('creates a goal with server-owned currency and exact money', async () => {
    const res = await putGoal({ amount: '3.000,50', effectiveMonth: '2026-11' });
    expect(res.status).toBe(200);
    expect(res.body.data.goal).toMatchObject({
      portfolioId,
      amount: '3000.5',
      currency: 'BRL',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
    });
    expect(res.body.data.created).toBe(true);
  });

  it('rejects invalid money, months, past months and injected fields', async () => {
    for (const body of [
      { amount: 'abc', effectiveMonth: '2026-11' },
      { amount: '0', effectiveMonth: '2026-11' },
      { amount: '-5', effectiveMonth: '2026-11' },
      { amount: '10.1234', effectiveMonth: '2026-11' },
      { amount: '3000', effectiveMonth: '2026-13' },
      { amount: '3000', effectiveMonth: '26-11' },
      { amount: '3000', effectiveMonth: '2026-11-01' },
      { amount: '3000', effectiveMonth: '2020-01' },
      { amount: '3000', effectiveMonth: '2026-11', currency: 'USD' },
      { amount: '3000', effectiveMonth: '2026-11', status: 'ACTIVE' },
      { amount: '3000', effectiveMonth: '2026-11', portfolioId },
    ]) {
      const res = await request(app.getHttpServer())
        .put(goalsUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.portfolioContributionGoal.count({ where: { portfolioId } })).toBe(0);
  });

  it('versions history instead of rewriting the past', async () => {
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '2000', effectiveMonth: '2026-11' })
      .expect(200);
    // Simulate elapsed time: the row took effect in September.
    await prisma.portfolioContributionGoal.updateMany({
      where: { portfolioId },
      data: { effectiveFrom: new Date('2026-09-01T00:00:00.000Z') },
    });
    const changed = await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '3000', effectiveMonth: '2026-10' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.created).toBe(false);
    const read = await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(read.body.data.current.amount).toBe('3000');
    expect(read.body.data.history).toHaveLength(1);
    expect(read.body.data.history[0]).toMatchObject({
      amount: '2000',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-10-01',
    });
    expect(read.body.data.upcoming).toBeNull();
  });

  it('updates the effective month in place without history churn', async () => {
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '3000', effectiveMonth: '2026-11' });
    const updated = await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '3500', effectiveMonth: '2026-11' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.goal.amount).toBe('3500');
    const read = await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(read.body.data.history).toEqual([]);
    expect(await prisma.portfolioContributionGoal.count({ where: { portfolioId } })).toBe(1);
  });

  it('replaces a never-effective scheduled version instead of overlapping', async () => {
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '2000', effectiveMonth: '2026-11' })
      .expect(200);
    const replaced = await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '4000', effectiveMonth: '2026-12' });
    expect(replaced.status).toBe(200);
    const read = await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    // The December version takes precedence once effective; November is gone.
    expect(read.body.data.current).toBeNull();
    expect(read.body.data.upcoming).toMatchObject({ amount: '4000', effectiveFrom: '2026-12-01' });
    expect(await prisma.portfolioContributionGoal.count({ where: { portfolioId } })).toBe(1);
  });

  it('ends the current goal and drops never-effective schedules', async () => {
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '3000', effectiveMonth: '2026-11' });
    await prisma.portfolioContributionGoal.updateMany({
      where: { portfolioId },
      data: { effectiveFrom: new Date('2026-09-01T00:00:00.000Z') },
    });
    const ended = await request(app.getHttpServer())
      .delete(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(ended.status).toBe(200);
    expect(ended.body.data.ended).toBe(true);
    expect(ended.body.data.goal.effectiveTo).toBe('2026-10-01');
    const read = await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(read.body.data.current).toBeNull();
    expect(read.body.data.history).toHaveLength(1);
    expect(
      (
        await request(app.getHttpServer())
          .delete(goalsUrl())
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    // A scheduled future version is removed outright (never took effect).
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '1000', effectiveMonth: '2026-12' })
      .expect(200);
    const removed = await request(app.getHttpServer())
      .delete(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.goal).toBeNull();
    expect(await prisma.portfolioContributionGoal.count({ where: { portfolioId } })).toBe(1);
  });

  it('protects foreign portfolios with 404', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qj@atlas.dev', name: 'S', passwordHash: 'x' },
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
          .get(goalsUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .put(goalsUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
          .send({ amount: '100', effectiveMonth: '2026-11' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .delete(goalsUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('converges concurrent creates on a single open version', async () => {
    const settled = await Promise.allSettled([
      request(app.getHttpServer())
        .put(goalsUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: '3000', effectiveMonth: '2026-11' }),
      request(app.getHttpServer())
        .put(goalsUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: '4000', effectiveMonth: '2026-11' }),
    ]);
    const statuses = settled.map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected',
    );
    // Every response is either success or an explicit concurrency conflict — never a 500.
    expect(statuses.every((status) => status === 200 || status === 400)).toBe(true);
    expect(
      await prisma.portfolioContributionGoal.count({ where: { portfolioId, effectiveTo: null } }),
    ).toBe(1);
    const open = await prisma.portfolioContributionGoal.findFirst({
      where: { portfolioId, effectiveTo: null },
    });
    expect(['3000', '4000']).toContain(open?.amount?.toString());
  });

  it('writes no transactions and exposes no internal IDs', async () => {
    await request(app.getHttpServer())
      .put(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: '3000', effectiveMonth: '2026-11' })
      .expect(200);
    const before = await prisma.transaction.count({ where: { portfolioId } });
    await request(app.getHttpServer())
      .get(goalsUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(before);
    const serialized = JSON.stringify(
      (
        await request(app.getHttpServer())
          .get(goalsUrl())
          .set('Authorization', `Bearer ${authToken}`)
      ).body,
    );
    expect(serialized).not.toMatch(/passwordHash|refreshToken|externalId|fingerprint|provider/i);
  });

  it('compares goal vs planned vs confirmed with versioned month-by-month totals', async () => {
    // Plans across three months (each totalling 5000).
    const aug = await createPlan('Agosto', '2026-11-20');
    await backdatePlan(aug.id, '2026-08-10');
    const sept = await createPlan('Setembro', '2026-11-21');
    await backdatePlan(sept.id, '2026-09-10');
    const oct = await createPlan('Outubro', '2026-11-22');
    await backdatePlan(oct.id, '2026-10-10');
    // A cancelled plan stays visible but out of the planned total.
    const cancelled = await createPlan('Cancelado', '2026-11-23');
    await backdatePlan(cancelled.id, '2026-09-05');
    await request(app.getHttpServer())
      .post(plansUrl() + '/' + cancelled.id + '/cancel')
      .set('Authorization', 'Bearer ' + authToken)
      .expect(200);

    // Confirmed actuals: 4000 in Aug, 1800 + 2900 in Sep.
    await confirmDeposit(aug.id, (await deposit('4000', '2026-08-06')).id);
    await confirmDeposit(sept.id, (await deposit('1800', '2026-09-12')).id);
    await confirmDeposit(sept.id, (await deposit('2900', '2026-09-15')).id);
    // A linked-then-unlinked deposit becomes REJECTED: never counted.
    const unlinked = await deposit('7777', '2026-09-18');
    await confirmDeposit(sept.id, unlinked.id);
    await request(app.getHttpServer())
      .delete(plansUrl() + '/' + sept.id + '/tracking/' + unlinked.id)
      .set('Authorization', 'Bearer ' + authToken)
      .expect(200);
    // A never-linked deposit is a mere candidate: never counted.
    await deposit('1000', '2026-09-25');
    // An explicitly rejected candidate: never counted.
    const rejected = await deposit('555', '2026-09-26');
    await request(app.getHttpServer())
      .post(plansUrl() + '/' + sept.id + '/tracking/reject')
      .set('Authorization', 'Bearer ' + authToken)
      .send({ transactionId: rejected.id })
      .expect(200);

    // Goal versions: 20000/month, then 30000 from October.
    await putGoal({ amount: '20000', effectiveMonth: '2026-11' }).then((res) => {
      expect(res.status).toBe(200);
    });
    await prisma.portfolioContributionGoal.updateMany({
      where: { portfolioId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });
    const switched = await putGoal({ amount: '30000', effectiveMonth: '2026-10' });
    expect(switched.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(insightsUrl(portfolioId, '?period=INCEPTION'))
      .set('Authorization', 'Bearer ' + authToken);
    expect(res.status).toBe(200);
    // Current goal is the October version; history preserved.
    expect(res.body.data.goal).toMatchObject({ amount: '30000', currency: 'BRL' });
    const progress = res.body.data.goalProgress;
    // Versioned total: 20000 (Aug) + 20000 (Sep) + 30000 (Oct).
    expect(progress.periodGoalTotal).toBe('70000');
    expect(progress.monthsWithGoal).toBe(3);
    expect(progress.monthsWithoutGoal).toBe(0);
    // Planned: 3 x 5000 (cancelled excluded). Confirmed: 8700 only.
    expect(progress.plannedTotal).toBe('15000');
    expect(progress.confirmedTotal).toBe('8700');
    expect(progress.plannedDifference).toBe('-55000');
    expect(progress.confirmedDifference).toBe('-61300');
    expect(progress.status).toBe('BELOW');
    const byMonth = Object.fromEntries(res.body.data.timeline.map((row) => [row.month, row]));
    expect(byMonth['2026-08'].goalAmount).toBe('20000');
    expect(byMonth['2026-08'].confirmed).toBe('4000');
    expect(byMonth['2026-09'].goalAmount).toBe('20000');
    expect(byMonth['2026-09'].confirmed).toBe('4700');
    expect(byMonth['2026-10'].goalAmount).toBe('30000');
    expect(byMonth['2026-10'].confirmed).toBe('0');
  });

  it('fails closed when the goal currency differs from the insights currency', async () => {
    const plan = await createPlan('Setembro', '2026-11-20');
    await backdatePlan(plan.id, '2026-09-10');
    await prisma.portfolioContributionGoal.create({
      data: {
        portfolioId,
        amount: '5000',
        currency: 'USD',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const res = await request(app.getHttpServer())
      .get(insightsUrl(portfolioId, '?period=INCEPTION'))
      .set('Authorization', 'Bearer ' + authToken);
    expect(res.status).toBe(200);
    expect(res.body.data.goal).toBeNull();
    expect(res.body.data.goalProgress).toBeNull();
    expect(res.body.data.limitations).toContain('GOAL_CURRENCY_MISMATCH');
  });
});
