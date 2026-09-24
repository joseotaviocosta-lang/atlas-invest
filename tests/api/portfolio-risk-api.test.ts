import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
// CI must never depend on live market-data endpoints.
process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.RATE_BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';

describe('API Integration: Portfolio Risk Metrics (GET /api/v1/portfolios/:id/performance/risk)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
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
          name: 'Risk Tester',
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
    ticker?: string;
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
        ticker: params.ticker ?? 'PETR4',
        name: params.ticker ?? 'PETR4',
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
      historical.seed({
        ticker,
        exchange: 'BVMF',
        date,
        close: closes[i]!,
        currency: 'BRL',
      });
    });
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/risk')
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/risk`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('INSUFFICIENT_DATA when no historical valuations', async () => {
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
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/risk?startDate=2026-01-01&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(res.body.data.status).toBe('INSUFFICIENT_DATA');
    const brl = res.body.data.currencies.BRL;
    expect(brl.volatility.annualizedPercentage).toBeNull();
    expect(brl.drawdown.maximumPercentage).toBeNull();
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
      .get(`/api/v1/portfolios/${id}/performance/risk?startDate=2026-02-01&endDate=2026-01-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badPeriod.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/risk?startDate=2096-01-01&endDate=2096-02-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('valid BRL risk: decimal strings, DAILY frequency, factor 252', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskValid',
      buyDate: '2026-01-02',
      ticker: 'RISKV',
    });
    // Oscillating prices → nonzero vol; ends above start with a dip → drawdown.
    seedPrices(
      'RISKV',
      ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
      ['30', '33', '31.5', '34.5', '36'],
    );

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-02&endDate=2026-01-06`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.frequency).toBe('DAILY');
    expect(brl.volatility.frequency).toBe('DAILY');
    expect(brl.volatility.annualizationFactor).toBe('252');
    expect(brl.volatility.observationCount).toBeGreaterThanOrEqual(2);
    expect(brl.volatility.samplePercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.volatility.annualizedPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.drawdown.maximumPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number(brl.drawdown.maximumPercentage)).toBeLessThanOrEqual(0);
    expect(brl.drawdown.peakDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(brl.drawdown.troughDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Recovery may be null (open) or a date; either is valid decimal/date contract.
    expect(
      brl.drawdown.recoveryDate === null || /^\d{4}-\d{2}-\d{2}$/.test(brl.drawdown.recoveryDate),
    ).toBe(true);
    expect(brl.drawdown.currentPercentage).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it('flat prices → zero vol and zero drawdown (known, not missing)', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskFlat',
      buyDate: '2026-01-02',
      ticker: 'RISKF',
    });
    seedPrices('RISKF', ['2026-01-02', '2026-01-03', '2026-01-04'], ['30', '30', '30']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-02&endDate=2026-01-04`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.volatility.samplePercentage).toBe('0');
    expect(brl.volatility.annualizedPercentage).toBe('0');
    expect(brl.drawdown.maximumPercentage).toBe('0');
    expect(brl.drawdown.currentPercentage).toBe('0');
  });

  it('inception clamp: risk period starts at first trade', async () => {
    const userId = '11111111-2222-4333-8444-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskInception',
      buyDate: '2026-03-01',
      ticker: 'RISKI',
    });
    seedPrices('RISKI', ['2026-03-01', '2026-03-02', '2026-03-03'], ['30', '31', '32']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-01&endDate=2026-03-03`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.period.startDate).toBe('2026-03-01');
  });

  it('weekend gap: Sat/Sun add no statistical observations (observationCount === 1)', async () => {
    const userId = '55555555-6666-4777-8888-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskWeekend',
      buyDate: '2026-01-02', // Friday
      ticker: 'RISKW',
    });
    // Friday 30 → Monday 33. Sat/Sun resolve via previous close (no new info).
    seedPrices('RISKW', ['2026-01-02', '2026-01-05'], ['30', '33']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-02&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    // TWR boundaries: Fri→Sat, Sat→Sun, Sun→Mon. Only Monday is economic.
    expect(brl.volatility.observationCount).toBe(1);
    // Single economic return → vol UNAVAILABLE (never diluted zeros), drawdown known.
    expect(brl.volatility.annualizedPercentage).toBeNull();
    expect(brl.drawdown.maximumPercentage).toBe('0');
    expect(brl.drawdown.currentPercentage).toBe('0');
  });

  it('weekend flow: Saturday deposit neutralized, Saturday excluded from sample', async () => {
    const userId = '66666666-7777-4888-8999-000000000000';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskWeekendFlow',
      buyDate: '2026-01-02', // Friday: 100 × 30 = 3000
      ticker: 'RISKO',
    });
    const account = await prisma.account.findFirstOrThrow({ where: { portfolioId } });
    const asset = await prisma.asset.findFirstOrThrow({ where: { ticker: 'RISKO' } });
    // Saturday: deposit 3000 immediately deployed into 100 more shares @ 30.
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-03T00:00:00Z'),
        settlementDate: new Date('2026-01-03T00:00:00Z'),
        amount: '3000.00',
        currency: 'BRL',
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
        tradeDate: new Date('2026-01-03T00:00:00Z'),
        source: 'MANUAL',
      },
    });
    // Monday price 33 → 200 shares = 6600; TWR-neutralized Monday return +10%.
    seedPrices('RISKO', ['2026-01-02', '2026-01-05'], ['30', '33']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-02&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    // Only Monday is economic; Saturday flow boundary excluded from sample.
    // Fri→Sat TWR is exactly 0% ((6000−3000−3000)/3000), not +100%.
    expect(brl.volatility.observationCount).toBe(1);
    expect(brl.drawdown.maximumPercentage).toBe('0');
    expect(brl.drawdown.currentPercentage).toBe('0');
  });

  it('multi-day holiday gap: only the post-holiday return is statistical', async () => {
    const userId = '77777777-8888-4999-9000-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolioWithBuy({
      token,
      name: 'RiskHoliday',
      buyDate: '2026-01-02', // Friday
      ticker: 'RISKH',
    });
    // Friday 30 → Tuesday 31. Sat/Sun/Mon all resolve via previous close.
    seedPrices('RISKH', ['2026-01-02', '2026-01-06'], ['30', '31']);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=2026-01-02&endDate=2026-01-06`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(brl.volatility.observationCount).toBe(1);
  });

  it('no provider internals leak', async () => {
    const userId = '22222222-3333-4444-8555-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hide', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance/risk?startDate=2026-01-01&endDate=2026-01-05`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('StooqCsvRow');
    expect(txt).not.toContain('DecimalValue');
    expect(txt).not.toContain('decimal.js');
  });
});
