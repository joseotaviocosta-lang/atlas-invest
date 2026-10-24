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
 * Phase 5Q-E — saved hypothetical scenarios + comparison (input only).
 *
 * The API persists the declared hypothesis; detail/compare recompute
 * live against the current portfolio + strategy. No winner, no score,
 * no execution. Ownership is anti-enumerated (404 everywhere foreign).
 */
describe('API Integration: saved allocation scenarios (Phase 5Q-E)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function scenariosUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-scenarios`;
  }

  function scenarioUrl(scenarioId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-scenarios/${scenarioId}`;
  }

  function compareUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-scenarios/compare`;
  }

  function strategyUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy`;
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
    await buy(petr4.id, '100', '30.00', `NEG-5QE-${Date.now()}-1`);
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

  async function saveScenario(
    body: unknown = {
      name: 'Aporte de novembro',
      type: 'CONTRIBUTION',
      changes: [{ category: 'FIXED_INCOME', amount: '10.000,50' }],
    },
  ) {
    const res = await request(app.getHttpServer())
      .post(scenariosUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data.scenario as {
      id: string;
      name: string;
      changes: Array<{ category: string; amount: string }>;
      hypotheticalTotal: string;
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

  it('creates a valid scenario storing canonical input only', async () => {
    const saved = await saveScenario();
    expect(saved.id).toBeDefined();
    expect(saved.name).toBe('Aporte de novembro');
    expect(saved.changes).toEqual([{ category: 'FIXED_INCOME', amount: '10000.5' }]);
    expect(saved.hypotheticalTotal).toBe('10000.5');
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toMatch(/projected|deviation|weight|score|coverage|valuation/i);
  });

  it('rejects invalid names, amounts, duplicates and unknown categories', async () => {
    const badBodies: unknown[] = [
      { name: '', type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '100' }] },
      { name: '   ', type: 'CONTRIBUTION', changes: [{ category: 'STOCK', amount: '100' }] },
      {
        name: 'x'.repeat(81),
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
      },
      {
        name: '<b>html</b>',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
      },
      {
        name: 'Bad amount',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: 'abc' }],
      },
      {
        name: 'Zero',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '0' }],
      },
      {
        name: 'Dup',
        type: 'CONTRIBUTION',
        changes: [
          { category: 'STOCK', amount: '100' },
          { category: 'STOCK', amount: '200' },
        ],
      },
      {
        name: 'Unknown',
        type: 'CONTRIBUTION',
        changes: [{ category: 'CRYPTO_X', amount: '100' }],
      },
      {
        name: 'Wrong type',
        type: 'WITHDRAWAL',
        changes: [{ category: 'STOCK', amount: '100' }],
      },
      { name: 'Empty', type: 'CONTRIBUTION', changes: [] },
    ];
    for (const body of badBodies) {
      const res = await request(app.getHttpServer())
        .post(scenariosUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.portfolioAllocationScenario.count({ where: { portfolioId } })).toBe(0);
  });

  it('rejects injected server-authority fields and unknown fields', async () => {
    for (const body of [
      {
        name: 'T',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        targets: [{ category: 'STOCK', targetBp: 10000 }],
      },
      {
        name: 'T',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        currency: 'USD',
      },
      {
        name: 'T',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100', currentValue: '999' }],
      },
      {
        name: 'T',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        portfolioId,
      },
      {
        name: 'T',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
        provider: 'B3',
      },
    ]) {
      const res = await request(app.getHttpServer())
        .post(scenariosUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('allows duplicate names (identity is the id)', async () => {
    const first = await saveScenario({
      name: 'Mesmo nome',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    const second = await saveScenario({
      name: 'Mesmo nome',
      type: 'CONTRIBUTION',
      changes: [{ category: 'CASH', amount: '200' }],
    });
    expect(first.id).not.toBe(second.id);
  });

  it('enforces the per-portfolio cap without deleting anything', async () => {
    for (let index = 0; index < 50; index += 1) {
      await prisma.portfolioAllocationScenario.create({
        data: {
          portfolioId,
          name: `Bulk ${index}`,
          type: 'CONTRIBUTION',
          changes: { create: [{ category: 'STOCK', amount: '100' }] },
        },
      });
    }
    const res = await request(app.getHttpServer())
      .post(scenariosUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Fifty-first',
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '100' }],
      });
    expect(res.status).toBe(400);
    expect(await prisma.portfolioAllocationScenario.count({ where: { portfolioId } })).toBe(50);
  });

  it('protects foreign portfolios with 404 on every route', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qe@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
    const own = await saveScenario();
    const foreign = await prisma.portfolioAllocationScenario.create({
      data: {
        portfolioId: strangerPortfolio,
        name: 'Foreign',
        type: 'CONTRIBUTION',
        changes: { create: [{ category: 'STOCK', amount: '100' }] },
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(scenariosUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .post(scenariosUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'X',
            type: 'CONTRIBUTION',
            changes: [{ category: 'STOCK', amount: '100' }],
          })
      ).status,
    ).toBe(404);
    // Cross-portfolio scenario id: 404, never leaked.
    const crossResponses = [
      await request(app.getHttpServer())
        .get(scenarioUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`),
      await request(app.getHttpServer())
        .put(scenarioUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Hijack',
          type: 'CONTRIBUTION',
          changes: [{ category: 'STOCK', amount: '100' }],
        }),
      await request(app.getHttpServer())
        .delete(scenarioUrl(foreign.id))
        .set('Authorization', `Bearer ${authToken}`),
      await request(app.getHttpServer())
        .post(compareUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ scenarioIds: [own.id, foreign.id] }),
    ];
    for (const cross of crossResponses) {
      expect(cross.status).toBe(404);
    }
    expect(
      (
        await request(app.getHttpServer())
          .get(scenarioUrl(randomUUID()))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('lists light metadata without simulating', async () => {
    await saveScenario({
      name: 'B cenário',
      type: 'CONTRIBUTION',
      changes: [
        { category: 'STOCK', amount: '3000' },
        { category: 'FIXED_INCOME', amount: '7000' },
      ],
    });
    await saveScenario({
      name: 'A cenário',
      type: 'CONTRIBUTION',
      changes: [{ category: 'CASH', amount: '500' }],
    });
    const res = await request(app.getHttpServer())
      .get(scenariosUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.limit).toBe(50);
    expect(res.body.data.scenarios).toHaveLength(2);
    const [latest] = res.body.data.scenarios;
    expect(latest.name).toBe('A cenário');
    expect(latest.hypotheticalTotal).toBe('500');
    // No live simulation in the list payload.
    expect(JSON.stringify(res.body)).not.toMatch(/projectedBp|deviationBp|outsideTolerance/i);
  });

  it('opens a saved scenario with a live recomputation', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await saveScenario();
    const res = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.saved.id).toBe(saved.id);
    expect(res.body.data.strategy.targets).toEqual([
      { category: 'FIXED_INCOME', targetBp: 4000 },
      { category: 'STOCK', targetBp: 6000 },
    ]);
    const live = res.body.data.live;
    expect(live.totals).toMatchObject({
      current: '3700',
      scenario: '10000.5',
      projected: '13700.5',
      currency: 'BRL',
    });
    expect(live.generatedAt).toBeDefined();
    expect(live.marketDataAsOf).toBeDefined();
    expect(res.body.data.limitations).toEqual([]);
  });

  it('keeps the saved scenario when the strategy is removed, with NO_STRATEGY live', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await saveScenario();
    await request(app.getHttpServer())
      .delete(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.saved.id).toBe(saved.id);
    expect(res.body.data.live).toBeNull();
    expect(res.body.data.limitations).toEqual(['NO_STRATEGY']);
    const listed = await request(app.getHttpServer())
      .get(scenariosUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(listed.body.data.scenarios).toHaveLength(1);
  });

  it('recomputes live when the strategy changes', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await saveScenario({
      name: 'Recompute',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    const before = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targets: [{ category: 'FIXED_INCOME', targetBp: 10000 }] })
      .expect(200);
    const after = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    const fixedBefore = before.body.data.live.rows.find(
      (row: { category: string }) => row.category === 'FIXED_INCOME',
    );
    const fixedAfter = after.body.data.live.rows.find(
      (row: { category: string }) => row.category === 'FIXED_INCOME',
    );
    expect(fixedBefore.targetBp).toBe(4000);
    expect(fixedAfter.targetBp).toBe(10000);
    // STOCK target removed by the replacement: projected row target becomes 0.
    const stockAfter = after.body.data.live.rows.find(
      (row: { category: string }) => row.category === 'STOCK',
    );
    expect(stockAfter.targetBp).toBe(0);
    // Same projected weight (0), different deviation: recompute uses live targets.
    expect(fixedBefore.projectedBp).toBe(fixedAfter.projectedBp);
    expect(fixedBefore.projectedDeviationBp).toBe(-4000);
    expect(fixedAfter.projectedDeviationBp).toBe(-10000);
  });

  it('fail-closes live on insufficient data without deleting the scenario', async () => {
    await seedStrategy();
    const saved = await saveScenario();
    const res = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.live).toBeNull();
    expect(res.body.data.limitations).toEqual(['INSUFFICIENT_DATA']);
  });

  it('updates atomically and deletes without touching the rest', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await saveScenario();
    const updated = await request(app.getHttpServer())
      .put(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Renamed — cópia',
        type: 'CONTRIBUTION',
        changes: [{ category: 'CASH', amount: '250,75' }],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.scenario.name).toBe('Renamed — cópia');
    expect(updated.body.data.scenario.changes).toEqual([{ category: 'CASH', amount: '250.75' }]);
    expect(updated.body.data.scenario.hypotheticalTotal).toBe('250.75');
    const deleted = await request(app.getHttpServer())
      .delete(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ deleted: true });
    expect(
      (
        await request(app.getHttpServer())
          .get(scenarioUrl(saved.id))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      await prisma.portfolioAllocationScenarioChange.count({
        where: { scenarioId: saved.id },
      }),
    ).toBe(0);
    // Strategy and transactions untouched.
    expect(await prisma.portfolioAllocationStrategyTarget.count({ where: { portfolioId } })).toBe(
      2,
    );
    expect((await prisma.transaction.count({ where: { portfolioId } })).toString()).toBe('1');
  });

  it('compares two scenarios on the same live basis with no winner', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const first = await saveScenario({
      name: 'Aporte conservador',
      type: 'CONTRIBUTION',
      changes: [{ category: 'FIXED_INCOME', amount: '10000' }],
    });
    const second = await saveScenario({
      name: 'Aporte dividido',
      type: 'CONTRIBUTION',
      changes: [
        { category: 'STOCK', amount: '3000' },
        { category: 'FIXED_INCOME', amount: '7000' },
      ],
    });
    const res = await request(app.getHttpServer())
      .post(compareUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ scenarioIds: [first.id, second.id] });
    expect(res.status).toBe(200);
    const { scenarios: metas, comparison, limitations } = res.body.data;
    expect(metas.map((meta: { id: string }) => meta.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(comparison.currency).toBe('BRL');
    expect(comparison.sameScenarioTotal).toBe(true);
    const [a, b] = comparison.sides;
    expect(a.scenarioTotal).toBe('10000');
    expect(b.scenarioTotal).toBe('10000');
    expect(a.name).toBe('Aporte conservador');
    expect(b.name).toBe('Aporte dividido');
    expect(typeof a.outsideCount).toBe('number');
    expect(typeof a.totalAbsDeviationBp).toBe('number');
    expect(a.projectedWeights.length).toBeGreaterThan(0);
    // No winner/score/ranking anywhere.
    expect(comparison).not.toHaveProperty('winner');
    expect(JSON.stringify(res.body)).not.toMatch(/winner|bestScenario|score|recomend/i);
    expect(Array.isArray(limitations)).toBe(true);
    // Same-basis: matches independent live details exactly.
    const detailA = await request(app.getHttpServer())
      .get(scenarioUrl(first.id))
      .set('Authorization', `Bearer ${authToken}`);
    const detailB = await request(app.getHttpServer())
      .get(scenarioUrl(second.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(a.projectedTotal).toBe(detailA.body.data.live.totals.projected);
    expect(b.projectedTotal).toBe(detailB.body.data.live.totals.projected);
    expect(detailA.body.data.live.totals.current).toBe(detailB.body.data.live.totals.current);
  });

  it('rejects duplicate and malformed compare ids', async () => {
    const first = await saveScenario({
      name: 'S1',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    for (const body of [
      { scenarioIds: [first.id, first.id] },
      { scenarioIds: [first.id] },
      { scenarioIds: [first.id, randomUUID(), randomUUID()] },
      { scenarioIds: ['not-a-uuid', first.id] },
      { scenarioIds: 'nope' },
      {},
    ]) {
      const res = await request(app.getHttpServer())
        .post(compareUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('exposes no internal identifiers beyond the scenario public id', async () => {
    await seedValuedPortfolio();
    await seedStrategy();
    const saved = await saveScenario();
    const second = await saveScenario({
      name: 'S2',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '50' }],
    });
    const detail = await request(app.getHttpServer())
      .get(scenarioUrl(saved.id))
      .set('Authorization', `Bearer ${authToken}`);
    const compared = await request(app.getHttpServer())
      .post(compareUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ scenarioIds: [saved.id, second.id] });
    for (const payload of [detail.body, compared.body]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(
        /passwordHash|refreshToken|assetId|transactionId|externalId|fingerprint|provider/i,
      );
    }
  });
});
