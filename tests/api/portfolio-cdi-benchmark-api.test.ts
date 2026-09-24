import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
// CI must never depend on live market-data / BCB endpoints.
process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.RATE_BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import {
  HISTORICAL_MARKET_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type { InMemoryRateBenchmarkDataProvider } from '@atlas/benchmark-engine';
import { Quantity } from '@atlas/domain';

describe('API Integration: CDI Rate Benchmark (GET /api/v1/portfolios/:id/performance?benchmark=CDI)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
    rates = app.get<InMemoryRateBenchmarkDataProvider>(RATE_BENCHMARK_DATA_PROVIDER);
  });
  afterAll(async () => {
    await closeTestApp();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Cdi Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolioWithAsset(params: {
    token: string;
    name: string;
    ticker: string;
    exchange: string;
    buyDate: string;
    quantity?: number;
    unitPrice?: number;
  }): Promise<{ portfolioId: string; assetId: string }> {
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${params.token}`)
      .send({ name: params.name, baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;

    const institution = await prisma.institution.create({
      data: { name: `Broker ${params.name}`, type: 'BROKER', country: 'BR' },
    });
    const account = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        ticker: params.ticker,
        name: params.ticker,
        type: 'EQUITY',
        currency: 'BRL',
        exchange: params.exchange,
      },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        quantity: params.quantity ?? 100,
        unitPrice: params.unitPrice ?? 28.5,
        currency: 'BRL',
        tradeDate: new Date(`${params.buyDate}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    return { portfolioId, assetId: asset.id };
  }

  function seedCdi(month: number, days: number[], rate = '0.05') {
    for (const day of days) {
      rates.seed({
        benchmarkId: 'CDI',
        date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        rate,
      });
    }
  }

  it('benchmark=CDI accepted (200) even when TWR UNAVAILABLE', async () => {
    const userId = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cdi Port', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance?benchmark=CDI`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.portfolioId).toBe(portfolioRes.body.data.id);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('RateBenchmarkObservation');
    expect(JSON.stringify(res.body)).not.toContain('BcbRateBenchmarkDataProvider');
  });

  it('AVAILABLE: returns CDI accumulated return + difference in p.p. as decimal strings', async () => {
    const userId = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const { portfolioId } = await seedPortfolioWithAsset({
      token,
      name: 'CdiAvailable',
      ticker: 'PETR4',
      exchange: 'BVMF',
      buyDate: '2026-01-02',
    });
    // Price rises 30 -> 33 => portfolio TWR ~ 10%
    historical.seed({
      ticker: 'PETR4',
      exchange: 'BVMF',
      date: '2026-01-02',
      close: '30',
      currency: 'BRL',
    });
    historical.seed({
      ticker: 'PETR4',
      exchange: 'BVMF',
      date: '2026-01-30',
      close: '33',
      currency: 'BRL',
    });
    seedCdi(1, [2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30]);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=2026-01-02&endDate=2026-01-30&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.twr).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.benchmark.id).toBe('CDI');
    expect(brl.benchmark.type).toBe('RATE_SERIES');
    expect(brl.benchmark.currency).toBe('BRL');
    expect(brl.benchmark.status).toBe('AVAILABLE');
    expect(brl.benchmark.return).toMatch(/^\d+(\.\d+)?$/);
    expect(typeof brl.benchmark.observationCount).toBe('number');
    expect(brl.benchmark.observationCount).toBeGreaterThan(0);
    expect(brl.differencePercentagePoints).toMatch(/^-?\d+(\.\d+)?$/);
    // difference === twr - cdi (exact decimal, p.p.)
    const expectedDiff = Quantity.from(brl.twr)
      .subtract(Quantity.from(brl.benchmark.return))
      .toString();
    expect(brl.differencePercentagePoints).toBe(expectedDiff);
  });

  it('PARTIAL: portfolio partial valuation propagates to comparison', async () => {
    const userId = 'c2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const { portfolioId } = await seedPortfolioWithAsset({
      token,
      name: 'CdiPartial',
      ticker: 'PETR4',
      exchange: 'BVMF',
      buyDate: '2026-01-02',
    });
    // Second asset with NO historical price => each observation is PARTIAL
    const account = await prisma.account.findFirstOrThrow({ where: { portfolioId } });
    const asset2 = await prisma.asset.create({
      data: { ticker: 'VALE3', name: 'VALE3', type: 'EQUITY', currency: 'BRL', exchange: 'BVMF' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: asset2.id,
        type: 'BUY',
        quantity: 50,
        unitPrice: 60,
        currency: 'BRL',
        tradeDate: new Date('2026-01-02T00:00:00Z'),
        source: 'MANUAL',
      },
    });
    historical.seed({
      ticker: 'PETR4',
      exchange: 'BVMF',
      date: '2026-01-02',
      close: '30',
      currency: 'BRL',
    });
    historical.seed({
      ticker: 'PETR4',
      exchange: 'BVMF',
      date: '2026-01-30',
      close: '33',
      currency: 'BRL',
    });
    seedCdi(1, [2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30]);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=2026-01-02&endDate=2026-01-30&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.benchmark.id).toBe('CDI');
    expect(brl.benchmark.status).toBe('PARTIAL');
    expect(brl.benchmark.dataAvailability).toBe('PARTIAL');
    expect(brl.benchmark.return).toMatch(/^\d+(\.\d+)?$/);
    expect(brl.differencePercentagePoints).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it('UNAVAILABLE: TWR present but no CDI observations for the period', async () => {
    const userId = 'c2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const { portfolioId } = await seedPortfolioWithAsset({
      token,
      name: 'CdiUnavailable',
      ticker: 'ITUB4',
      exchange: 'BVMF',
      buyDate: '2026-02-02',
    });
    // February prices exist, but no CDI rates were seeded for February.
    historical.seed({
      ticker: 'ITUB4',
      exchange: 'BVMF',
      date: '2026-02-02',
      close: '30',
      currency: 'BRL',
    });
    historical.seed({
      ticker: 'ITUB4',
      exchange: 'BVMF',
      date: '2026-02-27',
      close: '33',
      currency: 'BRL',
    });

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=2026-02-02&endDate=2026-02-27&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.twr).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.benchmark.id).toBe('CDI');
    expect(brl.benchmark.status).toBe('UNAVAILABLE');
    expect(brl.benchmark.return).toBeNull();
    expect(brl.differencePercentagePoints).toBeNull();
  });

  it('BRL vs USD: CDI only for BRL, USD never gets a CDI comparison', async () => {
    const userId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const usdRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'CdiUSD', baseCurrency: 'USD', type: 'PERSONAL' })
      .expect(201);
    const usdPerf = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${usdRes.body.data.id}/performance?benchmark=CDI`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usdCurr = usdPerf.body.data.currencies.USD ?? usdPerf.body.data.currencies.BRL;
    expect(usdCurr?.benchmark ?? null).toBeNull();
    expect(usdPerf.status).not.toBe(500);
  });

  it('no benchmark regression: without param still 200 and no benchmark field', async () => {
    const userId = 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NoBench', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.currencies.BRL?.benchmark).toBeUndefined();
  });

  it('IBOV regression: benchmark=IBOV still 200', async () => {
    const userId = 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'IbovReg', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance?benchmark=IBOV`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('invalid benchmark → 400 PERFORMANCE.INVALID_BENCHMARK', async () => {
    const userId = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'InvalidBench', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance?benchmark=FAKE`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('PERFORMANCE.INVALID_BENCHMARK');
  });

  it('auth required 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance?benchmark=CDI')
      .expect(401);
  });

  it('ownership hidden 404', async () => {
    const u1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const u2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await ensureUser(u1);
    await ensureUser(u2);
    const { token: t1 } = await createAuthenticatedUserSession(u1);
    const p = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${t1}`)
      .send({ name: 'Own', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const { token: t2 } = await createAuthenticatedUserSession(u2);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${p.body.data.id}/performance?benchmark=CDI`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('provider internals hidden', async () => {
    const userId = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hide', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance?benchmark=CDI`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('bcdata.sgs');
    expect(txt).not.toContain('InMemoryRateBenchmarkDataProvider');
    expect(txt).not.toContain('RateBenchmarkObservation');
    expect(txt).not.toContain('Banco Central');
    expect(txt).not.toContain('providerSeriesCode');
  });
});
