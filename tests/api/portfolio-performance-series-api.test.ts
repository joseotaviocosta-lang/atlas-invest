import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
// CI must never depend on live market-data / benchmark endpoints.
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
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type { InMemoryBenchmarkDataProvider } from '@atlas/benchmark-engine';

describe('API Integration: Performance Series (GET /api/v1/portfolios/:id/performance/series)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmarks: InMemoryBenchmarkDataProvider;
  let rates: { seed: (d: { benchmarkId: 'CDI'; date: string; rate: string }) => void };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
    benchmarks = app.get<InMemoryBenchmarkDataProvider>(BENCHMARK_DATA_PROVIDER);
    rates = app.get<InMemoryBenchmarkDataProvider>(RATE_BENCHMARK_DATA_PROVIDER) as never as {
      seed: (d: { benchmarkId: 'CDI'; date: string; rate: string }) => void;
    };
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
          name: 'Series Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolioWithBuy(params: {
    token: string;
    name: string;
    buyDate: string;
  }): Promise<string> {
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
      data: { ticker: 'PETR4', name: 'PETR4', type: 'EQUITY', currency: 'BRL', exchange: 'BVMF' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 30,
        currency: 'BRL',
        tradeDate: new Date(`${params.buyDate}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    return portfolioId;
  }

  function seedPrices(dates: string[], closes: string[]) {
    dates.forEach((date, i) => {
      historical.seed({
        ticker: 'PETR4',
        exchange: 'BVMF',
        date,
        close: closes[i]!,
        currency: 'BRL',
      });
    });
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/series')
      .expect(401);
  });

  it('hidden 404 cross-user', async () => {
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/series`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('UNAVAILABLE when no historical data', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Empty', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/series?startDate=2026-01-01&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(res.body.data.status).toBe('INSUFFICIENT_DATA');
  });

  it('invalid period / granularity / benchmark → 400', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const badPeriod = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/series?startDate=2026-02-01&endDate=2026-01-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badPeriod.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const badGran = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/series?granularity=YEARLY`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badGran.body.code).toBe('PERFORMANCE.INVALID_GRANULARITY');
    const badBench = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/series?benchmark=FAKE`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badBench.body.code).toBe('PERFORMANCE.INVALID_BENCHMARK');
  });

  it('valid DAILY series: starts at 0, decimal strings, endpoints included', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'SeriesDaily',
      buyDate: '2026-01-02',
    });
    seedPrices(['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'], ['30', '31', '32', '33']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/series?startDate=2026-01-02&endDate=2026-01-05&granularity=DAILY`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.granularity).toBe('DAILY');
    expect(brl.points).toHaveLength(4);
    expect(brl.points[0].date).toBe('2026-01-02');
    expect(brl.points[0].portfolioReturn).toBe('0');
    expect(brl.points[brl.points.length - 1].date).toBe('2026-01-05');
    for (const pt of brl.points) {
      expect(pt.portfolioReturn === null || /^-?\d+(\.\d+)?$/.test(pt.portfolioReturn)).toBe(true);
      expect(pt.benchmarkReturn).toBeNull();
    }
    expect(brl.benchmark).toBeNull();
    expect(res.body.data.requestedGranularity).toBe('DAILY');
  });

  it('final series point matches /performance summary TWR', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'SeriesConsistent',
      buyDate: '2026-01-02',
    });
    // Endpoint-only prices: intermediates fall outside lookback (UNAVAILABLE,
    // skipped), so both summary and series chain the exact 3000 → 3300 move.
    seedPrices(['2026-01-02', '2026-01-20'], ['30', '33']);

    const series = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/series?startDate=2026-01-02&endDate=2026-01-20&granularity=DAILY`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const summary = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/performance?startDate=2026-01-02&endDate=2026-01-20`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pts = series.body.data.currencies.BRL.points;
    expect(pts[pts.length - 1].portfolioReturn).toBe(summary.body.data.currencies.BRL.twr);
  });

  it('IBOV series: start 0, final matches summary benchmark return', async () => {
    const userId = '11111111-2222-4333-8444-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'SeriesIbov',
      buyDate: '2026-01-02',
    });
    seedPrices(['2026-01-02', '2026-01-05'], ['30', '33']);
    benchmarks.seed({ benchmarkId: 'IBOV', date: '2026-01-02', value: '100000' });
    benchmarks.seed({ benchmarkId: 'IBOV', date: '2026-01-05', value: '110000' });

    const series = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/series?startDate=2026-01-02&endDate=2026-01-05&granularity=DAILY&benchmark=IBOV`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const summary = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=2026-01-02&endDate=2026-01-05&benchmark=IBOV`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pts = series.body.data.currencies.BRL.points;
    expect(pts[0].benchmarkReturn).toBe('0');
    expect(pts[pts.length - 1].benchmarkReturn).toBe(
      summary.body.data.currencies.BRL.benchmark.return,
    );
    expect(pts[pts.length - 1].benchmarkReturn).toBe('10');
  });

  it('CDI series: start 0, 1%+1%=2.01% semantics, final matches summary', async () => {
    const userId = '22222222-3333-4444-8555-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'SeriesCdi',
      buyDate: '2026-01-02',
    });
    seedPrices(['2026-01-02', '2026-01-05'], ['30', '33']);
    rates.seed({ benchmarkId: 'CDI', date: '2026-01-03', rate: '1' });
    rates.seed({ benchmarkId: 'CDI', date: '2026-01-04', rate: '1' });
    rates.seed({ benchmarkId: 'CDI', date: '2026-01-05', rate: '1' });

    const series = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/series?startDate=2026-01-02&endDate=2026-01-05&granularity=DAILY&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const summary = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=2026-01-02&endDate=2026-01-05&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pts = series.body.data.currencies.BRL.points;
    expect(pts[0].benchmarkReturn).toBe('0');
    const last = pts[pts.length - 1].benchmarkReturn;
    expect(last).toBe(summary.body.data.currencies.BRL.benchmark.return);
    // 1%+1%+1% compounded daily
    expect(last).toBe('3.0301');
  });

  it('AUTO over long range caps at 400 points with endpoints kept', async () => {
    const userId = '33333333-4444-4555-8666-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Long', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/series?startDate=2024-01-01&endDate=2026-06-01&granularity=DAILY`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    for (const cur of Object.values(res.body.data.currencies) as Array<{ points: unknown[] }>) {
      expect(cur.points.length).toBeLessThanOrEqual(400);
    }
  });

  it('no provider internals leak', async () => {
    const userId = '44444444-5555-4666-8777-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hide', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/series?startDate=2026-01-01&endDate=2026-01-05&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('StooqCsvRow');
    expect(txt).not.toContain('BcbRateBenchmarkDataProvider');
    expect(txt).not.toContain('providerSeriesCode');
  });
});
