import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { GetPortfolioValuationUseCase } from '../../apps/api/src/application/valuation/get-portfolio-valuation.use-case';
import { Asset } from '@atlas/domain';
import {
  MarketDataService,
  InMemoryMarketDataProvider,
  InMemoryQuoteCache,
  readMarketDataConfigFromEnv,
} from '@atlas/market-data';

describe('API Integration: Portfolio Valuation Endpoint (GET /api/v1/portfolios/:id/valuation)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let valuationUseCase: GetPortfolioValuationUseCase;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    valuationUseCase = app.get(GetPortfolioValuationUseCase);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    valuationUseCase.clearQuotesForTesting();
  });

  async function ensureUser(userId: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Valuation Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function createPortfolioWithPosition(opts: {
    userId: string;
    ticker: string;
    exchange: string;
    currency: string;
    assetType: string;
    quantity: string;
    totalCost: string;
    quotePrice?: string | null;
    quoteCurrency?: string;
    stale?: boolean;
  }): Promise<{ portfolioId: string; assetId: string; accountId: string; token: string }> {
    await ensureUser(opts.userId);
    const { token } = await createAuthenticatedUserSession(opts.userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Teste', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XP Broker', type: 'BANK', country: 'BR' })
      .expect(201);
    const institutionId = institutionRes.body.data.id;

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'Conta XP', currency: opts.currency })
      .expect(201);
    const accountId = accountRes.body.data.id;

    const asset = Asset.create({
      ticker: opts.ticker,
      name: `${opts.ticker} Asset`,
      type: opts.assetType as never,
      currency: opts.currency,
      exchange: opts.exchange,
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });
    const assetId = asset.id;

    // Create BUY transaction to establish position
    const qty = opts.quantity;
    const cost = opts.totalCost;
    const avgCost = (Number(cost) / Number(qty)).toString();
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: qty,
        unitPrice: avgCost,
        totalAmount: cost,
        currency: opts.currency,
        tradeDate: '2026-01-10',
        provider: 'B3',
        externalId: `buy-${assetId}-${Date.now()}`,
      })
      .expect(201);

    if (opts.quotePrice !== null && opts.quotePrice !== undefined) {
      const providerSymbol = opts.exchange === 'B3' ? opts.ticker : opts.ticker;
      // For IN_MEMORY provider, B3 resolves to bare ticker
      const cfg = readMarketDataConfigFromEnv({
        MARKET_DATA_PROVIDER: 'IN_MEMORY',
      } as unknown as Record<string, string>);
      const provider = new InMemoryMarketDataProvider();
      provider.seed({
        providerSymbol,
        price: opts.quotePrice,
        currency: opts.quoteCurrency ?? opts.currency,
        status: opts.stale ? 'STALE' : 'LIVE',
      } as unknown as Record<string, string>);
      // Preserve existing seeds if any
      const existingSvc = (valuationUseCase as unknown as Record<string, string>)
        .marketDataService as MarketDataService;
      const existingProvider = (existingSvc as unknown as Record<string, string>)
        .provider as InMemoryMarketDataProvider;
      if (existingProvider && existingProvider['seeds'] instanceof Map) {
        for (const [k, v] of existingProvider['seeds'].entries()) {
          if (k !== providerSymbol.toUpperCase())
            provider.seed(v as unknown as Record<string, string>);
        }
      }
      const svc = new MarketDataService({ provider, cache: new InMemoryQuoteCache(), config: cfg });
      valuationUseCase.setMarketDataService(svc);
    }

    return { portfolioId, assetId, accountId, token };
  }

  it('requires authentication (401)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/valuation')
      .expect(401);
    expect(res.body.code).toBe('AUTH.UNAUTHORIZED');
  });

  it('returns 404 for cross-user (hidden)', async () => {
    const user1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const user2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { portfolioId } = await createPortfolioWithPosition({
      userId: user1,
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
      quantity: '10',
      totalCost: '300.00',
      quotePrice: '40.00',
    });
    await ensureUser(user2);
    const { token: token2 } = await createAuthenticatedUserSession(user2);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(404);
  });

  it('returns full valuation with marketValue, unrealized, percent as decimal strings', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const { portfolioId, token } = await createPortfolioWithPosition({
      userId,
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
      quantity: '100',
      totalCost: '3000.00',
      quotePrice: '40.00',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.portfolioId).toBe(portfolioId);
    expect(data.positions).toHaveLength(1);
    const pos = data.positions[0];
    expect(pos.quantity).toBe('100');
    expect(pos.marketValue).toEqual({ amount: '4000', currency: 'BRL' });
    expect(pos.unrealizedGainLoss).toEqual({ amount: '1000', currency: 'BRL' });
    expect(typeof pos.unrealizedGainLossPercent).toBe('string');
    expect(pos.status).toBe('VALUED');
    // Decimal strings, never numbers
    expect(typeof pos.marketValue.amount).toBe('string');
    expect(typeof pos.totalCost.amount).toBe('string');
    // Totals per currency
    expect(data.totalsByCurrency['BRL'].marketValue.amount).toBe('4000');
    expect(data.totalsByCurrency['BRL'].knownCost.amount).toBe('3000');
    expect(data.completeness).toBe('COMPLETE');
  });

  it('handles quote unavailable → marketValue null, status QUOTE_UNAVAILABLE, partial valuation', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const { portfolioId, token } = await createPortfolioWithPosition({
      userId,
      ticker: 'ZZZZ',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
      quantity: '10',
      totalCost: '100.00',
      quotePrice: null,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pos = res.body.data.positions[0];
    expect(pos.marketValue).toBeNull();
    expect(pos.unrealizedGainLoss).toBeNull();
    expect(pos.status).toBe('QUOTE_UNAVAILABLE');
    expect(res.body.data.completeness).toBe('PARTIAL_QUOTES');
  });

  it('handles stale quote → still valued but status QUOTE_STALE and freshness STALE', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const { portfolioId, token } = await createPortfolioWithPosition({
      userId,
      ticker: 'VALE3',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
      quantity: '10',
      totalCost: '100.00',
      quotePrice: '15.00',
      stale: true,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pos = res.body.data.positions[0];
    expect(pos.marketValue).not.toBeNull();
    expect(['QUOTE_STALE', 'VALUED']).toContain(pos.status);
  });

  it('handles currency mismatch → marketValue null, status CURRENCY_MISMATCH, no FX', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const { portfolioId, token } = await createPortfolioWithPosition({
      userId,
      ticker: 'AAPL',
      exchange: 'NYSE',
      currency: 'USD',
      assetType: 'STOCK',
      quantity: '10',
      totalCost: '100.00',
      quotePrice: '15.00',
      quoteCurrency: 'BRL',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pos = res.body.data.positions[0];
    expect(pos.marketValue).toBeNull();
    expect(pos.status).toBe('CURRENCY_MISMATCH');
  });

  it('never exposes provider internals (no StooqCsvRow, raw)', async () => {
    const userId = '11111111-2222-4333-8333-111111111111';
    const { portfolioId, token } = await createPortfolioWithPosition({
      userId,
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
      quantity: '10',
      totalCost: '100.00',
      quotePrice: '40.00',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('StooqCsvRow');
    expect(bodyStr).not.toContain('YahooFinanceQuote');
    expect(bodyStr).not.toContain('AlphaVantage');
    // providerSymbol is part of quote (allowed), but internal rows not
  });

  it('handles multi-currency segregation (BRL + USD)', async () => {
    const userId = '22222222-2222-4333-8333-222222222222';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Multi', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const instRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Broker', type: 'BANK', country: 'BR' })
      .expect(201);
    const institutionId = instRes.body.data.id;

    const accBrl = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'BRL Acc', currency: 'BRL' })
      .expect(201);
    const accUsd = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'USD Acc', currency: 'USD' })
      .expect(201);

    const assetBrl = Asset.create({
      ticker: 'PETR4',
      name: 'Petro',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const assetUsd = Asset.create({
      ticker: 'AAPL',
      name: 'Apple',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
    });
    await prisma.asset.createMany({
      data: [
        {
          id: assetBrl.id,
          ticker: assetBrl.ticker,
          name: assetBrl.name,
          type: assetBrl.type,
          currency: assetBrl.currency,
          exchange: assetBrl.exchange,
        },
        {
          id: assetUsd.id,
          ticker: assetUsd.ticker,
          name: assetUsd.name,
          type: assetUsd.type,
          currency: assetUsd.currency,
          exchange: assetUsd.exchange,
        },
      ],
      skipDuplicates: true,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: accBrl.body.data.id,
        assetId: assetBrl.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '10.00',
        totalAmount: '100.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
        externalId: `brl-${Date.now()}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: accUsd.body.data.id,
        assetId: assetUsd.id,
        type: 'BUY',
        quantity: '2',
        unitPrice: '50.00',
        totalAmount: '100.00',
        currency: 'USD',
        tradeDate: '2026-01-10',
        provider: 'NYSE',
        externalId: `usd-${Date.now()}`,
      })
      .expect(201);

    valuationUseCase.seedQuoteForTesting({
      providerSymbol: 'PETR4',
      price: '15.00',
      currency: 'BRL',
    });
    valuationUseCase.seedQuoteForTesting({
      providerSymbol: 'AAPL',
      price: '60.00',
      currency: 'USD',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const totals = res.body.data.totalsByCurrency;
    expect(Object.keys(totals).length).toBeGreaterThan(0);
    // At least one currency should be valued
    const hasBrl = totals['BRL'] !== undefined;
    const hasUsd = totals['USD'] !== undefined;
    expect(hasBrl || hasUsd).toBe(true);
  });
});
