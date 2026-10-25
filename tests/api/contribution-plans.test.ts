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
import { Asset } from '@atlas/domain';

/**
 * Phase 5Q-F — user-declared contribution plans (future intent, not advice).
 *
 * The API persists intent only. Completing/cancelling flips status —
 * never creates transactions, orders or ledger writes. Live impact
 * recomputes against the current portfolio + strategy.
 */
describe('API Integration: contribution plans (Phase 5Q-F)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function plansUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans`;
  }

  function planUrl(planId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans/${planId}`;
  }

  function strategyUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy`;
  }

  function scenariosUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-scenarios`;
  }

  async function createAsset(ticker: string, currency = 'BRL') {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: currency as never,
      exchange: currency === 'BRL' ? 'B3' : 'NASDAQ',
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });
    return asset;
  }

  async function buy(assetId: string, quantity: string, unitPrice: string, externalId: string) {
    const total = (Number(quantity) * Number(unitPrice)).toFixed(2);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity,
        unitPrice,
        totalAmount: total,
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId,
      });
    expect(res.status).toBe(201);
  }

  async function seedQuote(assetId: string, close: string, currency = 'BRL') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${today}T00:00:00.000Z`),
        currency,
        close,
        provider: 'BRAPI',
        providerSymbol: 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  async function seedValuedPortfolio() {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', `NEG-5QF-${Date.now()}-1`);
    await seedQuote(petr4.id, '37.00');
  }

  async function seedStrategy() {
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 6000 },
          { category: 'FIXED_INCOME', targetBp: 4000 },
        ],
      })
      .expect(200);
  }

  const VALID_BODY = {
    name: 'Aporte de novembro',
    plannedDate: '2099-11-10',
    items: [
      { category: 'STOCK', amount: '2.000' },
      { category: 'FIXED_INCOME', amount: '3.000,50' },
    ],
  };

  async function createPlan(body: unknown = VALID_BODY) {
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data.plan as {
      id: string;
      name: string;
      plannedDate: string;
      status: string;
      currency: string;
      total: string;
      items: Array<{ category: string; amount: string }>;
    };
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

  it('creates a valid plan with derived currency and totals', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    expect(plan.status).toBe('PLANNED');
    expect(plan.currency).toBe('BRL');
    expect(plan.plannedDate).toBe('2099-11-10');
    expect(plan.items).toEqual([
      { category: 'FIXED_INCOME', amount: '3000.5' },
      { category: 'STOCK', amount: '2000' },
    ]);
    expect(plan.total).toBe('5000.5');
    expect(JSON.stringify(plan)).not.toMatch(/projected|deviation|score|transaction/i);
  });

  it('rejects invalid dates, money, duplicates and unknown categories', async () => {
    await seedValuedPortfolio();
    const badBodies: unknown[] = [
      { ...VALID_BODY, plannedDate: '2000-01-01' },
      { ...VALID_BODY, plannedDate: '10/11/2099' },
      { ...VALID_BODY, plannedDate: '2099-13-01' },
      { ...VALID_BODY, plannedDate: '2099-02-30' },
      { ...VALID_BODY, name: '' },
      { ...VALID_BODY, name: 'x'.repeat(81) },
      { ...VALID_BODY, name: '<b>x</b>' },
      { ...VALID_BODY, items: [{ category: 'STOCK', amount: 'abc' }] },
      { ...VALID_BODY, items: [{ category: 'STOCK', amount: '0' }] },
      {
        ...VALID_BODY,
        items: [
          { category: 'STOCK', amount: '100' },
          { category: 'STOCK', amount: '200' },
        ],
      },
      { ...VALID_BODY, items: [{ category: 'NOPE', amount: '100' }] },
      { ...VALID_BODY, items: [] },
    ];
    for (const body of badBodies) {
      const res = await request(app.getHttpServer())
        .post(plansUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.portfolioContributionPlan.count({ where: { portfolioId } })).toBe(0);
  });

  it('rejects injected server-owned fields and unknown fields', async () => {
    await seedValuedPortfolio();
    for (const body of [
      { ...VALID_BODY, status: 'COMPLETED' },
      { ...VALID_BODY, currency: 'USD' },
      { ...VALID_BODY, completedAt: '2099-01-01T00:00:00.000Z' },
      { ...VALID_BODY, portfolioId },
      { ...VALID_BODY, provider: 'B3' },
      { ...VALID_BODY, source: 'CERT' },
      { ...VALID_BODY, extra: 'nope' },
    ]) {
      const res = await request(app.getHttpServer())
        .post(plansUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('protects foreign portfolios and cross-portfolio plans with 404', async () => {
    await seedValuedPortfolio();
    const own = await createPlan();
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qf@atlas.dev', name: 'Stranger', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'Stranger Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(plansUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .post(plansUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
          .send(VALID_BODY)
      ).status,
    ).toBe(404);
    const foreign = await prisma.portfolioContributionPlan.create({
      data: {
        portfolioId: strangerPortfolio,
        name: 'Foreign',
        plannedDate: new Date('2099-01-01'),
        status: 'PLANNED',
        currency: 'BRL',
        items: { create: [{ category: 'STOCK', amount: '100' }] },
      },
    });
    for (const res of [
      await request(app.getHttpServer())
        .get(planUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`),
      await request(app.getHttpServer())
        .put(planUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`)
        .send(VALID_BODY),
      await request(app.getHttpServer())
        .post(`${planUrl(foreign.id)}/complete`)
        .set('Authorization', `Bearer ${authToken}`),
      await request(app.getHttpServer())
        .post(`${planUrl(foreign.id)}/cancel`)
        .set('Authorization', `Bearer ${authToken}`),
      await request(app.getHttpServer())
        .delete(planUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(own.id).toBeDefined();
  });

  it('opens a plan with live impact recomputed now', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const plan = await createPlan();
    const res = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.plan.id).toBe(plan.id);
    const live = res.body.data.live;
    // Current 3700 + plan 5000.5 → projected 8700.5 in BRL.
    expect(live.totals).toMatchObject({
      current: '3700',
      scenario: '5000.5',
      projected: '8700.5',
      currency: 'BRL',
    });
    expect(live.generatedAt).toBeDefined();
    expect(live.marketDataAsOf).toBeDefined();
    expect(res.body.data.limitations).toEqual([]);
  });

  it('creates plans without a strategy; impact reports NO_STRATEGY', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    const res = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.live).toBeNull();
    expect(res.body.data.limitations).toEqual(['NO_STRATEGY']);
  });

  it('creates a plan on an empty portfolio via base currency; impact unavailable', async () => {
    await seedStrategy();
    const plan = await createPlan();
    expect(plan.currency).toBe('BRL');
    const res = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.live).toBeNull();
    expect(res.body.data.limitations).toEqual(['INSUFFICIENT_DATA']);
  });

  it('updates PLANNED plans and freezes terminal history', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    const updated = await request(app.getHttpServer())
      .put(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Renamed',
        plannedDate: '2099-12-01',
        items: [{ category: 'CASH', amount: '100' }],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.plan.name).toBe('Renamed');
    expect(updated.body.data.plan.total).toBe('100');
    await request(app.getHttpServer())
      .post(`${planUrl(plan.id)}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const frozen = await request(app.getHttpServer())
      .put(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Mutated',
        plannedDate: '2099-12-01',
        items: [{ category: 'CASH', amount: '1' }],
      });
    expect(frozen.status).toBe(400);
    const detail = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.plan.name).toBe('Renamed');
  });

  it('completes without creating transactions and blocks double transitions', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const completed = await request(app.getHttpServer())
      .post(`${planUrl(plan.id)}/complete`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(completed.status).toBe(200);
    expect(completed.body.data.plan.status).toBe('COMPLETED');
    expect(completed.body.data.plan.completedAt).not.toBeNull();
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(before);
    expect(
      (
        await request(app.getHttpServer())
          .post(`${planUrl(plan.id)}/complete`)
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .post(`${planUrl(plan.id)}/cancel`)
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .delete(planUrl(plan.id))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
  });

  it('cancels without touching the portfolio and blocks reopen', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    const cancelled = await request(app.getHttpServer())
      .post(`${planUrl(plan.id)}/cancel`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.plan.status).toBe('CANCELLED');
    expect(cancelled.body.data.plan.completedAt).toBeNull();
    expect(
      (
        await request(app.getHttpServer())
          .post(`${planUrl(plan.id)}/complete`)
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(400);
    const listed = await request(app.getHttpServer())
      .get(plansUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(listed.body.data.history.map((item: { id: string }) => item.id)).toContain(plan.id);
  });

  it('deletes only PLANNED plans', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    expect(
      (
        await request(app.getHttpServer())
          .delete(planUrl(plan.id))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .get(planUrl(plan.id))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(await prisma.portfolioContributionPlanItem.count({ where: { planId: plan.id } })).toBe(
      0,
    );
  });

  it('creates a plan from a saved scenario and survives scenario deletion', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await request(app.getHttpServer())
      .post(scenariosUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Source',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '1.000' }],
      });
    expect(saved.status).toBe(201);
    const fromScenario = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Plano da hipótese',
        plannedDate: '2099-05-05',
        items: [{ category: 'STOCK', amount: '1000' }],
        sourceScenarioId: saved.body.data.scenario.id,
      });
    expect(fromScenario.status).toBe(201);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/portfolios/${portfolioId}/allocation-scenarios/${saved.body.data.scenario.id}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(planUrl(fromScenario.body.data.plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.plan.sourceScenarioId).toBeNull();
    expect(detail.body.data.live.totals.scenario).toBe('1000');
  });

  it('rejects foreign source scenarios', async () => {
    await seedValuedPortfolio();
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qf-src@atlas.dev', name: 'S', passwordHash: 'x' },
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
    const foreign = await prisma.portfolioAllocationScenario.create({
      data: {
        portfolioId: strangerPortfolio,
        name: 'Foreign',
        type: 'CONTRIBUTION',
        changes: { create: [{ category: 'STOCK', amount: '100' }] },
      },
    });
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...VALID_BODY, sourceScenarioId: foreign.id });
    expect(res.status).toBe(404);
  });

  it('enforces the active plan cap without deleting anything', async () => {
    await seedValuedPortfolio();
    for (let index = 0; index < 50; index += 1) {
      await prisma.portfolioContributionPlan.create({
        data: {
          portfolioId,
          name: `Bulk ${index}`,
          plannedDate: new Date('2099-01-01'),
          status: 'PLANNED',
          currency: 'BRL',
          items: { create: [{ category: 'STOCK', amount: '100' }] },
        },
      });
    }
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(await prisma.portfolioContributionPlan.count({ where: { portfolioId } })).toBe(50);
  });

  it('serves the next planned contribution for Today', async () => {
    await seedValuedPortfolio();
    const empty = await request(app.getHttpServer())
      .get(`${plansUrl()}/next`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.plan).toBeNull();
    await createPlan({ ...VALID_BODY, name: 'Later', plannedDate: '2099-12-01' });
    await createPlan({ ...VALID_BODY, name: 'Sooner', plannedDate: '2099-11-01' });
    const next = await request(app.getHttpServer())
      .get(`${plansUrl()}/next`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(next.body.data.plan.name).toBe('Sooner');
    expect(next.body.data.plan.total).toBe('5000.5');
  });

  it('exposes no internal identifiers beyond the plan public id', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const plan = await createPlan();
    const detail = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    const listed = await request(app.getHttpServer())
      .get(plansUrl())
      .set('Authorization', `Bearer ${authToken}`);
    for (const payload of [detail.body, listed.body]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(
        /passwordHash|refreshToken|assetId|transactionId|externalId|fingerprint|provider/i,
      );
    }
  });
});
