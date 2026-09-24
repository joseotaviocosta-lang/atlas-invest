import 'reflect-metadata';

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

describe('API Integration: Tail Risk (GET /api/v1/portfolios/:id/performance/tail-risk)', () => {
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
          name: 'Tail Risk Tester',
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
    days: string[];
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
        tradeDate: new Date(`${params.days[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    params.days.forEach((date, i) => {
      historical.seed({
        ticker: params.ticker,
        exchange: 'BVMF',
        date,
        close: String(30 + ((i * 7) % 5)),
        currency: 'BRL',
      });
    });
    return portfolioId;
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/tail-risk?confidenceLevel=95',
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
      .get(`/api/v1/portfolios/${p.body.data.id}/performance/tail-risk?confidenceLevel=95`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('confidenceLevel is mandatory and only 95/99 are accepted', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TailConf', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const missing = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/tail-risk`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(missing.body.code).toBe('TAIL_RISK.INVALID_CONFIDENCE_LEVEL');
    const invalid = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${id}/performance/tail-risk?confidenceLevel=90`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(invalid.body.code).toBe('TAIL_RISK.INVALID_CONFIDENCE_LEVEL');
  });

  it('confidence 95 (20 economic observations): all metrics available, decimal strings, integer counts', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'TailValid',
      ticker: 'TAIL4',
      days,
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=95`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.confidenceLevel).toBe('95');
    expect(data.period).toEqual({ startDate: days[0], endDate: days[20] });
    const brl = data.currencies.BRL;
    // Layer-B economic observations = business days − 1 (weekends excluded).
    expect(brl.observationCount).toBe(20);
    expect(brl.downsideDeviation.annualizedPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.semideviation.annualizedPercentage).toMatch(/^-?\d+(\.\d+)?$/);
    expect(brl.historicalVar.lossPercentage).toMatch(/^\d+(\.\d+)?$/);
    expect(brl.historicalCvar.lossPercentage).toMatch(/^\d+(\.\d+)?$/);
    // Loss magnitudes are non-negative.
    expect(brl.historicalVar.lossPercentage.startsWith('-')).toBe(false);
    expect(brl.historicalCvar.lossPercentage.startsWith('-')).toBe(false);
    // Counts are integers.
    expect(Number.isInteger(brl.historicalVar.tailObservationCount)).toBe(true);
    expect(brl.historicalVar.tailObservationCount).toBe(1);
    expect(Number.isInteger(brl.downsideDeviation.negativeObservationCount)).toBe(true);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
  });

  it('confidence 99 with 20 observations: downside available, VaR/CVaR unavailable, PARTIAL', async () => {
    const userId = '22222222-aaaa-4aaa-8aaa-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'TailInsuff99',
      ticker: 'TINS4',
      days,
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=99`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.downsideDeviation.dailyPercentage).not.toBeNull();
    expect(brl.semideviation.dailyPercentage).not.toBeNull();
    expect(brl.historicalVar.lossPercentage).toBeNull();
    expect(brl.historicalCvar.lossPercentage).toBeNull();
    expect(res.body.data.status).toBe('PARTIAL');
  });

  it('confidence 99 with 100 observations: all metrics available', async () => {
    const userId = '33333333-aaaa-4aaa-8aaa-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(101, '2026-02-02');
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'Tail99',
      ticker: 'T0994',
      days,
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[100]}&confidenceLevel=99`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.observationCount).toBe(100);
    expect(brl.historicalVar.lossPercentage).not.toBeNull();
    expect(brl.historicalVar.tailObservationCount).toBe(1);
    expect(brl.historicalCvar.lossPercentage).not.toBeNull();
    expect(res.body.data.status).toBe('AVAILABLE');
  });

  it('USD-only portfolio computes tail risk for USD (no FX needed)', async () => {
    const userId = '44444444-aaaa-4aaa-8aaa-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21, '2026-03-02');
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TailUSD', baseCurrency: 'USD', type: 'PERSONAL' })
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
        tradeDate: new Date(`${days[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });
    days.forEach((date, i) => {
      historical.seed({
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        date,
        close: String(200 + ((i * 5) % 7)),
        currency: 'USD',
      });
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=95`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usd = res.body.data.currencies.USD;
    expect(usd).toBeDefined();
    expect(usd.downsideDeviation.dailyPercentage).not.toBeNull();
    expect(usd.historicalVar.lossPercentage).not.toBeNull();
  });

  it('BRL + USD are segregated in the same response (no FX)', async () => {
    const userId = '55555555-aaaa-4aaa-8aaa-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21, '2026-04-01');
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TailMulti', baseCurrency: 'BRL', type: 'PERSONAL' })
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
        tradeDate: new Date(`${days[0]}T00:00:00Z`),
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
        tradeDate: new Date(`${days[0]}T00:00:00Z`),
        source: 'MANUAL',
      },
    });

    days.forEach((date, i) => {
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

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=95`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.currencies.BRL).toBeDefined();
    expect(res.body.data.currencies.USD).toBeDefined();
    expect(res.body.data.currencies.BRL.currency).toBe('BRL');
    expect(res.body.data.currencies.USD.currency).toBe('USD');
    // No cross-currency aggregation: each block has its own observation count.
    expect(res.body.data.currencies.BRL.observationCount).toBe(20);
    expect(res.body.data.currencies.USD.observationCount).toBe(20);
  });

  it('invalid period and future date → 400', async () => {
    const userId = '66666666-aaaa-4aaa-8aaa-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TailBad', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const id = portfolioRes.body.data.id;
    const bad = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/tail-risk?confidenceLevel=95&startDate=2026-02-01&endDate=2026-01-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(bad.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
    const future = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${id}/performance/tail-risk?confidenceLevel=95&startDate=2096-01-01&endDate=2096-02-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(future.body.code).toBe('PERFORMANCE.INVALID_PERIOD');
  });

  it('inception clamp: period starts at first trade', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21, '2026-05-04');
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'TailInception',
      ticker: 'TINC4',
      days,
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=2026-01-01&endDate=${days[20]}&confidenceLevel=95`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.period.startDate).toBe(days[0]);
  });

  it('weekend deposit is neutralized by TWR and does not become a tail observation', async () => {
    const userId = '99999999-bbbb-4bbb-8bbb-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21);
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'TailFlow',
      ticker: 'TFLW4',
      days,
    });
    const account = await prisma.account.findFirstOrThrow({ where: { portfolioId } });
    // Saturday 2026-01-10 (days[0] = Mon 2026-01-05) deposit.
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-10T00:00:00Z'),
        settlementDate: new Date('2026-01-10T00:00:00Z'),
        amount: '1000.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=95`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // The Saturday flow date is a TWR boundary only; it never becomes an
    // economic tail observation. Layer-B count stays businessDays − 1 = 20.
    expect(res.body.data.currencies.BRL.observationCount).toBe(20);
  });

  it('no provider internals leak', async () => {
    const userId = '88888888-aaaa-4aaa-8aaa-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const days = businessDates(21, '2026-06-01');
    const portfolioId = await seedBrlPortfolio({
      token,
      name: 'TailHide',
      ticker: 'THID4',
      days,
    });
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${days[0]}&endDate=${days[20]}&confidenceLevel=95`,
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
