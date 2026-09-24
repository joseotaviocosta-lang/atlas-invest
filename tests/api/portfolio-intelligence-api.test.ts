import 'reflect-metadata';

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

describe('API Integration: Portfolio Intelligence Summary (GET /intelligence/summary)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  const DAYS = businessDates(25);

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
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Intelligence Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolio(params: {
    token: string;
    name: string;
    assets: Array<{
      ticker: string;
      type: string;
      currency: string;
      exchange: string;
      quantity: number;
      unitPrice: number;
      prices: string[];
    }>;
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
    const accounts = new Map<string, string>();
    for (const asset of params.assets) {
      let accountId = accounts.get(asset.currency);
      if (!accountId) {
        const account = await prisma.account.create({
          data: {
            portfolioId,
            institutionId: institution.id,
            name: `Conta ${asset.currency}`,
            currency: asset.currency,
            status: 'ACTIVE',
          },
        });
        accountId = account.id;
        accounts.set(asset.currency, accountId);
      }
      const created = await prisma.asset.create({
        data: {
          ticker: asset.ticker,
          name: asset.ticker,
          type: asset.type,
          currency: asset.currency,
          exchange: asset.exchange,
        },
      });
      await prisma.transaction.create({
        data: {
          portfolioId,
          accountId,
          assetId: created.id,
          type: 'BUY',
          quantity: asset.quantity,
          unitPrice: asset.unitPrice,
          currency: asset.currency,
          tradeDate: new Date(`${DAYS[0]}T00:00:00Z`),
          source: 'MANUAL',
        },
      });
      DAYS.forEach((date, i) => {
        historical.seed({
          ticker: asset.ticker,
          exchange: asset.exchange,
          date,
          close: asset.prices[i]!,
          currency: asset.currency,
        });
      });
    }
    return portfolioId;
  }

  function seedIbov(days = DAYS) {
    days.forEach((date, i) =>
      benchmark.seed({ benchmarkId: 'IBOV', date, value: String(100 + ((i * 3) % 7)) }),
    );
  }
  function seedCdi(days = DAYS) {
    for (const date of days) rates.seed({ benchmarkId: 'CDI', date, rate: '0.05' });
  }

  const brlAsset = {
    ticker: 'INTL3',
    type: 'STOCK',
    currency: 'BRL',
    exchange: 'BVMF',
    quantity: 100,
    unitPrice: 30,
    prices: DAYS.map((_, i) => String(30 + ((i * 7) % 5))),
  };

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/intelligence/summary')
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
      .get(`/api/v1/portfolios/${p.body.data.id}/intelligence/summary`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('BRL summary: consolidated blocks, observations and dataQuality', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({ token, name: 'IntelBRL', assets: [brlAsset] });
    seedIbov();
    seedCdi();

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${DAYS[0]}&endDate=${DAYS[24]}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.portfolioId).toBe(portfolioId);
    expect(data.currencies.BRL).toBeDefined();
    const brl = data.currencies.BRL;
    expect(brl.performance.twr).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.risk.realizedVolatilityAnnualized).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.tailRisk.var95).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.scenario.preset).toBe('EQUITY_DOWN_10');
    expect(brl.scenario.hypothetical).toBe(true);
    expect(brl.dataQuality).toBeDefined();
    expect(Array.isArray(data.observations)).toBe(true);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
    expect(txt).not.toMatch(/score|rating|recommend/i);
  });

  it('default period (no params) and explicit/inception clamp behavior', async () => {
    const userId = '22222222-aaaa-4aaa-8aaa-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({ token, name: 'IntelPeriod', assets: [brlAsset] });
    seedIbov();
    seedCdi();

    const defaultRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/intelligence/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(defaultRes.body.data.period.startDate).toBe(DAYS[0]); // inception clamp

    const explicit = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=2026-01-01&endDate=${DAYS[12]}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(explicit.body.data.period.startDate).toBe(DAYS[0]);
  });

  it('future endDate → 400', async () => {
    const userId = '33333333-aaaa-4aaa-8aaa-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({ token, name: 'IntelFuture', assets: [brlAsset] });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=2096-01-01&endDate=2096-02-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('BRL + USD: separate currency blocks, no global total', async () => {
    const userId = '44444444-aaaa-4aaa-8aaa-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const usdAsset = {
      ticker: 'INTLU',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
      quantity: 10,
      unitPrice: 200,
      prices: DAYS.map((_, i) => String(200 + ((i * 5) % 7))),
    };
    const portfolioId = await seedPortfolio({
      token,
      name: 'IntelMulti',
      assets: [brlAsset, usdAsset],
    });
    seedIbov();
    seedCdi();

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${DAYS[0]}&endDate=${DAYS[12]}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.currencies.BRL).toBeDefined();
    expect(res.body.data.currencies.USD).toBeDefined();
    // USD has no benchmark/risk-free → structural unsupported.
    expect(
      res.body.data.currencies.USD.benchmarks.every((b: { return: unknown }) => b.return === null),
    ).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/totalMarketValue|globalTotal/i);
    const multi = res.body.data.observations.find(
      (o: { code: string }) => o.code === 'MULTI_CURRENCY_PRESENT',
    );
    expect(multi.values.currencies).toEqual(['BRL', 'USD']);
  });
});
