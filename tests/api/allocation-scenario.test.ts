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
 * Phase 5Q-D — hypothetical contribution simulation (ephemeral).
 *
 * The client supplies ONLY hypothetical changes; current allocation and
 * strategy load server-side. No persistence, no execution, no orders.
 */
describe('API Integration: allocation scenario simulation (Phase 5Q-D)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function strategyUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy`;
  }

  function simulateUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy/simulate`;
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

  it('simulates a valid contribution with current vs projected deviations', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-1');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();

    const res = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '1.000,50' }] });
    expect(res.status).toBe(200);
    const { scenario, comparison, limitations } = res.body.data;
    expect(scenario).not.toBeNull();
    expect(scenario.totals.currency).toBe('BRL');
    // pt-BR '1.000,50' parses to canonical 1000.5; current 3700 + 1000.5 = 4700.5.
    expect(scenario.totals).toMatchObject({
      current: '3700',
      scenario: '1000.5',
      projected: '4700.5',
    });
    const stock = scenario.rows.find((row: { category: string }) => row.category === 'STOCK');
    expect(stock).toBeDefined();
    expect(stock.scenarioAmount).toBe('1000.5');
    expect(typeof stock.projectedBp).toBe('number');
    expect(typeof stock.currentDeviationBp === 'number' || stock.currentDeviationBp === null).toBe(
      true,
    );
    expect(typeof stock.projectedDeviationBp).toBe('number');
    expect(scenario.beforeOutsideCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(limitations)).toBe(true);
    expect(comparison).not.toBeNull();
    // Response carries no internal identifiers or execution artifacts.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/assetId|transactionId|externalId|fingerprint|provider/i);
  });

  it('returns deterministic results for the same input', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-2');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();
    const body = { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '500' }] };
    const first = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    const second = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('requires a declared strategy before simulating', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-3');
    await seedQuote(petr4.id, '37.00');
    const res = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '100' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PORTFOLIO.INVALID_SCENARIO');
  });

  it('protects foreign portfolios with 404', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qd@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
    const res = await request(app.getHttpServer())
      .post(simulateUrl(strangerPortfolio))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '100' }] });
    expect(res.status).toBe(404);
  });

  it('rejects malformed money, duplicates, unknown categories and bad types', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-4');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();
    const badBodies = [
      { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: 'abc' }] },
      { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '' }] },
      { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '-5' }] },
      { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '0' }] },
      { type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '10.1234' }] },
      { type: 'WITHDRAWAL', changes: [{ category: 'STOCK', amount: '100' }] },
      { type: 'CONTRIBUTION', changes: [{ category: 'CRYPTO_X', amount: '100' }] },
      {
        type: 'CONTRIBUTION',
        changes: [
          { category: 'STOCK', amount: '100' },
          { category: 'STOCK', amount: '200' },
        ],
      },
      { type: 'CONTRIBUTION', changes: [] },
    ];
    for (const body of badBodies) {
      const res = await request(app.getHttpServer())
        .post(simulateUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('rejects injected server-authority fields and unknown fields', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-5');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();
    const injectedBodies = [
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        targets: [{ category: 'STOCK', targetBp: 10000 }],
      },
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        currency: 'USD',
      },
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100', currentValue: '99999' }],
      },
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        portfolioId,
      },
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        provider: 'B3',
      },
      {
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        source: 'CERT',
      },
    ];
    for (const body of injectedBodies) {
      const res = await request(app.getHttpServer())
        .post(simulateUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('loads strategy and allocation server-side, ignoring client-invented targets', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-6');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();
    // Even if the client wanted STOCK 100%, the server uses stored 60/40.
    const res = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'FIXED_INCOME', amount: '100' }] });
    expect(res.status).toBe(200);
    const rows = res.body.data.scenario.rows as Array<{ category: string; targetBp: number }>;
    expect(rows.find((row) => row.category === 'STOCK')).toMatchObject({ targetBp: 6000 });
    expect(rows.find((row) => row.category === 'FIXED_INCOME')).toMatchObject({ targetBp: 4000 });
  });

  it('fail-closes on empty portfolios with INSUFFICIENT_DATA and no scenario', async () => {
    await seedStrategy();
    const res = await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '100' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.scenario).toBeNull();
    expect(res.body.data.limitations).toContain('INSUFFICIENT_DATA');
  });

  it('persists nothing: simulation writes no strategy rows or transactions', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QD-7');
    await seedQuote(petr4.id, '37.00');
    await seedStrategy();
    const strategiesBefore = await prisma.portfolioAllocationStrategyTarget.count({
      where: { portfolioId },
    });
    const transactionsBefore = await prisma.transaction.count({ where: { portfolioId } });
    await request(app.getHttpServer())
      .post(simulateUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '250' }] })
      .expect(200);
    expect(await prisma.portfolioAllocationStrategyTarget.count({ where: { portfolioId } })).toBe(
      strategiesBefore,
    );
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(transactionsBefore);
  });
});
