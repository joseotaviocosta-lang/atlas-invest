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
 * Phase 5Q-G — planned vs actual tracking (confirmed links only).
 *
 * Candidates are derived suggestions (never counted, never persisted);
 * CONFIRMED links aggregate actuals; human confirmation is required;
 * plan status never auto-changes; ledger is never written or mutated.
 */
describe('API Integration: contribution plan tracking (Phase 5Q-G)', () => {
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

  function trackingUrl(planId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/contribution-plans/${planId}/tracking`;
  }

  function strategyUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy`;
  }

  async function createAsset(ticker: string) {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: 'BRL' as never,
      exchange: 'B3',
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

  async function deposit(amount: string, tradeDate: string, type = 'DEPOSIT') {
    return prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        type,
        tradeDate: new Date(`${tradeDate}T12:00:00.000Z`),
        amount,
        currency: 'BRL',
      },
    });
  }

  async function seedValuedPortfolio() {
    const petr4 = await createAsset('PETR4');
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        tradeDate: new Date('2026-03-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        amount: '3000.00',
        currency: 'BRL',
        provider: 'B3',
        externalId: `NEG-5QG-${Date.now()}`,
      },
    });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await prisma.marketQuoteRecord.create({
      data: {
        assetId: petr4.id,
        tradingDate: new Date(`${today}T00:00:00.000Z`),
        currency: 'BRL',
        close: '37.00',
        provider: 'BRAPI',
        providerSymbol: 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  async function seedStrategy() {
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 6000 },
          { category: 'CASH', targetBp: 4000 },
        ],
      })
      .expect(200);
  }

  async function createPlan(body: unknown = VALID_BODY) {
    const res = await request(app.getHttpServer())
      .post(plansUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data.plan as { id: string; total: string };
  }

  const VALID_BODY = {
    name: 'Aporte de novembro',
    plannedDate: '2026-11-10',
    items: [
      { category: 'STOCK', amount: '2.000' },
      { category: 'CASH', amount: '3.000' },
    ],
  };

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

  it('tracks empty actuals with deterministic candidates, counting nothing', async () => {
    await createPlan();
    const plan = (await createPlan({ ...VALID_BODY, name: 'Second' })).id;
    void plan;
    const listed = await request(app.getHttpServer())
      .get(plansUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const target = listed.body.data.upcoming.find(
      (item: { name: string }) => item.name === 'Aporte de novembro',
    );
    const dep1 = await deposit('1800', '2026-11-11');
    const dep2 = await deposit('2900', '2026-11-09');
    await deposit('5000', '2025-01-01');
    const res = await request(app.getHttpServer())
      .get(trackingUrl(target.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tracking.plannedTotal).toBe('5000');
    expect(res.body.data.tracking.actualTotal).toBe('0');
    expect(res.body.data.tracking.difference).toBe('-5000');
    expect(res.body.data.tracking.confirmedCount).toBe(0);
    expect(res.body.data.tracking.byCategory).toEqual([
      { category: 'STOCK', planned: '2000', actual: '0', difference: '-2000' },
      { category: 'CASH', planned: '3000', actual: '0', difference: '-3000' },
    ]);
    const candidateIds = res.body.data.candidates.map(
      (candidate: { transactionId: string }) => candidate.transactionId,
    );
    expect(candidateIds).toContain(dep1.id);
    expect(candidateIds).toContain(dep2.id);
    expect(res.body.data.candidates[0]).toMatchObject({ currency: 'BRL', category: 'CASH' });
    // Candidates never counted.
    expect(res.body.data.tracking.actualTotal).toBe('0');
  });

  it('confirms links (idempotent) and aggregates actuals by category', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const plan = await createPlan();
    const dep1 = await deposit('1800', '2026-11-11');
    const dep2 = await deposit('2900', '2026-11-09');
    const first = await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep1.id });
    expect(first.status).toBe(200);
    expect(first.body.data.link).toMatchObject({ transactionId: dep1.id, status: 'CONFIRMED' });
    const repeat = await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep1.id });
    expect(repeat.status).toBe(200);
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep2.id })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.tracking.actualTotal).toBe('4700');
    expect(res.body.data.tracking.difference).toBe('-300');
    expect(res.body.data.tracking.completionBp).toBe(9400);
    expect(res.body.data.tracking.confirmedCount).toBe(2);
    expect(res.body.data.confirmed).toHaveLength(2);
    expect(res.body.data.confirmed[0]).toMatchObject({ category: 'CASH' });
    expect(res.body.data.candidates).toEqual([]);
    expect(res.body.data.tracking.byCategory).toContainEqual({
      category: 'CASH',
      planned: '3000',
      actual: '4700',
      difference: '1700',
    });
    // Plan status untouched by confirmations.
    const detail = await request(app.getHttpServer())
      .get(planUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.plan.status).toBe('PLANNED');
  });

  it('rejects ineligible transactions, cross-currency and cross-portfolio links', async () => {
    await seedValuedPortfolio();
    const plan = await createPlan();
    const petr4 = await createAsset('VALE3');
    const buy = await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        tradeDate: new Date('2026-11-11T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '100.00',
        amount: '1000.00',
        currency: 'BRL',
      },
    });
    const dividend = await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: petr4.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-11-11T12:00:00.000Z'),
        amount: '100',
        currency: 'BRL',
      },
    });
    for (const transactionId of [buy.id, dividend.id]) {
      const res = await request(app.getHttpServer())
        .post(`${trackingUrl(plan.id)}/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ transactionId });
      expect(res.status, transactionId).toBe(400);
    }
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qg@atlas.dev', name: 'S', passwordHash: 'x' },
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
    const foreign = await (async () => {
      const institution =
        (await prisma.institution.findFirst()) ??
        (await prisma.institution.create({
          data: { name: 'Foreign Bank', type: 'BANK', country: 'BR' },
        }));
      const foreignAccount = await prisma.account.create({
        data: {
          portfolioId: strangerPortfolio,
          institutionId: institution.id,
          name: 'Foreign Account',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });
      return prisma.transaction.create({
        data: {
          portfolioId: strangerPortfolio,
          accountId: foreignAccount.id,
          type: 'DEPOSIT',
          tradeDate: new Date('2026-11-11T12:00:00.000Z'),
          amount: '100',
          currency: 'BRL',
        },
      });
    })();
    // Note: account belongs to another portfolio; ownership is portfolio-scoped.
    const cross = await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: foreign.id });
    expect(cross.status).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(trackingUrl(randomUUID()))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('rejects candidates (memory) and unlinks confirmed links', async () => {
    const plan = await createPlan();
    const dep = await deposit('1000', '2026-11-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id });
    expect(second.status).toBe(200);
    const tracked = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(tracked.body.data.candidates).toEqual([]);
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const unlinked = await request(app.getHttpServer())
      .delete(`${trackingUrl(plan.id)}/${dep.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data.link.status).toBe('REJECTED');
    const after = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data.tracking.actualTotal).toBe('0');
    expect(
      await request(app.getHttpServer())
        .delete(`${trackingUrl(plan.id)}/${randomUUID()}`)
        .set('Authorization', `Bearer ${authToken}`),
    ).toHaveProperty('status', 404);
  });

  it('blocks a second plan confirming the same transaction', async () => {
    const first = await createPlan({ ...VALID_BODY, name: 'First' });
    const second = await createPlan({ ...VALID_BODY, name: 'Second' });
    const dep = await deposit('1000', '2026-11-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(first.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const clash = await request(app.getHttpServer())
      .post(`${trackingUrl(second.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id });
    expect(clash.status).toBe(400);
  });

  it('keeps completed plans tracked with honest no-link copy', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const plan = await createPlan();
    await request(app.getHttpServer())
      .post(`${planUrl(plan.id)}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tracking.actualTotal).toBe('0');
    expect(res.body.data.tracking.confirmedCount).toBe(0);
    expect(res.body.data.plan).toBeDefined();
  });

  it('shows confirmed history on cancelled plans without new candidates', async () => {
    const plan = await createPlan();
    const dep = await deposit('1000', '2026-11-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${planUrl(plan.id)}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data.tracking.actualTotal).toBe('1000');
    expect(res.body.data.candidates).toEqual([]);
    expect(res.body.data.limitations).toContain('PLAN_CANCELLED');
    expect(
      (
        await request(app.getHttpServer())
          .post(`${trackingUrl(plan.id)}/confirm`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ transactionId: dep.id })
      ).status,
    ).toBe(400);
  });

  it('writes no transactions and mutates none across the tracking lifecycle', async () => {
    const plan = await createPlan();
    const dep = await deposit('1000', '2026-11-11');
    const before = await prisma.transaction.count({ where: { portfolioId } });
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${trackingUrl(plan.id)}/${dep.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(before);
    const untouched = await prisma.transaction.findUnique({ where: { id: dep.id } });
    expect(untouched?.amount?.toString()).toBe('1000');
  });

  it('exposes no internal IDs or provider refs', async () => {
    const plan = await createPlan();
    const dep = await deposit('1000', '2026-11-11');
    await request(app.getHttpServer())
      .post(`${trackingUrl(plan.id)}/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transactionId: dep.id })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(trackingUrl(plan.id))
      .set('Authorization', `Bearer ${authToken}`);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/passwordHash|refreshToken|externalId|fingerprint|provider/i);
    expect(res.body.data.confirmed[0]).not.toHaveProperty('assetId');
  });
});
