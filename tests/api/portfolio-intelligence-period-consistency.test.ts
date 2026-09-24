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

const INCEPTION = '2025-06-10';
const REQUESTED_START = '2025-01-01';
const REQUESTED_END = '2026-09-23';

function businessDates(fromIso: string, toIso: string): string[] {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const out: string[] = [];
  const cur = new Date(Date.UTC(fy!, fm! - 1, fd!));
  const end = Date.UTC(ty!, tm! - 1, td!);
  while (cur.getTime() <= end) {
    const w = cur.getUTCDay();
    if (w !== 0 && w !== 6) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const DAYS = businessDates(INCEPTION, REQUESTED_END);

describe('API Integration: Portfolio Intelligence period/provider consistency (3P closure)', () => {
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
          name: 'Period Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolio(token: string, name: string, ticker: string): Promise<string> {
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;
    const institution = await prisma.institution.create({
      data: { name: `Broker ${name}`, type: 'BROKER', country: 'BR' },
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
      data: { ticker, name: ticker, type: 'STOCK', currency: 'BRL', exchange: 'BVMF' },
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
        tradeDate: new Date(`${INCEPTION}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    DAYS.forEach((date, i) => {
      historical.seed({
        ticker,
        exchange: 'BVMF',
        date,
        close: String(30 + ((i * 7) % 5)),
        currency: 'BRL',
      });
    });
    DAYS.forEach((date, i) =>
      benchmark.seed({ benchmarkId: 'IBOV', date, value: String(100 + ((i * 3) % 7)) }),
    );
    for (const date of DAYS) rates.seed({ benchmarkId: 'CDI', date, rate: '0.05' });
    return portfolioId;
  }

  it('all historical blocks use the SAME clamped effective period; IBOV/CDI fetched once', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio(token, 'IntelPeriod', 'IPRD3');

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');
    const priceSpy = vi.spyOn(historical, 'getDailyPrice');

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${REQUESTED_START}&endDate=${REQUESTED_END}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Single clamped effective period shared by every block.
    expect(res.body.data.period).toEqual({ startDate: INCEPTION, endDate: REQUESTED_END });
    expect(res.body.data.asOf).toBe(REQUESTED_END);

    // IBOV / CDI fetched exactly once, over the effective period (no drift).
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![0]).toBe('IBOV');
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe(INCEPTION);
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe(REQUESTED_END);

    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![0]).toBe('CDI');
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe(INCEPTION);
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe(REQUESTED_END);

    // Every historical price resolution is within the effective period.
    const dates = priceSpy.mock.calls.map((c) => c[1].toString());
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect(d >= INCEPTION && d <= REQUESTED_END).toBe(true);
    }

    // Point-in-time blocks anchored at effectiveEnd.
    expect(res.body.data.currencies.BRL.scenario.hypothetical).toBe(true);
  });

  it('default period shares one window across all blocks (inception-clamped)', async () => {
    const userId = '22222222-aaaa-4aaa-8aaa-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio(token, 'IntelDefault', 'IDEF3');

    const ibovSpy = vi.spyOn(benchmark, 'getObservations');
    const cdiSpy = vi.spyOn(rates, 'getRateObservations');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/intelligence/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const todayStr = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
    const expectedStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 365),
    );
    const expectedStartStr = `${expectedStart.getUTCFullYear()}-${pad(expectedStart.getUTCMonth() + 1)}-${pad(expectedStart.getUTCDate())}`;
    const resolved = res.body.data.period;
    // default endDate = today; default startDate = today − 365 days.
    expect(resolved.endDate).toBe(todayStr);
    expect(resolved.startDate).toBe(expectedStartStr);
    expect(resolved.startDate <= resolved.endDate).toBe(true);
    expect(ibovSpy).toHaveBeenCalledTimes(1);
    expect(ibovSpy.mock.calls[0]![1].toString()).toBe(resolved.startDate);
    expect(ibovSpy.mock.calls[0]![2].toString()).toBe(resolved.endDate);
    expect(cdiSpy).toHaveBeenCalledTimes(1);
    expect(cdiSpy.mock.calls[0]![1].toString()).toBe(resolved.startDate);
    expect(cdiSpy.mock.calls[0]![2].toString()).toBe(resolved.endDate);
  });
});
