import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.RATE_BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import {
  HISTORICAL_MARKET_DATA_PROVIDER,
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type {
  InMemoryBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';

describe('API Integration: Active Performance (GET /api/v1/portfolios/:id/performance/active)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
    benchmark = app.get<InMemoryBenchmarkDataProvider>(BENCHMARK_DATA_PROVIDER);
    rates = app.get<InMemoryRateBenchmarkDataProvider>(RATE_BENCHMARK_DATA_PROVIDER);
  });
  afterAll(async () => {
    await closeTestApp();
  });
  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Active Performance Tester',
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
    dates.forEach((date, i) => benchmark.seed({ benchmarkId: 'IBOV', date, value: levels[i]! }));
  }

  function seedCdi(dates: string[], rate = '0.05') {
    for (const date of dates) rates.seed({ benchmarkId: 'CDI', date, rate });
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/active')
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/active`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('invalid period and future date → 400', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const badPeriod = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/active?startDate=2026-02-01&endDate=2026-01-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badPeriod.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/active?startDate=2096-01-01&endDate=2096-02-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('BRL AVAILABLE: currencies map with Alpha/IR/Treynor and explicit IBOV/CDI references', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveValid',
      ticker: 'ACTV4',
      buyDate: '2026-01-05',
    });
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
    seedPrices('ACTV4', dates, ['30', '31.5', '30.9', '32.4', '31.2']);
    seedIbov(dates, ['100', '101', '100.5', '102', '101.5']);
    seedCdi(dates, '0.05');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-01-05&endDate=2026-01-09`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.marketBenchmark).toBe('IBOV');
    expect(data.riskFreeProxy).toBe('CDI');
    expect(data.period).toEqual({ startDate: '2026-01-05', endDate: '2026-01-09' });
    expect(data.status).toBe('AVAILABLE');
    expect(data.dataAvailability).toBe('AVAILABLE');
    expect(data.currencies.BRL.currency).toBe('BRL');
    expect(data.currencies.BRL.status).toBe('AVAILABLE');
    const brl = data.currencies.BRL;
    expect(brl.alpha.periodPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.informationRatio.daily).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.informationRatio.annualized).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.informationRatio.annualized).not.toContain('%');
    expect(brl.informationRatio.observationCount).toBe(4);
    expect(brl.treynor.periodPercentagePerBeta).toMatch(/^-?\d+(\.\d+)?$/);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
  });

  it('USD-only portfolio → UNAVAILABLE in the currencies map', async () => {
    const userId = '22222222-bbbb-4bbb-8bbb-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ActiveUSD', baseCurrency: 'USD', type: 'PERSONAL' })
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
      data: { ticker: 'AAPL', name: 'AAPL', type: 'EQUITY', currency: 'USD', exchange: 'NASDAQ' },
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
    seedCdi(['2026-02-02', '2026-02-03', '2026-02-04']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-02-02&endDate=2026-02-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usd = res.body.data.currencies.USD;
    expect(usd).toBeDefined();
    expect(usd.status).toBe('UNAVAILABLE');
    expect(usd.alpha).toBeNull();
    expect(usd.informationRatio).toBeNull();
    expect(usd.treynor).toBeNull();
    expect(res.body.data.status).toBe('UNAVAILABLE');
  });

  it('BRL + USD portfolio: BRL computed and USD UNAVAILABLE in the SAME response (no FX)', async () => {
    const userId = '88888888-cccc-4ccc-8ccc-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ActiveMulti', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;

    const brInstitution = await prisma.institution.create({
      data: { name: 'Broker BR', type: 'BROKER', country: 'BR' },
    });
    const brAccount = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: brInstitution.id,
        name: 'Conta BR',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const brAsset = await prisma.asset.create({
      data: { ticker: 'MULT4', name: 'MULT4', type: 'EQUITY', currency: 'BRL', exchange: 'BVMF' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: brAccount.id,
        assetId: brAsset.id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 30,
        currency: 'BRL',
        tradeDate: new Date('2026-09-01T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    const usInstitution = await prisma.institution.create({
      data: { name: 'Broker US', type: 'BROKER', country: 'US' },
    });
    const usAccount = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: usInstitution.id,
        name: 'Conta US',
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
    const usAsset = await prisma.asset.create({
      data: { ticker: 'AAPL', name: 'AAPL', type: 'EQUITY', currency: 'USD', exchange: 'NASDAQ' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: usAccount.id,
        assetId: usAsset.id,
        type: 'BUY',
        quantity: 10,
        unitPrice: 200,
        currency: 'USD',
        tradeDate: new Date('2026-09-01T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    seedPrices('MULT4', dates, ['30', '31', '30.5', '32']);
    seedIbov(dates, ['100', '101', '100.5', '102']);
    seedCdi(dates, '0.05');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-09-01&endDate=2026-09-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.currencies.BRL).toBeDefined();
    expect(data.currencies.USD).toBeDefined();
    expect(data.currencies.BRL.alpha).not.toBeNull();
    expect(data.currencies.USD.status).toBe('UNAVAILABLE');
    expect(data.currencies.USD.alpha).toBeNull();
    expect(data.currencies.USD.informationRatio).toBeNull();
    expect(data.currencies.USD.treynor).toBeNull();
    expect(data.status).toBe('PARTIAL');
  });

  it('missing CDI → alpha/treynor null but IR available (PARTIAL, metric-specific)', async () => {
    const userId = '33333333-cccc-4ccc-8ccc-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveNoCdi',
      ticker: 'NOCD4',
      buyDate: '2026-03-02',
    });
    const dates = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'];
    seedPrices('NOCD4', dates, ['30', '31', '30.5', '32']);
    seedIbov(dates, ['100', '101', '100.5', '102']);
    // No CDI seeded for March.
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-03-02&endDate=2026-03-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('PARTIAL');
    const brl = data.currencies.BRL;
    expect(brl.alpha).toBeNull();
    expect(brl.treynor).toBeNull();
    expect(brl.informationRatio).not.toBeNull();
  });

  it('missing IBOV → all metrics null (UNAVAILABLE)', async () => {
    const userId = '44444444-dddd-4ddd-8ddd-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveNoIbov',
      ticker: 'NOIB4',
      buyDate: '2026-04-01',
    });
    const dates = ['2026-04-01', '2026-04-02', '2026-04-03'];
    seedPrices('NOIB4', dates, ['30', '31', '32']);
    seedCdi(dates);
    // No IBOV levels seeded for April.
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-04-01&endDate=2026-04-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('UNAVAILABLE');
    expect(data.currencies.BRL.alpha).toBeNull();
    expect(data.currencies.BRL.informationRatio).toBeNull();
    expect(data.currencies.BRL.treynor).toBeNull();
  });

  it('zero tracking error (identical returns) → IR null, alpha/treynor available', async () => {
    const userId = '55555555-eeee-4eee-8eee-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveIdentical',
      ticker: 'IDNT4',
      buyDate: '2026-05-04',
    });
    const dates = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
    const prices = ['30', '31.5', '30.9', '32.4', '31.2'];
    seedPrices('IDNT4', dates, prices);
    seedIbov(
      dates,
      prices.map((p) => String(Number(p) * 10)),
    );
    seedCdi(dates, '0.05');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-05-04&endDate=2026-05-08`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.informationRatio).toBeNull();
    expect(brl.alpha).not.toBeNull();
    expect(brl.treynor).not.toBeNull();
    expect(res.body.data.status).toBe('PARTIAL');
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
  });

  it('inception clamp: effective period shared by IBOV/CDI/historical valuations', async () => {
    const userId = '66666666-ffff-4fff-8fff-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveInception',
      ticker: 'AINC4',
      buyDate: '2026-06-01',
    });
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03'];
    seedPrices('AINC4', dates, ['30', '31', '32']);
    seedIbov(dates, ['100', '101', '102']);
    seedCdi(dates);

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');
    const histSpy = vi.spyOn(historical, 'getDailyPrice');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-01-01&endDate=2026-06-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.period).toEqual({ startDate: '2026-06-01', endDate: '2026-06-03' });
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![0]).toBe('IBOV');
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe('2026-06-01');
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe('2026-06-03');
    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![0]).toBe('CDI');
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe('2026-06-01');
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe('2026-06-03');
    const histDates = histSpy.mock.calls.map((c) => c[1].toString());
    expect(histDates.length).toBeGreaterThan(0);
    for (const d of histDates) {
      expect(d >= '2026-06-01' && d <= '2026-06-03').toBe(true);
    }
  });

  it('period consistency: Rp, Rf, Rm and Beta all use the clamped effective period', async () => {
    const userId = '99999999-dddd-4ddd-8ddd-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    // Inception 2026-02-10, requested start 2026-01-01 → clamp to inception.
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveTrace',
      ticker: 'TRAC4',
      buyDate: '2026-02-10',
    });
    const dates = ['2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13'];
    seedPrices('TRAC4', dates, ['30', '31', '30.5', '32']);
    seedIbov(dates, ['100', '101', '100.5', '102']);
    seedCdi(dates, '0.05');

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');
    const histSpy = vi.spyOn(historical, 'getDailyPrice');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-01-01&endDate=2026-02-13`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The response period is the single effective period object.
    expect(res.body.data.period).toEqual({ startDate: '2026-02-10', endDate: '2026-02-13' });

    // Rm + Beta come from the IBOV range fetch — exactly one call, exact period.
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe('2026-02-10');
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe('2026-02-13');

    // Rf comes from the CDI range fetch — exactly one call, exact period.
    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe('2026-02-10');
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe('2026-02-13');

    // Rp inputs (historical valuations) never fall outside the effective period.
    const histDates = histSpy.mock.calls.map((c) => c[1].toString());
    expect(histDates.length).toBeGreaterThan(0);
    for (const d of histDates) {
      expect(d >= '2026-02-10' && d <= '2026-02-13').toBe(true);
    }
    // No second alignment: the IR observation count matches the 3K paired count.
    expect(res.body.data.currencies.BRL.informationRatio.observationCount).toBe(3);
  });

  it('default period is a single shared period across dependencies', async () => {
    const userId = '12121212-eeee-4eee-8eee-121212121212';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveDefault',
      ticker: 'DEFT4',
      buyDate: '2026-08-01',
    });
    const dates = ['2026-08-20', '2026-08-21'];
    seedPrices('DEFT4', dates, ['30', '31']);
    seedIbov(dates, ['100', '101']);
    seedCdi(dates);

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/performance/active`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Default period [2026-08-20, 2026-09-20], shared by all dependencies.
    expect(res.body.data.period).toEqual({ startDate: '2026-08-20', endDate: '2026-09-20' });
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe('2026-08-20');
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe('2026-09-20');
    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe('2026-08-20');
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe('2026-09-20');
  });

  it('no provider internals leak', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'ActiveHide',
      ticker: 'AHID4',
      buyDate: '2026-07-01',
    });
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03'];
    seedPrices('AHID4', dates, ['30', '31', '32']);
    seedIbov(dates, ['100', '101', '102']);
    seedCdi(dates);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=2026-07-01&endDate=2026-07-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('YahooFinanceQuote');
    expect(txt).not.toContain('StooqCsvRow');
    expect(txt).not.toContain('^BVSP');
    expect(txt).not.toContain('RateBenchmarkObservation');
    expect(txt).not.toContain('providerSeriesCode');
  });
});
