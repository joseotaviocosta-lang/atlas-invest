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
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type { InMemoryBenchmarkDataProvider } from '@atlas/benchmark-engine';

function businessDatesEnding(endIso: string, n: number): string[] {
  const [y, m, d] = endIso.split('-').map(Number);
  const out: string[] = [];
  const cur = new Date(Date.UTC(y!, m! - 1, d!));
  while (out.length < n) {
    const w = cur.getUTCDay();
    if (w !== 0 && w !== 6) out.unshift(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return out;
}

interface AssetSeed {
  ticker: string;
  type: string;
  currency: string;
  exchange: string;
  quantity: number;
  unitPrice: number;
  priceDates: string[];
  prices: string[];
}

describe('API Integration: Scenario Analysis (POST /performance/scenarios/run)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;

  const AS_OF = '2026-09-22';
  const DAYS = businessDatesEnding(AS_OF, 25);

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
          name: 'Scenario Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function seedPortfolio(params: {
    token: string;
    name: string;
    assets: AssetSeed[];
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
    const accountsByCurrency = new Map<string, string>();
    for (const asset of params.assets) {
      let accountId = accountsByCurrency.get(asset.currency);
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
        accountsByCurrency.set(asset.currency, accountId);
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
          tradeDate: new Date(`${asset.priceDates[0] ?? DAYS[0]}T00:00:00Z`),
          source: 'MANUAL',
        },
      });
      asset.priceDates.forEach((date, i) => {
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

  function seedIbov() {
    DAYS.forEach((date, i) =>
      benchmark.seed({ benchmarkId: 'IBOV', date, value: String(100 + ((i * 3) % 7)) }),
    );
  }

  const equityAsset: AssetSeed = {
    ticker: 'SCEN3',
    type: 'STOCK',
    currency: 'BRL',
    exchange: 'BVMF',
    quantity: 100,
    unitPrice: 30,
    priceDates: DAYS,
    prices: DAYS.map((_, i) => String(30 + ((i * 7) % 5))),
  };
  const fixedIncomeAsset: AssetSeed = {
    ticker: 'SCFI3',
    type: 'FIXED_INCOME',
    currency: 'BRL',
    exchange: 'BVMF',
    quantity: 10,
    unitPrice: 100,
    priceDates: DAYS,
    prices: DAYS.map(() => '100'),
  };

  function run(token: string, portfolioId: string, body: unknown) {
    return request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/performance/scenarios/run`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance/scenarios/run')
      .send({ scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' } })
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
    await run(t2, p.body.data.id, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).then((r) => expect(r.status).toBe(404));
  });

  it('equity shock: base, stressed, impact as decimal strings', async () => {
    const userId = '11111111-aaaa-4aaa-8aaa-111111111111';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScEquity',
      assets: [equityAsset, fixedIncomeAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(200);

    const brl = res.body.data.currencies.BRL;
    expect(res.body.data.status).toBe('AVAILABLE');
    expect(brl.baseValue).toMatch(/^\d+(\.\d+)?$/);
    expect(brl.stressedValue).toMatch(/^\d+(\.\d+)?$/);
    expect(brl.absoluteImpact).toMatch(/^-?\d+(\.\d+)?$/);
    // Only the equity-eligible STOCK is stressed, so the portfolio-level
    // impact is negative but smaller than the -10% equity shock.
    expect(Number(brl.percentageImpact)).toBeLessThan(0);
    expect(brl.components[0].percentageImpact).toBe('-10');
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('Infinity');
    expect(txt).not.toContain('NaN');
  });

  it('benchmark shock uses the 3K historical Beta (AVAILABLE)', async () => {
    const userId = '22222222-aaaa-4aaa-8aaa-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScBench',
      assets: [equityAsset],
    });
    seedIbov();

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('AVAILABLE');
    expect(brl.stressedValue).not.toBeNull();
    expect(brl.components[0].componentType).toBe('BENCHMARK_SHOCK');
    expect(brl.components[0].status).toBe('AVAILABLE');
  });

  it('benchmark shock without IBOV data → UNAVAILABLE (no beta=1 fallback)', async () => {
    const userId = '33333333-aaaa-4aaa-8aaa-333333333333';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    // A distinct, non-overlapping window with NO IBOV levels seeded, so the
    // 3K Beta is genuinely unavailable (cross-test isolation).
    const noIbovAsOf = '2026-05-22';
    const noIbovDays = businessDatesEnding(noIbovAsOf, 25);
    const isolatedAsset: AssetSeed = {
      ticker: 'SCNBI',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'BVMF',
      quantity: 100,
      unitPrice: 30,
      priceDates: noIbovDays,
      prices: noIbovDays.map((_, i) => String(30 + ((i * 7) % 5))),
    };
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScNoBeta',
      assets: [isolatedAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: noIbovAsOf,
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('UNAVAILABLE');
    expect(brl.stressedValue).toBeNull();
    expect(brl.components[0].reason).toBe('SCENARIO.BETA_UNAVAILABLE');
  });

  it('rate shock → UNSUPPORTED (no duration metadata) without fake math', async () => {
    const userId = '44444444-aaaa-4aaa-8aaa-444444444444';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScRate',
      assets: [fixedIncomeAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'RATE_SHOCK', rateShockBps: '100' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('UNAVAILABLE');
    expect(brl.stressedValue).toBeNull();
    expect(brl.components[0].reason).toBe('SCENARIO.UNSUPPORTED_RATE_SHOCK');
  });

  it('combined equity + rate: equity drives the result, status PARTIAL', async () => {
    const userId = '55555555-aaaa-4aaa-8aaa-555555555555';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScCombined',
      assets: [equityAsset, fixedIncomeAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'COMBINED', equityShockPercentage: '-10', rateShockBps: '100' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('PARTIAL');
    expect(brl.stressedValue).not.toBeNull();
    const rate = brl.components.find(
      (c: { componentType: string }) => c.componentType === 'RATE_SHOCK',
    );
    expect(rate.status).toBe('UNAVAILABLE');
    expect(rate.reason).toBe('SCENARIO.UNSUPPORTED_RATE_SHOCK');
  });

  it('validation: invalid type, invalid bounds and conflicting shocks → 400 with stable codes', async () => {
    const userId = '66666666-aaaa-4aaa-8aaa-666666666666';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScValidation',
      assets: [equityAsset],
    });

    const invalidType = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'MONTE_CARLO' },
    }).expect(400);
    expect(invalidType.body.code).toBe('SCENARIO.INVALID_TYPE');

    const invalidShock = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-150' },
    }).expect(400);
    expect(invalidShock.body.code).toBe('SCENARIO.INVALID_SHOCK');

    const conflict = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: {
        type: 'COMBINED',
        equityShockPercentage: '-10',
        benchmarkShockPercentage: '-10',
      },
    }).expect(400);
    expect(conflict.body.code).toBe('SCENARIO.CONFLICTING_SHOCKS');
  });

  it('future asOf → 400; malformed asOf → 400', async () => {
    const userId = '77777777-aaaa-4aaa-8aaa-777777777777';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScAsOf',
      assets: [equityAsset],
    });

    const future = await run(token, portfolioId, {
      asOf: '2096-01-01',
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(400);
    expect(future.body.code).toBe('SCENARIO.INVALID_AS_OF');

    const malformed = await run(token, portfolioId, {
      asOf: 'not-a-date',
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(400);
    expect(malformed.body.code).toBe('SCENARIO.INVALID_AS_OF');
  });

  it('historical asOf: later transactions are excluded from the snapshot', async () => {
    const userId = '88888888-aaaa-4aaa-8aaa-888888888888';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScHistorical',
      assets: [equityAsset],
    });
    // A position bought AFTER asOf must not appear.
    const account = await prisma.account.findFirstOrThrow({ where: { portfolioId } });
    const lateAsset = await prisma.asset.create({
      data: { ticker: 'LATE3', name: 'LATE3', type: 'STOCK', currency: 'BRL', exchange: 'BVMF' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: account.id,
        assetId: lateAsset.id,
        type: 'BUY',
        quantity: 50,
        unitPrice: 10,
        currency: 'BRL',
        tradeDate: new Date('2026-09-23T00:00:00Z'),
        source: 'MANUAL',
      },
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.positionCount).toBe(1); // only the pre-asOf STOCK
  });

  it('BRL + USD are segregated (no FX)', async () => {
    const userId = '99999999-aaaa-4aaa-8aaa-999999999999';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const usdAsset: AssetSeed = {
      ticker: 'SCENU',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
      quantity: 10,
      unitPrice: 200,
      priceDates: DAYS,
      prices: DAYS.map((_, i) => String(200 + ((i * 5) % 7))),
    };
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScMulti',
      assets: [equityAsset, usdAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(200);
    expect(res.body.data.currencies.BRL).toBeDefined();
    expect(res.body.data.currencies.USD).toBeDefined();
    expect(res.body.data.currencies.BRL.currency).toBe('BRL');
    expect(res.body.data.currencies.USD.currency).toBe('USD');
  });

  it('partial valuation: unvalued positions reported, not treated as zero', async () => {
    const userId = '12121212-aaaa-4aaa-8aaa-121212121212';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const unvalued: AssetSeed = {
      ticker: 'SCNOV',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'BVMF',
      quantity: 10,
      unitPrice: 50,
      priceDates: [],
      prices: [],
    };
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScPartial',
      assets: [equityAsset, unvalued],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(200);
    const brl = res.body.data.currencies.BRL;
    expect(brl.status).toBe('PARTIAL');
    expect(brl.positionCount).toBe(2);
    expect(brl.valuedPositionCount).toBe(1);
    expect(brl.unvaluedPositionCount).toBe(1);
    expect(res.body.data.dataAvailability).toBe('PARTIAL');
  });

  it('rejects a fabricated modifiedDuration field (strict schema)', async () => {
    const userId = '14141414-aaaa-4aaa-8aaa-141414141414';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScFakeDuration',
      assets: [fixedIncomeAsset],
    });

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'RATE_SHOCK', rateShockBps: '100', modifiedDuration: '5' },
    }).expect(400);
    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    // No fake -5% repricing: never accepted.
    expect(res.body.data).toBeUndefined();
  });

  it('benchmark shock: BRL computed with BRL Beta, USD unavailable (no cross-currency Beta)', async () => {
    const userId = '15151515-aaaa-4aaa-8aaa-151515151515';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const usdAsset: AssetSeed = {
      ticker: 'SCBNU',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
      quantity: 10,
      unitPrice: 200,
      priceDates: DAYS,
      prices: DAYS.map((_, i) => String(200 + ((i * 5) % 7))),
    };
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScBenchMulti',
      assets: [equityAsset, usdAsset],
    });
    seedIbov();

    const res = await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
    }).expect(200);

    const brl = res.body.data.currencies.BRL;
    const usd = res.body.data.currencies.USD;
    expect(brl.status).toBe('AVAILABLE');
    expect(brl.stressedValue).not.toBeNull();
    // USD has no compatible Beta → unavailable; the BRL Beta is NEVER applied.
    expect(usd.status).toBe('UNAVAILABLE');
    expect(usd.stressedValue).toBeNull();
    expect(usd.components[0].reason).toBe('SCENARIO.BETA_UNAVAILABLE');
    expect(res.body.data.status).toBe('PARTIAL');
  });

  it('does not mutate the ledger or persist the scenario run', async () => {
    const userId = '13131313-aaaa-4aaa-8aaa-131313131313';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioId = await seedPortfolio({
      token,
      name: 'ScNoMutation',
      assets: [equityAsset],
    });
    const before = await prisma.transaction.count({ where: { portfolioId } });

    await run(token, portfolioId, {
      asOf: AS_OF,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    }).expect(200);

    const after = await prisma.transaction.count({ where: { portfolioId } });
    expect(after).toBe(before);
  });
});
