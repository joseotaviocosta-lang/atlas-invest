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

function businessDates(n: number, startIso = '2026-09-17'): string[] {
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

describe('Phase 5B-H3-R3 API Integration: Intelligence Summary Selected-Benchmark Isolation & None-State', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  const DAYS = businessDates(22, '2026-09-17');

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
          name: 'H3-R3 Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolio(token: string): Promise<string> {
    const p = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'H3-R3 Portfolio', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = p.body.data.id as string;

    const institution = await prisma.institution.create({
      data: { name: 'Broker H3-R3', type: 'BROKER', country: 'BR' },
    });
    const account = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Conta BRL',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });

    // Inception on DAYS[0]
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        quantity: 100,
        unitPrice: 30,
        currency: 'BRL',
        tradeDate: new Date(`${DAYS[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });

    DAYS.forEach((date, i) => {
      historical.seed({
        ticker: 'PETR4',
        exchange: 'BVMF',
        date,
        close: String(30 + i * 0.2),
        currency: 'BRL',
      });
      benchmark.seed({
        benchmarkId: 'IBOV',
        date,
        value: String(136000 + i * 100),
      });
      rates.seed({
        benchmarkId: 'CDI',
        date,
        rate: '0.045',
      });
    });

    return portfolioId;
  }

  it('GET /intelligence/summary with benchmark=IBOV returns strictly IBOV benchmark and observation', async () => {
    const userId = '55555555-aaaa-4aaa-8aaa-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio(token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${DAYS[0]}&endDate=${DAYS[DAYS.length - 1]}&benchmark=IBOV`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    const brl = data.currencies.BRL;

    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0].id).toBe('IBOV');
    expect(brl.benchmarks[0].status).toBe('AVAILABLE');
    expect(brl.dataQuality.benchmarkAvailability.status).toBe('AVAILABLE');

    const obsCodes = data.observations.map((o: { code: string }) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
  });

  it('GET /intelligence/summary with benchmark=CDI returns strictly CDI benchmark and observation', async () => {
    const userId = '66666666-aaaa-4aaa-8aaa-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio(token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${DAYS[0]}&endDate=${DAYS[DAYS.length - 1]}&benchmark=CDI`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    const brl = data.currencies.BRL;

    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0].id).toBe('CDI');
    expect(brl.benchmarks[0].status).toBe('AVAILABLE');
    expect(brl.benchmarks[0].return).not.toBeNull();
    expect(brl.dataQuality.benchmarkAvailability.status).toBe('AVAILABLE');

    const obsCodes = data.observations.map((o: { code: string }) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
  });

  it('GET /intelligence/summary with benchmark=none returns empty benchmarks and suppresses benchmark observations', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio(token);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${DAYS[0]}&endDate=${DAYS[DAYS.length - 1]}&benchmark=none`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    const brl = data.currencies.BRL;

    expect(brl.benchmarks).toHaveLength(0);
    expect(brl.dataQuality.benchmarkAvailability.status).toBe('UNAVAILABLE');
    expect(brl.dataQuality.benchmarkAvailability.reason).toBe('NOT_REQUESTED');

    const obsCodes = data.observations.map((o: { code: string }) => o.code);
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
  });
});
