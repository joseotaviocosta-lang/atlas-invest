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

describe('API Integration: APP-16W-R2 Plan Selection Ambiguity Integrity', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
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
    userId = fixtures.userId;
    const auth = await createAuthenticatedUserSession(userId);
    userToken = auth.token;
  });

  it('Critical Test 1: returns 409 CONTRIBUTION_PLAN.SELECTION_REQUIRED when >1 plans exist for period', async () => {
    const prisma = getTestPrismaClient();

    const planA = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano A — Novembro',
        plannedDate: new Date('2026-11-05T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [
            { id: randomUUID(), category: 'STOCK', amount: '800.00' },
            { id: randomUUID(), category: 'FII', amount: '400.00' },
          ],
        },
      },
    });

    const planB = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano B — Novembro Extra',
        plannedDate: new Date('2026-11-15T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [
            { id: randomUUID(), category: 'STOCK', amount: '1500.00' },
          ],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(409);

    expect(res.body.code).toBe('CONTRIBUTION_PLAN.SELECTION_REQUIRED');
    expect(res.body.message).toContain('Mais de um plano de aporte existe');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.period).toBe('2026-11');
    expect(Array.isArray(res.body.details.candidates)).toBe(true);
    expect(res.body.details.candidates).toHaveLength(2);

    const candidates = res.body.details.candidates;
    expect(candidates[0].id).toBe(planA.id);
    expect(candidates[0].name).toBe('Plano A — Novembro');
    expect(candidates[0].plannedDate).toBe('2026-11-05');
    expect(candidates[0].totalPlannedAmount).toBe('1200.00');

    expect(candidates[1].id).toBe(planB.id);
    expect(candidates[1].name).toBe('Plano B — Novembro Extra');
    expect(candidates[1].plannedDate).toBe('2026-11-15');
    expect(candidates[1].totalPlannedAmount).toBe('1500.00');
  });

  it('Critical Test 2 & 3: selects exact plan when planId is provided, bypassing ambiguity gate', async () => {
    const prisma = getTestPrismaClient();

    const planA = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano A',
        plannedDate: new Date('2026-11-05T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1000.00' }],
        },
      },
    });

    const planB = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano B',
        plannedDate: new Date('2026-11-15T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'FII', amount: '2000.00' }],
        },
      },
    });

    // Request Plan A
    const resA = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11&planId=${planA.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(resA.body.data.plan.id).toBe(planA.id);
    expect(resA.body.data.plan.plannedAmount).toBe('1000.00');
    expect(resA.body.data.plan.baselineMode).toBe('PERSISTED_PLAN');
    expect(resA.body.data.plan.baselineStable).toBe(true);

    // Request Plan B
    const resB = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11&planId=${planB.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(resB.body.data.plan.id).toBe(planB.id);
    expect(resB.body.data.plan.plannedAmount).toBe('2000.00');
    expect(resB.body.data.plan.baselineMode).toBe('PERSISTED_PLAN');
    expect(resB.body.data.plan.baselineStable).toBe(true);
  });

  it('Critical Test 4: deterministic candidate order regardless of insertion order (plannedDate ASC, createdAt ASC, id ASC)', async () => {
    const prisma = getTestPrismaClient();

    // Insert later plannedDate first
    const planLate = await prisma.portfolioContributionPlan.create({
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        portfolioId,
        name: 'Plano Final do Mês',
        plannedDate: new Date('2026-11-28T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '500.00' }],
        },
      },
    });

    const planEarly = await prisma.portfolioContributionPlan.create({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        portfolioId,
        name: 'Plano Início do Mês',
        plannedDate: new Date('2026-11-02T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '700.00' }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(409);

    const candidates = res.body.details.candidates;
    expect(candidates[0].id).toBe(planEarly.id);
    expect(candidates[0].plannedDate).toBe('2026-11-02');
    expect(candidates[1].id).toBe(planLate.id);
    expect(candidates[1].plannedDate).toBe('2026-11-28');
  });

  it('Critical Test 5: exactly 1 plan uses persisted plan without ambiguity error', async () => {
    const prisma = getTestPrismaClient();

    const planOnly = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Único Novembro',
        plannedDate: new Date('2026-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '1200.00' }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.plan.id).toBe(planOnly.id);
    expect(res.body.data.plan.baselineMode).toBe('PERSISTED_PLAN');
    expect(res.body.data.plan.baselineStable).toBe(true);
  });

  it('Critical Test 6 & 7: 0 plans fall back to saved monthly goal or NO_PLAN', async () => {
    const prisma = getTestPrismaClient();

    // 0 plans + 0 goals
    const resNoPlan = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(resNoPlan.body.data.plan.source).toBe('NO_PLAN');
    expect(resNoPlan.body.data.plan.baselineMode).toBe('NO_PLAN');
    expect(resNoPlan.body.data.plan.baselineStable).toBe(false);

    // Add goal for 2026-11
    await prisma.portfolioContributionGoal.create({
      data: {
        id: randomUUID(),
        portfolioId,
        amount: '1500.00',
        currency: 'BRL',
        effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    });

    const resGoal = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(resGoal.body.data.plan.source).toBe('SAVED_GOAL');
    expect(resGoal.body.data.plan.baselineMode).toBe('LIVE_SIMULATION');
    expect(resGoal.body.data.plan.baselineStable).toBe(false);
  });

  it('Critical Test 8: anti-enumeration 404 when explicit planId belongs to another portfolio/user', async () => {
    const prisma = getTestPrismaClient();

    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-user-r2@example.com',
        passwordHash: 'dummy-hash',
        name: 'Other User',
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
        plannedDate: new Date('2026-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '500.00' }],
        },
      },
    });

    // Querying with user's portfolioId but otherPlan.id returns 404
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?planId=${otherPlan.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);
  });

  it('Critical Test 9 & 10: non-eligible status ignored; PLANNED + COMPLETED in same month causes ambiguity', async () => {
    const prisma = getTestPrismaClient();

    // Plan CANCELLED (should be ignored by period matching)
    await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Cancelado',
        plannedDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'CANCELLED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '100.00' }],
        },
      },
    });

    // Plan PLANNED
    const planActive = await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Ativo',
        plannedDate: new Date('2026-11-10T00:00:00.000Z'),
        status: 'PLANNED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'STOCK', amount: '800.00' }],
        },
      },
    });

    // With 1 CANCELLED + 1 PLANNED -> exactly 1 eligible plan
    const resSingle = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(resSingle.body.data.plan.id).toBe(planActive.id);

    // Now add COMPLETED plan in same month -> 2 eligible plans -> ambiguity
    await prisma.portfolioContributionPlan.create({
      data: {
        id: randomUUID(),
        portfolioId,
        name: 'Plano Concluído Anterior',
        plannedDate: new Date('2026-11-02T00:00:00.000Z'),
        status: 'COMPLETED',
        currency: 'BRL',
        items: {
          create: [{ id: randomUUID(), category: 'FII', amount: '600.00' }],
        },
      },
    });

    const resAmbiguous = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress?period=2026-11`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(409);

    expect(resAmbiguous.body.code).toBe('CONTRIBUTION_PLAN.SELECTION_REQUIRED');
    expect(resAmbiguous.body.details.candidates).toHaveLength(2);
  });
});
