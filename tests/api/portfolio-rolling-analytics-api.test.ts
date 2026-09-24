import 'reflect-metadata';

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

function businessDates(n: number, startIso = '2026-01-05'): string[] {
  const out: string[] = [];
  const [y, m, day] = startIso.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, day!));
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('API Integration: Rolling Analytics (GET /api/v1/portfolios/:id/performance/rolling)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  const dates = businessDates(21);

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
          name: 'Rolling Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedBrlPortfolio(params: {
    token: string;
    name: string;
    ticker: string;
    seedPrices: boolean;
    days?: string[];
  }): Promise<string> {
    const days = params.days ?? dates;
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
        tradeDate: new Date(`${days[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    if (params.seedPrices) {
      days.forEach((date, i) => {
        historical.seed({
          ticker: params.ticker,
          exchange: 'BVMF',
          date,
          close: String(30 + ((i * 7) % 5)),
          currency: 'BRL',
        });
      });
    }
    return portfolioId;
  }

  function seedIbov(days = dates) {
    days.forEach((date, i) =>
      benchmark.seed({ benchmarkId: 'IBOV', date, value: String(100 + ((i * 3) % 7)) }),
    );
  }

  function seedCdi(days = dates) {
    for (const date of days) rates.seed({ benchmarkId: 'CDI', date, rate: '0.05' });
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/rolling?window=20')
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/rolling?window=20`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('window is mandatory and only 20/60/120 are accepted', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RollWin', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const missing = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/rolling`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(missing.body.code).toBe('ROLLING_ANALYTICS.INVALID_WINDOW');
    const invalid = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/rolling?window=30`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(invalid.body.code).toBe('ROLLING_ANALYTICS.INVALID_WINDOW');
  });

  it('window 20 → BRL volatility/Sharpe/Beta with one point each (decimal strings)', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollValid',
      ticker: 'ROLL4',
      seedPrices: true,
    });
    seedIbov();
    seedCdi();

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.window).toBe(20);
    expect(data.period).toEqual({ startDate: dates[0], endDate: dates[20] });
    const brl = data.currencies.BRL;
    expect(brl.rollingVolatility.points).toHaveLength(1);
    expect(brl.rollingSharpe.points).toHaveLength(1);
    expect(brl.rollingBeta.points).toHaveLength(1);
    expect(brl.rollingVolatility.points[0].annualizedPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.rollingSharpe.points[0].annualized).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.rollingSharpe.points[0].annualized).not.toContain('%');
    expect(brl.rollingBeta.points[0].beta).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.rollingVolatility.points[0].observationCount).toBe(20);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
  });

  it('windows 60/120 are accepted but insufficient history yields UNAVAILABLE', async () => {
    const userId = '22222222-aaaa-4aaa-8aaa-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollInsufficient',
      ticker: 'RINS4',
      seedPrices: true,
    });
    seedIbov();
    seedCdi();
    for (const w of [60, 120]) {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=${w}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.window).toBe(w);
      expect(res.body.data.currencies.BRL.rollingVolatility.status).toBe('UNAVAILABLE');
      expect(res.body.data.currencies.BRL.rollingVolatility.points).toHaveLength(0);
      expect(res.body.data.status).toBe('UNAVAILABLE');
    }
  });

  it('USD-only portfolio: volatility available, Sharpe/Beta unavailable (no FX)', async () => {
    const userId = '33333333-aaaa-4aaa-8aaa-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RollUSD', baseCurrency: 'USD', type: 'PERSONAL' })
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
        tradeDate: new Date(`${dates[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    dates.forEach((date, i) => {
      historical.seed({
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        date,
        close: String(200 + ((i * 5) % 7)),
        currency: 'USD',
      });
    });
    seedIbov();
    seedCdi();

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usd = res.body.data.currencies.USD;
    expect(usd.rollingVolatility.points).toHaveLength(1);
    expect(usd.rollingVolatility.status).not.toBe('UNAVAILABLE');
    expect(usd.rollingSharpe.status).toBe('UNAVAILABLE');
    expect(usd.rollingSharpe.points).toHaveLength(0);
    expect(usd.rollingBeta.status).toBe('UNAVAILABLE');
    expect(usd.rollingBeta.points).toHaveLength(0);
  });

  it('BRL + USD portfolio returns both currency blocks in the same response', async () => {
    const userId = '44444444-aaaa-4aaa-8aaa-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RollMulti', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;

    const brInst = await prisma.institution.create({
      data: { name: 'Broker BR', type: 'BROKER', country: 'BR' },
    });
    const brAcc = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: brInst.id,
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
        accountId: brAcc.id,
        assetId: brAsset.id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 30,
        currency: 'BRL',
        tradeDate: new Date(`${dates[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });

    const usInst = await prisma.institution.create({
      data: { name: 'Broker US', type: 'BROKER', country: 'US' },
    });
    const usAcc = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: usInst.id,
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
        accountId: usAcc.id,
        assetId: usAsset.id,
        type: 'BUY',
        quantity: 10,
        unitPrice: 200,
        currency: 'USD',
        tradeDate: new Date(`${dates[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });

    dates.forEach((date, i) => {
      historical.seed({
        ticker: 'MULT4',
        exchange: 'BVMF',
        date,
        close: String(30 + ((i * 7) % 5)),
        currency: 'BRL',
      });
      historical.seed({
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        date,
        close: String(200 + ((i * 5) % 7)),
        currency: 'USD',
      });
    });
    seedIbov();
    seedCdi();

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.currencies.BRL).toBeDefined();
    expect(res.body.data.currencies.USD).toBeDefined();
    expect(res.body.data.currencies.BRL.rollingBeta.points).toHaveLength(1);
    expect(res.body.data.currencies.USD.rollingBeta.status).toBe('UNAVAILABLE');
    expect(res.body.data.currencies.USD.rollingVolatility.points).toHaveLength(1);
  });

  it('partial source (missing intermediate IBOV session) propagates PARTIAL to Beta', async () => {
    const userId = '55555555-aaaa-4aaa-8aaa-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    // 23 business days → 22 portfolio intervals; one missing IBOV session
    // drops 2 portfolio + 1 benchmark intervals → 20 valid pairs.
    const d23 = businessDates(23, '2026-03-02');
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollPartial',
      ticker: 'RPAR4',
      seedPrices: true,
      days: d23,
    });
    seedIbov(d23.filter((_, i) => i !== 10));
    seedCdi(d23);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${d23[0]}&endDate=${d23[22]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.rollingBeta.points).toHaveLength(1);
    expect(brl.rollingBeta.status).toBe('PARTIAL');
    expect(res.body.data.status).toBe('PARTIAL');
    expect(res.body.data.dataAvailability).toBe('PARTIAL');
    // Volatility/Sharpe do not depend on IBOV.
    expect(brl.rollingVolatility.status).not.toBe('UNAVAILABLE');
  });

  it('invalid period and future date → 400', async () => {
    const userId = '66666666-aaaa-4aaa-8aaa-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'RollBad', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const bad = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/rolling?window=20&startDate=2026-02-01&endDate=2026-01-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(bad.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/rolling?window=20&startDate=2096-01-01&endDate=2096-02-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('inception clamp + one IBOV and one CDI range fetch per request (no per-point I/O)', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollTrace',
      ticker: 'RTRC4',
      seedPrices: true,
    });
    seedIbov();
    seedCdi();

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');
    const histSpy = vi.spyOn(historical, 'getDailyPrice');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=2025-01-01&endDate=${dates[20]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.period.startDate).toBe(dates[0]);
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe(dates[0]);
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe(dates[20]);
    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe(dates[0]);
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe(dates[20]);
    const histDates = histSpy.mock.calls.map((c) => c[1].toString());
    for (const d of histDates) {
      expect(d >= dates[0] && d <= dates[20]).toBe(true);
    }
  });

  it('points are ordered by endDate ascending', async () => {
    const userId = '88888888-aaaa-4aaa-8aaa-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollOrder',
      ticker: 'RORD4',
      seedPrices: true,
    });
    seedIbov();
    seedCdi();
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=20`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const points = res.body.data.currencies.BRL.rollingVolatility.points as Array<{
      endDate: string;
    }>;
    const ordered = [...points].sort((a, b) => (a.endDate < b.endDate ? -1 : 1));
    expect(points.map((p) => p.endDate)).toEqual(ordered.map((p) => p.endDate));
  });

  it('no provider internals leak', async () => {
    const userId = '99999999-aaaa-4aaa-8aaa-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'RollHide',
      ticker: 'RHID4',
      seedPrices: true,
    });
    seedIbov();
    seedCdi();
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${dates[0]}&endDate=${dates[20]}&window=20`,
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
