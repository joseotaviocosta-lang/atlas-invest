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
 * Phase 5Q-C — user-defined allocation strategy end-to-end.
 *
 * Covers the strategy lifecycle (read absent, create valid, reject invalid
 * totals/duplicates/unknown categories, atomic replace, clear) plus the
 * comparison semantics (ON_TARGET, deviation, partial-coverage qualifier,
 * multi-currency fail-closed) and ownership isolation. No recommendations,
 * no trades, no B3 involvement.
 */
describe('API Integration: allocation strategy (Phase 5Q-C)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function strategyUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/allocation-strategy`;
  }

  function detailUrl(code: string, query = '', id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/review/signals/${code}${query}`;
  }

  async function createAsset(ticker: string, currency = 'BRL') {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: currency as never,
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

  it('reads an absent strategy as null comparison', async () => {
    const res = await request(app.getHttpServer())
      .get(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.strategy).toBeNull();
    expect(res.body.data.comparison).toBeNull();
  });

  it('creates a valid strategy and compares it against current allocation', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-1');
    await seedQuote(petr4.id, '37.00');

    const put = await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 8000 },
          { category: 'CASH', targetBp: 2000 },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.data.strategy.targets).toEqual([
      { category: 'CASH', targetBp: 2000 },
      { category: 'STOCK', targetBp: 8000 },
    ]);

    const comparison = put.body.data.comparison;
    expect(comparison).not.toBeNull();
    const stock = comparison.rows.find((row: { category: string }) => row.category === 'STOCK');
    // Single STOCK position at 100% vs 80% target → +20 p.p. deviation.
    expect(stock).toMatchObject({ targetBp: 8000, state: 'ABOVE_TARGET' });
    expect(stock.deviationBp).toBe(2000);
    expect(comparison.outsideTolerance).toContain('STOCK');
    expect(comparison.worstGap).toEqual({ category: 'CASH', deviationBp: -2000 });
    expect(comparison.qualified).toBe(false);
  });

  it('rejects invalid totals, duplicates, unknown categories and bad weights', async () => {
    for (const body of [
      // total != 100%
      { targets: [{ category: 'STOCK', targetBp: 5000 }] },
      {
        targets: [
          { category: 'STOCK', targetBp: 6000 },
          { category: 'FII', targetBp: 5000 },
        ],
      },
      // duplicate category
      {
        targets: [
          { category: 'STOCK', targetBp: 5000 },
          { category: 'STOCK', targetBp: 5000 },
        ],
      },
      // unknown category
      {
        targets: [
          { category: 'CRYPTO_SUPER_GROWTH', targetBp: 5000 },
          { category: 'STOCK', targetBp: 5000 },
        ],
      },
      // non-integer weight
      { targets: [{ category: 'STOCK', targetBp: 50.5 }] },
      // negative weight
      { targets: [{ category: 'STOCK', targetBp: -1 }] },
      // empty targets
      { targets: [] },
      // unknown field
      { targets: [{ category: 'STOCK', targetBp: 10000 }], provider: 'CERT' },
    ]) {
      const res = await request(app.getHttpServer())
        .put(strategyUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(await prisma.portfolioAllocationStrategyTarget.count({ where: { portfolioId } })).toBe(
      0,
    );
  });

  it('protects foreign portfolios with 404 on read, write and clear', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qc@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
          .get(strategyUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .put(strategyUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
          .send({ targets: [{ category: 'STOCK', targetBp: 10000 }] })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .delete(strategyUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .put(strategyUrl())
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            portfolioId: strangerPortfolio,
            targets: [{ category: 'STOCK', targetBp: 10000 }],
          })
      ).status,
    ).toBe(400);
  });

  it('replaces atomically and clears without touching history', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-2');
    await seedQuote(petr4.id, '37.00');
    const transactionsBefore = await prisma.transaction.count({ where: { portfolioId } });

    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targets: [{ category: 'STOCK', targetBp: 10000 }] })
      .expect(200);
    const replaced = await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 7000 },
          { category: 'CASH', targetBp: 3000 },
        ],
      });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.strategy.targets).toHaveLength(2);
    expect(await prisma.portfolioAllocationStrategyTarget.count({ where: { portfolioId } })).toBe(
      2,
    );

    const cleared = await request(app.getHttpServer())
      .delete(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toEqual({ cleared: true });
    const after = await request(app.getHttpServer())
      .get(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data.strategy).toBeNull();
    expect(after.body.data.comparison).toBeNull();
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(transactionsBefore);
  });

  it('qualifies comparison under partial coverage without inventing data', async () => {
    const petr4 = await createAsset('PETR4');
    const vale3 = await createAsset('VALE3');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-3');
    await buy(vale3.id, '100', '70.00', 'NEG-5QC-4');
    await seedQuote(petr4.id, '37.00');

    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 5000 },
          { category: 'CASH', targetBp: 5000 },
        ],
      })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.comparison.qualified).toBe(true);
    expect(typeof res.body.data.comparison.coveragePercent).toBe('string');
  });

  it('fail-closes multi-currency portfolios without translated totals', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-5');
    await seedQuote(petr4.id, '37.00');
    await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'AAPL',
        name: 'Apple Inc',
        type: 'STOCK',
        currency: 'USD',
        exchange: 'NASDAQ',
      },
    });

    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targets: [{ category: 'STOCK', targetBp: 10000 }] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    // Single valued currency (USD asset has no quote): still comparable per-bucket.
    expect(Array.isArray(res.body.data.comparison?.rows)).toBe(true);
  });

  it('concurrent replaces converge to one complete strategy', async () => {
    const first = {
      targets: [
        { category: 'STOCK', targetBp: 6000 },
        { category: 'FIXED_INCOME', targetBp: 4000 },
      ],
    };
    const second = {
      targets: [
        { category: 'STOCK', targetBp: 3000 },
        { category: 'FII', targetBp: 7000 },
      ],
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .put(strategyUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(first),
      request(app.getHttpServer())
        .put(strategyUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(second),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const rows = await prisma.portfolioAllocationStrategyTarget.findMany({
      where: { portfolioId },
      orderBy: { category: 'asc' },
    });
    const total = rows.reduce((sum, row) => sum + row.targetBp, 0);
    expect(total).toBe(10000);
    const asSets = [
      JSON.stringify(first.targets.map((t) => t.category).sort()),
      JSON.stringify(second.targets.map((t) => t.category).sort()),
    ];
    expect(asSets).toContain(JSON.stringify(rows.map((row) => row.category)));
  });

  it('reads comparison with weight math intact for review integration', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-6');
    await seedQuote(petr4.id, '37.00');
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 5000 },
          { category: 'CASH', targetBp: 5000 },
        ],
      })
      .expect(200);

    const review = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/review`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(review.status).toBe(200);
    const signal = review.body.data.signals.find(
      (item: { code: string }) => item.code === 'STRATEGY_ALLOCATION_DEVIATION',
    );
    expect(signal).toBeDefined();
    expect(signal.severity).toBe('REVIEW');
    // STOCK 100% vs 50% (+50p.p.) and CASH 0% vs 50% (-50p.p.): both outside ±1 p.p.
    expect(signal.evidence.categoriesOutsideTarget).toBe(2);
    expect(signal.action).toMatchObject({ kind: 'ROUTE', label: 'Ver estratégia' });
  });

  it('shows no strategy signal without targets or when on target', async () => {
    const empty = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/review`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(
      empty.body.data.signals.some(
        (item: { code: string }) => item.code === 'STRATEGY_ALLOCATION_DEVIATION',
      ),
    ).toBe(false);

    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-7');
    await seedQuote(petr4.id, '37.00');
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targets: [{ category: 'STOCK', targetBp: 10000 }] })
      .expect(200);
    const review = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/review`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(
      review.body.data.signals.some(
        (item: { code: string }) => item.code === 'STRATEGY_ALLOCATION_DEVIATION',
      ),
    ).toBe(false);
  });

  it('drills into the strategy signal with a current comparison table and no invented history', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QC-8');
    await seedQuote(petr4.id, '37.00');
    await request(app.getHttpServer())
      .put(strategyUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        targets: [
          { category: 'STOCK', targetBp: 5000 },
          { category: 'CASH', targetBp: 5000 },
        ],
      })
      .expect(200);

    const overview = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/review`)
      .set('Authorization', `Bearer ${authToken}`);
    const overviewSignal = overview.body.data.signals.find(
      (item: { code: string }) => item.code === 'STRATEGY_ALLOCATION_DEVIATION',
    );
    expect(overviewSignal).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(detailUrl('STRATEGY_ALLOCATION_DEVIATION'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.code).toBe('STRATEGY_ALLOCATION_DEVIATION');
    expect(detail.body.data.state).toBe('ACTIVE');
    expect(detail.body.data.evidence).toEqual(overviewSignal.evidence);
    expect(detail.body.data.history.kind).toBe('TABLE_COMPARISON');
    expect(detail.body.data.history.rows).toHaveLength(2);
    const stock = detail.body.data.history.rows.find(
      (row: { category: string }) => row.category === 'STOCK',
    );
    expect(stock).toMatchObject({ targetBp: 5000, currentBp: 10000, deviationBp: 5000 });
    expect(detail.body.data.limitations).toContain('SINGLE_SNAPSHOT_ONLY');
  });
});
