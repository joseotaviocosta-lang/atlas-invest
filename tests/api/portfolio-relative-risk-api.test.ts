import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
// CI must never depend on live market-data / Yahoo / BCB endpoints.
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
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type { InMemoryBenchmarkDataProvider } from '@atlas/benchmark-engine';

describe('API Integration: Benchmark-Relative Risk (GET /api/v1/portfolios/:id/performance/relative-risk)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
    benchmark = app.get<InMemoryBenchmarkDataProvider>(BENCHMARK_DATA_PROVIDER);
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
          name: 'Relative Risk Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolioWithBuy(params: {
    token: string;
    name: string;
    ticker: string;
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
      data: {
        ticker: params.ticker,
        name: params.ticker,
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
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

  function seedPrices(ticker: string, dates: string[], closes: string[]) {
    dates.forEach((date, i) => {
      historical.seed({ ticker, exchange: 'BVMF', date, close: closes[i]!, currency: 'BRL' });
    });
  }

  function seedIbov(dates: string[], levels: string[]) {
    dates.forEach((date, i) => {
      benchmark.seed({ benchmarkId: 'IBOV', date, value: levels[i]! });
    });
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/relative-risk?benchmark=IBOV',
      )
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/relative-risk?benchmark=IBOV`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('benchmark is mandatory (400 RELATIVE_RISK.BENCHMARK_REQUIRED)', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NoBench', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance/relative-risk`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('RELATIVE_RISK.BENCHMARK_REQUIRED');
  });

  it('CDI is rejected as a market-relative benchmark (400)', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'CdiBench', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/relative-risk?benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('RELATIVE_RISK.UNSUPPORTED_BENCHMARK');
    // Never silently falls back to IBOV: no data payload is produced.
    expect(res.body.data).toBeUndefined();
  });

  it('invalid benchmark is rejected (400)', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BadBench', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/relative-risk?benchmark=SP500`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('RELATIVE_RISK.UNSUPPORTED_BENCHMARK');
  });

  it('invalid period and future date → 400', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BadPeriod', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const badPeriod = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/relative-risk?benchmark=IBOV&startDate=2026-02-01&endDate=2026-01-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badPeriod.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/relative-risk?benchmark=IBOV&startDate=2096-01-01&endDate=2096-02-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('BRL AVAILABLE: beta/correlation ratios and tracking error percentage with alignment counts', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskValid',
      ticker: 'RREL4',
      buyDate: '2026-01-05',
    });
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
    seedPrices('RREL4', dates, ['30', '31.5', '30.9', '32.4', '31.2']);
    seedIbov(dates, ['100', '101', '100.5', '102', '101.5']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-01-05&endDate=2026-01-09`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.benchmark).toEqual({ id: 'IBOV', name: 'Ibovespa', currency: 'BRL' });
    const brl = data.currencies.BRL;
    expect(brl.status).toBe('AVAILABLE');
    // Ratios, not percentages.
    expect(brl.beta).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.beta).not.toContain('%');
    expect(brl.correlation).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.correlation).not.toContain('%');
    expect(Number(brl.correlation)).toBeLessThanOrEqual(1);
    expect(Number(brl.correlation)).toBeGreaterThanOrEqual(-1);
    // Tracking error is a percentage with DAILY/252 semantics.
    expect(brl.trackingError.frequency).toBe('DAILY');
    expect(brl.trackingError.annualizationFactor).toBe('252');
    expect(brl.trackingError.samplePercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.trackingError.annualizedPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    // Strict identical-interval alignment counts.
    expect(brl.alignment.portfolioIntervalCount).toBe(4);
    expect(brl.alignment.benchmarkIntervalCount).toBe(4);
    expect(brl.alignment.pairedObservationCount).toBe(4);
    expect(brl.alignment.droppedPortfolioIntervalCount).toBe(0);
    expect(brl.alignment.droppedBenchmarkIntervalCount).toBe(0);
  });

  it('USD portfolio → UNAVAILABLE without benchmark (no FX)', async () => {
    const userId = '22222222-bbbb-4bbb-8bbb-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RelRiskUSD', baseCurrency: 'USD', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;
    const institution = await prisma.institution.create({
      data: { name: 'Broker USD', type: 'BROKER', country: 'US' },
    });
    const account = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta USD',
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        ticker: 'AAPL',
        name: 'AAPL',
        type: 'EQUITY',
        currency: 'USD',
        exchange: 'NASDAQ',
      },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        quantity: 10,
        unitPrice: 200,
        currency: 'USD',
        tradeDate: new Date('2026-02-02T00:00:00Z'),
        source: 'MANUAL',
      },
    });
    for (const [i, date] of ['2026-02-02', '2026-02-03', '2026-02-04'].entries()) {
      historical.seed({
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        date,
        close: String(200 + i),
        currency: 'USD',
      });
    }
    seedIbov(['2026-02-02', '2026-02-03', '2026-02-04'], ['100', '101', '102']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-02-02&endDate=2026-02-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usd = res.body.data.currencies.USD;
    expect(usd).toBeDefined();
    expect(usd.status).toBe('UNAVAILABLE');
    expect(usd.beta).toBeNull();
    expect(usd.correlation).toBeNull();
    expect(usd.trackingError).toBeNull();
    expect(usd.alignment).toBeNull();
  });

  it('UNAVAILABLE without benchmark levels (no zero fallback)', async () => {
    const userId = '33333333-cccc-4ccc-8ccc-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskNoBench',
      ticker: 'NBCH4',
      buyDate: '2026-03-02',
    });
    seedPrices('NBCH4', ['2026-03-02', '2026-03-03', '2026-03-04'], ['30', '31', '32']);
    // No IBOV levels seeded for March → UNAVAILABLE, never 0.
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-03-02&endDate=2026-03-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('UNAVAILABLE');
    expect(brl.beta).toBeNull();
    expect(brl.correlation).toBeNull();
    expect(brl.trackingError).toBeNull();
  });

  it('insufficient aligned intervals (<2) → UNAVAILABLE', async () => {
    const userId = '44444444-dddd-4ddd-8ddd-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskInsufficient',
      ticker: 'INSU4',
      buyDate: '2026-04-01',
    });
    seedPrices('INSU4', ['2026-04-01', '2026-04-02', '2026-04-03'], ['30', '31', '32']);
    // Only two benchmark boundaries → a single pair → insufficient.
    seedIbov(['2026-04-01', '2026-04-02'], ['100', '101']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-04-01&endDate=2026-04-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.alignment.pairedObservationCount).toBe(1);
    expect(brl.status).toBe('UNAVAILABLE');
    expect(brl.beta).toBeNull();
  });

  it('zero benchmark variance → beta/correlation null (never Infinity)', async () => {
    const userId = '55555555-eeee-4eee-8eee-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskFlatBench',
      ticker: 'FLTB4',
      buyDate: '2026-05-04',
    });
    const dates = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07'];
    seedPrices('FLTB4', dates, ['30', '31', '30.5', '32']);
    seedIbov(dates, ['100', '100', '100', '100']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-05-04&endDate=2026-05-07`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
    const brl = res.body.data.currencies.BRL;
    expect(brl.beta).toBeNull();
    expect(brl.correlation).toBeNull();
  });

  it('inception clamp: period starts at first trade', async () => {
    const userId = '66666666-ffff-4fff-8fff-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskInception',
      ticker: 'INCR4',
      buyDate: '2026-06-01',
    });
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03'];
    seedPrices('INCR4', dates, ['30', '31', '32']);
    seedIbov(dates, ['100', '101', '102']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-01-01&endDate=2026-06-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.period.startDate).toBe('2026-06-01');
  });

  it('INSUFFICIENT_DATA when no historical valuations', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'EmptyRelRisk', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/relative-risk?benchmark=IBOV&startDate=2026-07-01&endDate=2026-07-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(res.body.data.status).toBe('INSUFFICIENT_DATA');
  });

  it('no provider internals leak', async () => {
    const userId = '88888888-bbbb-4bbb-8bbb-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RelRiskHide',
      ticker: 'HIDE4',
      buyDate: '2026-08-03',
    });
    const dates = ['2026-08-03', '2026-08-04', '2026-08-05'];
    seedPrices('HIDE4', dates, ['30', '31', '32']);
    seedIbov(dates, ['100', '101', '102']);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?benchmark=IBOV&startDate=2026-08-03&endDate=2026-08-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('YahooFinanceQuote');
    expect(txt).not.toContain('StooqCsvRow');
    expect(txt).not.toContain('^BVSP');
    expect(txt).not.toContain('providerSymbol');
    expect(txt).not.toContain('BenchmarkObservation');
  });
});
