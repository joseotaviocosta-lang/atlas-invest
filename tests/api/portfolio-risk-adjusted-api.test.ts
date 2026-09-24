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

describe('API Integration: Risk-Adjusted Metrics (GET /api/v1/portfolios/:id/performance/risk-adjusted)', () => {
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
          name: 'RiskAdj Tester',
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

  function seedCdi(dates: string[], rate = '0.05') {
    for (const date of dates) {
      rates.seed({ benchmarkId: 'CDI', date, rate });
    }
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/risk-adjusted')
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/risk-adjusted`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('invalid period and future date → 400', async () => {
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
      .get(
        `/api/v1/portfolios/${id}/performance/risk-adjusted?startDate=2026-02-01&endDate=2026-01-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badPeriod.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/risk-adjusted?startDate=2096-01-01&endDate=2096-02-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('BRL AVAILABLE: Sharpe/Sortino as ratio strings with riskFreeProxy=CDI', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskAdjValid',
      ticker: 'SHRP4',
      buyDate: '2026-01-05', // Monday
    });
    // Oscillating daily prices → nonzero excess variance and downside.
    seedPrices(
      'SHRP4',
      ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'],
      ['30', '31.5', '30.9', '32.4', '31.2'],
    );
    seedCdi(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=2026-01-05&endDate=2026-01-09`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.riskFreeProxy).toBe('CDI');
    expect(brl.frequency).toBe('DAILY');
    expect(brl.status).toBe('AVAILABLE');
    // Ratios, not percentages: plain decimal strings.
    expect(brl.sharpe.annualized).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.sharpe.annualized).not.toContain('%');
    expect(brl.sortino.annualized).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.sortino.downsideObservationCount).toBeGreaterThan(0);
    expect(brl.sharpe.observationCount).toBe(brl.sortino.observationCount);
    expect(brl.sharpe.annualizationFactor).toBe('252');
    expect(brl.sortino.annualizationFactor).toBe('252');
    expect(typeof brl.sharpe.meanDailyExcessPercentage).toBe('string');
  });

  it('USD portfolio → UNAVAILABLE with riskFreeProxy null (no CDI, no FX)', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RiskAdjUSD', baseCurrency: 'USD', type: 'PERSONAL' })
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
        tradeDate: new Date('2026-01-05T00:00:00Z'),
        source: 'MANUAL',
      },
    });
    historical.seed({
      ticker: 'AAPL',
      exchange: 'NASDAQ',
      date: '2026-01-05',
      close: '200',
      currency: 'USD',
    });
    historical.seed({
      ticker: 'AAPL',
      exchange: 'NASDAQ',
      date: '2026-01-06',
      close: '202',
      currency: 'USD',
    });
    historical.seed({
      ticker: 'AAPL',
      exchange: 'NASDAQ',
      date: '2026-01-07',
      close: '204',
      currency: 'USD',
    });
    // CDI exists for these dates, but must never touch USD.
    seedCdi(['2026-01-05', '2026-01-06', '2026-01-07']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=2026-01-05&endDate=2026-01-07`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usd = res.body.data.currencies.USD;
    expect(usd).toBeDefined();
    expect(usd.riskFreeProxy).toBeNull();
    expect(usd.sharpe).toBeNull();
    expect(usd.sortino).toBeNull();
    expect(usd.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE without CDI (no zero fallback)', async () => {
    const userId = '11111111-2222-4333-8444-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskAdjNoCdi',
      ticker: 'NOCDI4',
      buyDate: '2026-02-02',
    });
    seedPrices('NOCDI4', ['2026-02-02', '2026-02-03', '2026-02-04'], ['30', '31', '32']);
    // No CDI seeded for February → intersection empty → UNAVAILABLE, not 0.
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=2026-02-02&endDate=2026-02-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.riskFreeProxy).toBe('CDI');
    expect(brl.sharpe).toBeNull();
    expect(brl.sortino).toBeNull();
  });

  it('constant excess → zero denominator → null (never Infinity)', async () => {
    const userId = '22222222-3333-4444-8555-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskAdjFlat',
      ticker: 'FLAT4',
      buyDate: '2026-03-02',
    });
    // Flat prices with zero CDI → all excess exactly 0 → zero denominators.
    seedPrices('FLAT4', ['2026-03-02', '2026-03-03', '2026-03-04'], ['30', '30', '30']);
    seedCdi(['2026-03-02', '2026-03-03', '2026-03-04'], '0');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=2026-03-02&endDate=2026-03-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    const txt = JSON.stringify(brl);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
    expect(brl.sharpe.daily).toBeNull();
    expect(brl.sortino.daily).toBeNull();
  });

  it('inception clamp: period starts at first trade', async () => {
    const userId = '33333333-4444-4555-8666-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskAdjInception',
      ticker: 'INCP4',
      buyDate: '2026-04-01',
    });
    seedPrices('INCP4', ['2026-04-01', '2026-04-02', '2026-04-03'], ['30', '31', '32']);
    seedCdi(['2026-04-01', '2026-04-02', '2026-04-03']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=2026-01-01&endDate=2026-04-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.period.startDate).toBe('2026-04-01');
  });

  it('INSUFFICIENT_DATA when no historical valuations', async () => {
    const userId = '44444444-5555-4666-8777-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Empty', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/risk-adjusted?startDate=2026-01-01&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(res.body.data.status).toBe('INSUFFICIENT_DATA');
  });

  it('no provider internals leak', async () => {
    const userId = '55555555-6666-4777-8888-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hide', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/risk-adjusted?startDate=2026-01-01&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('StooqCsvRow');
    expect(txt).not.toContain('BcbRateBenchmarkDataProvider');
    expect(txt).not.toContain('providerSeriesCode');
    expect(txt).not.toContain('RateBenchmarkObservation');
  });
});
