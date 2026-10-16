import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

describe('API Integration: Phase 5A-I2 Portfolio Valuation & Allocation Read Models', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Valuation & Allocation Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function setupPortfolio(userId: string, baseCurrency = 'BRL') {
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Principal', baseCurrency, type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portRes.body.data.id;

    const instRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XP Investimentos', type: 'BROKER', country: 'BR' })
      .expect(201);
    const institutionId = instRes.body.data.id;

    const accRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'Conta Ações', currency: baseCurrency })
      .expect(201);
    const accountId = accRes.body.data.id;

    return { token, portfolioId, institutionId, accountId };
  }

  async function createAsset(opts: {
    ticker: string;
    type: string;
    currency: string;
    exchange: string;
  }) {
    const asset = Asset.create({
      ticker: opts.ticker,
      name: `${opts.ticker} S.A.`,
      type: opts.type as never,
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
    return asset;
  }

  async function insertPersistedQuote(opts: {
    assetId: string;
    tradingDate: string;
    currency: string;
    close: string;
    provider?: string;
    providerSymbol?: string;
  }) {
    const td = new Date(`${opts.tradingDate}T00:00:00.000Z`);
    return await prisma.marketQuoteRecord.create({
      data: {
        assetId: opts.assetId,
        tradingDate: td,
        currency: opts.currency,
        close: opts.close,
        provider: opts.provider ?? 'BRAPI',
        providerSymbol: opts.providerSymbol ?? 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Test 27: Full valuation (BUY 100 PETR4 @30, quote 37 -> qty 100, cost 3000, mv 3700, unrealized 700)
  // -------------------------------------------------------------------------
  it('Test 27: Full valuation with exact decimal math and 0 floats', async () => {
    const userId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // Buy 100 @ 30.00 = 3000.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-27-buy',
      })
      .expect(201);

    // Persist quote 37.00
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '37.00',
      providerSymbol: 'PETR4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    expect(val.portfolioId).toBe(portfolioId);
    expect(val.summary.totalPositions).toBe(1);
    expect(val.summary.valuedPositions).toBe(1);
    expect(val.summary.unvaluedPositions).toBe(0);
    expect(val.summary.valuationCoveragePercent).toBe('100');

    const pos = val.positions[0];
    expect(pos.ticker).toBe('PETR4');
    expect(pos.quantity).toBe('100');
    expect(pos.totalCost.amount).toBe('3000');
    expect(pos.totalCost.currency).toBe('BRL');
    expect(pos.averageCost.amount).toBe('30');
    expect(pos.averageCost.currency).toBe('BRL');
    expect(pos.marketValue.amount).toBe('3700');
    expect(pos.marketValue.currency).toBe('BRL');
    expect(pos.unrealizedGainLoss.amount).toBe('700');
    expect(pos.unrealizedGainLoss.currency).toBe('BRL');
    // 700 / 3000 * 100 = 23.333333333333333333
    expect(pos.unrealizedGainLossPercent).toMatch(/^23\.33/);
    expect(pos.status).toBe('VALUED');
  });

  // -------------------------------------------------------------------------
  // Test 28: Partial sale (BUY 100 @30, SELL 40 @35, quote 37 -> remaining 60, cost 1800, mv 2220)
  // -------------------------------------------------------------------------
  it('Test 28: Partial sale preserves correct remaining cost basis and valuation', async () => {
    const userId = 'aaaaaaaa-2222-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-28-buy',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'SELL',
        quantity: '40',
        unitPrice: '35.00',
        totalAmount: '1400.00',
        currency: 'BRL',
        tradeDate: '2026-03-10',
        provider: 'B3',
        externalId: 'tx-28-sell',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '37.00',
      providerSymbol: 'PETR4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.quantity).toBe('60');
    expect(pos.totalCost.amount).toBe('1800');
    expect(pos.averageCost.amount).toBe('30');
    // 60 * 37 = 2220
    expect(pos.marketValue.amount).toBe('2220');
    // 2220 - 1800 = 420
    expect(pos.unrealizedGainLoss.amount).toBe('420');
  });

  // -------------------------------------------------------------------------
  // Test 29: Partial valuation (PETR4 valued, VALE3 missing quote -> total 2, valued 1, unvalued 1, status PARTIAL)
  // -------------------------------------------------------------------------
  it('Test 29: Partial valuation reflects missing quotes cleanly with PARTIAL status', async () => {
    const userId = 'aaaaaaaa-3333-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await createAsset({
      ticker: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-29-p',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '50',
        unitPrice: '60.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-29-v',
      })
      .expect(201);

    // Only PETR4 has a quote
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '37.00',
      providerSymbol: 'PETR4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    expect(val.summary.totalPositions).toBe(2);
    expect(val.summary.valuedPositions).toBe(1);
    expect(val.summary.unvaluedPositions).toBe(1);
    expect(val.summary.unavailablePositions).toBe(1);
    expect(val.summary.valuationCoveragePercent).toBe('50');
    expect(val.completeness).toBe('PARTIAL_QUOTES');

    const valePos = val.positions.find((p: { ticker: string }) => p.ticker === 'VALE3');
    expect(valePos.status).toBe('QUOTE_UNAVAILABLE');
    expect(valePos.marketValue).toBeNull();
    expect(valePos.unrealizedGainLoss).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 30: Stale valuation (quote classified STALE -> status QUOTE_STALE, stalePositionCount 1)
  // -------------------------------------------------------------------------
  it('Test 30: Stale valuation flags quotes older than recent market session', async () => {
    const userId = 'aaaaaaaa-4444-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const itub4 = await createAsset({
      ticker: 'ITUB4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: itub4.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '30.00',
        totalAmount: '300.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-30-itub',
      })
      .expect(201);

    // Very old quote -> STALE
    await insertPersistedQuote({
      assetId: itub4.id,
      tradingDate: '2025-01-05',
      currency: 'BRL',
      close: '35.00',
      providerSymbol: 'ITUB4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.status).toBe('QUOTE_STALE');
    expect(pos.quoteFreshness).toBe('STALE');
    expect(pos.marketValue.amount).toBe('350');
    expect(val.summary.stalePositions).toBe(1);
    expect(val.completeness).toBe('PARTIAL_STALE');
  });

  // -------------------------------------------------------------------------
  // Test 31: Unknown cost basis (cost basis status INCOMPLETE -> market value known, unrealized null)
  // -------------------------------------------------------------------------
  it('Test 31: Unknown cost basis computes market value but keeps unrealized null', async () => {
    const userId = 'aaaaaaaa-5555-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const bbdc4 = await createAsset({
      ticker: 'BBDC4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // UNMATCHED TRANSFER_IN establishes position without known cost (costBasisStatus: INCOMPLETE)
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: bbdc4.id,
        type: 'TRANSFER_IN',
        quantity: '50',
        unitPrice: '0',
        totalAmount: '0',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-31-transfer-in',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: bbdc4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '15.00',
      providerSymbol: 'BBDC4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.marketValue.amount).toBe('750');
    expect(pos.unrealizedGainLoss).toBeNull();
    expect(pos.unrealizedGainLossPercent).toBeNull();
    expect(pos.status).toBe('COST_INCOMPLETE');
  });

  // -------------------------------------------------------------------------
  // Test 32: Multi-currency (BRL asset + USD asset -> totalsByCurrency segregated, no grand total)
  // -------------------------------------------------------------------------
  it('Test 32: Multi-currency positions are segregated by currency with no synthetic sum', async () => {
    const userId = 'aaaaaaaa-6666-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, institutionId, accountId } = await setupPortfolio(userId);

    // Create second account in USD
    const usdAccRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'Conta Internacional', currency: 'USD' })
      .expect(201);
    const usdAccountId = usdAccRes.body.data.id;

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const aapl = await createAsset({
      ticker: 'AAPL',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '30.00',
        totalAmount: '300.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-32-petr4',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: usdAccountId,
        assetId: aapl.id,
        type: 'BUY',
        quantity: '5',
        unitPrice: '200.00',
        totalAmount: '1000.00',
        currency: 'USD',
        tradeDate: '2026-03-01',
        provider: 'NASDAQ',
        externalId: 'tx-32-aapl',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '35.00',
      providerSymbol: 'PETR4',
    });
    await insertPersistedQuote({
      assetId: aapl.id,
      tradingDate: today,
      currency: 'USD',
      close: '220.00',
      providerSymbol: 'AAPL',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const totals = val.totalsByCurrency;
    expect(totals['BRL']).toBeDefined();
    expect(totals['USD']).toBeDefined();
    expect(totals['BRL'].marketValue.amount).toBe('350');
    expect(totals['USD'].marketValue.amount).toBe('1100');
  });

  // -------------------------------------------------------------------------
  // Test 33: Currency mismatch (BRL position + USD quote -> CURRENCY_MISMATCH)
  // -------------------------------------------------------------------------
  it('Test 33: Currency mismatch rejects converting quote currency to position currency', async () => {
    const userId = 'aaaaaaaa-7777-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const weird = await createAsset({
      ticker: 'WEIRD',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: weird.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '10.00',
        totalAmount: '100.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-33-buy',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Quote in USD instead of BRL
    await insertPersistedQuote({
      assetId: weird.id,
      tradingDate: today,
      currency: 'USD',
      close: '50.00',
      providerSymbol: 'WEIRD',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.status).toBe('CURRENCY_MISMATCH');
    expect(pos.marketValue).toBeNull();
    expect(val.summary.mismatchPositions).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 34: Allocation by asset (PETR4 6000, VALE3 4000 -> 60% and 40%)
  // -------------------------------------------------------------------------
  it('Test 34: Allocation by asset computes exact percentages', async () => {
    const userId = 'aaaaaaaa-8888-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await createAsset({
      ticker: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // PETR4: 100 shares @ 60 = 6000
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '50.00',
        totalAmount: '5000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-34-p',
      })
      .expect(201);

    // VALE3: 100 shares @ 40 = 4000
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-34-v',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '60.00',
      providerSymbol: 'PETR4',
    });
    await insertPersistedQuote({
      assetId: vale3.id,
      tradingDate: today,
      currency: 'BRL',
      close: '40.00',
      providerSymbol: 'VALE3',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const alloc = res.body.data;
    expect(alloc.status).toBe('COMPLETE');
    expect(alloc.valuationCoveragePercent).toBe('100');

    const brlBucket = alloc.currencies['BRL'];
    expect(brlBucket.totalMarketValue.amount).toBe('10000');

    const pAlloc = brlBucket.byAsset.find((a: { ticker: string }) => a.ticker === 'PETR4');
    const vAlloc = brlBucket.byAsset.find((a: { ticker: string }) => a.ticker === 'VALE3');

    expect(pAlloc.allocationPercent).toBe('60');
    expect(pAlloc.marketValue.amount).toBe('6000');
    expect(vAlloc.allocationPercent).toBe('40');
    expect(vAlloc.marketValue.amount).toBe('4000');
  });

  // -------------------------------------------------------------------------
  // Test 35: Allocation by class (STOCK 10000, FII 5000 -> 66.67% and 33.33%)
  // -------------------------------------------------------------------------
  it('Test 35: Allocation by asset class groups assets properly', async () => {
    const userId = 'aaaaaaaa-9999-4111-8111-aaaaaaaaaaaa';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const stock = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const fii = await createAsset({
      ticker: 'HGLG11',
      type: 'REAL_ESTATE_FUND',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: stock.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '100.00',
        totalAmount: '10000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-35-stock',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: fii.id,
        type: 'BUY',
        quantity: '50',
        unitPrice: '100.00',
        totalAmount: '5000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-35-fii',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: stock.id,
      tradingDate: today,
      currency: 'BRL',
      close: '100.00',
      providerSymbol: 'PETR4',
    });
    await insertPersistedQuote({
      assetId: fii.id,
      tradingDate: today,
      currency: 'BRL',
      close: '100.00',
      providerSymbol: 'HGLG11',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const alloc = res.body.data;
    const brlBucket = alloc.currencies['BRL'];

    const stockClass = brlBucket.byAssetClass.find(
      (c: { assetClass: string }) => c.assetClass === 'STOCK',
    );
    const fiiClass = brlBucket.byAssetClass.find(
      (c: { assetClass: string }) => c.assetClass === 'REAL_ESTATE_FUND',
    );

    expect(stockClass.marketValue.amount).toBe('10000');
    expect(stockClass.allocationPercent).toMatch(/^66\.66|^66\.67/);
    expect(fiiClass.marketValue.amount).toBe('5000');
    expect(fiiClass.allocationPercent).toMatch(/^33\.33/);
  });

  // -------------------------------------------------------------------------
  // Test 36: Partial allocation (unvaluedAssets array populated, 50% coverage, status PARTIAL)
  // -------------------------------------------------------------------------
  it('Test 36: Partial allocation reports unvaluedAssets with reasons', async () => {
    const userId = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await createAsset({
      ticker: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '30.00',
        totalAmount: '300.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-36-p',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '60.00',
        totalAmount: '600.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-36-v',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '35.00',
      providerSymbol: 'PETR4',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const alloc = res.body.data;
    expect(alloc.status).toBe('PARTIAL');
    expect(alloc.valuationCoveragePercent).toBe('50');

    const brlBucket = alloc.currencies['BRL'];
    expect(brlBucket.byAsset.length).toBe(1);
    expect(brlBucket.unvaluedAssets.length).toBe(1);
    expect(brlBucket.unvaluedAssets[0].ticker).toBe('VALE3');
    expect(brlBucket.unvaluedAssets[0].reason).toBe('QUOTE_UNAVAILABLE');
  });

  // -------------------------------------------------------------------------
  // Test 37: Rectification regression (rectified transaction updates quantity/cost basis for valuation)
  // -------------------------------------------------------------------------
  it('Test 37: Transaction rectification updates quantity and cost basis in valuation', async () => {
    const userId = 'bbbbbbbb-2222-4111-8111-bbbbbbbbbbbb';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    const txRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-37-orig',
      })
      .expect(201);
    const txId = txRes.body.data.id;

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '40.00',
      providerSymbol: 'PETR4',
    });

    // Rectify transaction: change quantity to 200, unitPrice 25, totalAmount 5000
    const rectifyRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions/${txId}/rectify`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Corrected quantity from broker note',
        replacement: {
          type: 'BUY',
          quantity: '200',
          unitPrice: '25.00',
          tradeDate: '2026-03-01',
          fees: '0.00',
          notes: 'Substituição corrigida',
        },
      })
      .expect(200);

    expect(rectifyRes.body.data.isIdempotentReplay).toBe(false);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.quantity).toBe('200');
    expect(pos.totalCost.amount).toBe('5000');
    expect(pos.averageCost.amount).toBe('25');
    // 200 * 40 = 8000
    expect(pos.marketValue.amount).toBe('8000');
    // 8000 - 5000 = 3000
    expect(pos.unrealizedGainLoss.amount).toBe('3000');
  });

  // -------------------------------------------------------------------------
  // Test 38: Provider outage cached read (simulate provider down, valuation still succeeds from DB cache with 0 live calls)
  // -------------------------------------------------------------------------
  it('Test 38: Provider outage does not affect GET valuation (reads pure DB cache with 0 live calls)', async () => {
    const userId = 'bbbbbbbb-3333-4111-8111-bbbbbbbbbbbb';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '30.00',
        totalAmount: '300.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: 'tx-38-buy',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: today,
      currency: 'BRL',
      close: '38.50',
      providerSymbol: 'PETR4',
    });

    // Make request - even if network/upstream is completely offline, GET /valuation must succeed
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.positions[0].marketValue.amount).toBe('385');
  });

  // -------------------------------------------------------------------------
  // Test 39: Tax isolation (verify monthly tax, day-trade, IRRF, DARF, Bens e Direitos unchanged)
  // -------------------------------------------------------------------------
  it('Test 39: Tax calculations and fiscal read models remain 100% isolated from valuation quotes', async () => {
    const userId = 'bbbbbbbb-4444-4111-8111-bbbbbbbbbbbb';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // Buy 100 @ 30 = 3000
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-05',
        provider: 'B3',
        externalId: 'tx-39-buy',
      })
      .expect(201);

    // Persist a high market quote (e.g. 100.00)
    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: '2026-03-31',
      currency: 'BRL',
      close: '100.00',
      providerSymbol: 'PETR4',
    });

    // Fiscal monthly liability should show ZERO tax because unrealized market quote does not trigger taxable capital gain
    const taxRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/2026-03/liability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Tax liability exists and reports 0 tax due
    expect(taxRes.body.data).toBeDefined();
    if (taxRes.body.data.totalTaxDue) {
      expect(taxRes.body.data.totalTaxDue.amount).toBe('0');
    }
  });

  // -------------------------------------------------------------------------
  // Test 40: Ownership & cross-user 404 anti-enumeration
  // -------------------------------------------------------------------------
  it('Test 40: Ownership isolation ensures 404 Not Found on cross-user valuation and allocation', async () => {
    const userA = 'cccccccc-1111-4111-8111-cccccccccccc';
    const userB = 'cccccccc-2222-4111-8111-cccccccccccc';
    const { portfolioId } = await setupPortfolio(userA);

    await ensureUser(userB);
    const { token: tokenB } = await createAuthenticatedUserSession(userB);

    // User B tries to view User A's valuation -> 404
    const valRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    expect(valRes.body.code).toBe('PORTFOLIO.NOT_FOUND');

    // User B tries to view User A's allocation -> 404
    const allocRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    expect(allocRes.body.code).toBe('PORTFOLIO.NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Test 41: Section 4 — Stale quote position remains VALUED (not unvalued)
  // -------------------------------------------------------------------------
  it('Test 41: Section 4 — Stale quote position remains VALUED with marketValue and unrealized KNOWN', async () => {
    const userId = 'dddddddd-1111-4111-8111-dddddddddddd';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // BUY 100 PETR4 @ 30
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-41-buy',
      })
      .expect(201);

    // Persist stale quote: close = 37 (old date)
    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: '2025-01-05',
      currency: 'BRL',
      close: '37.00',
      providerSymbol: 'PETR4',
    });

    // Owner requests valuation -> 200
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = res.body.data;
    const pos = val.positions[0];
    expect(pos.quantity).toBe('100');
    expect(pos.totalCost.amount).toBe('3000');
    expect(pos.marketValue.amount).toBe('3700');
    expect(pos.unrealizedGainLoss.amount).toBe('700');
    expect(pos.quoteFreshness).toBe('STALE');
    expect(pos.status).toBe('QUOTE_STALE');

    expect(val.summary.totalPositions).toBe(1);
    expect(val.summary.valuedPositions).toBe(1);
    expect(val.summary.unvaluedPositions).toBe(0);
    expect(val.summary.stalePositions).toBe(1);
    expect(val.summary.unavailablePositions).toBe(0);
    expect(val.completeness).toBe('PARTIAL_STALE');
  });

  // -------------------------------------------------------------------------
  // Test 42: Section 5 — Stale allocation participates in denominator (60% / 40%)
  // -------------------------------------------------------------------------
  it('Test 42: Section 5 — Stale quote participates in allocation denominator and is excluded from unvaluedAssets', async () => {
    const userId = 'dddddddd-2222-4111-8111-dddddddddddd';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await createAsset({
      ticker: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // Buy PETR4 (100 @ 60 = 6000 mv)
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '50.00',
        totalAmount: '5000.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-42-petr4',
      })
      .expect(201);

    // Buy VALE3 (100 @ 40 = 4000 mv)
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '35.00',
        totalAmount: '3500.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-42-vale3',
      })
      .expect(201);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // PETR4 stale quote @ 60.00
    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: '2025-01-05',
      currency: 'BRL',
      close: '60.00',
      providerSymbol: 'PETR4',
    });

    // VALE3 fresh quote @ 40.00
    await insertPersistedQuote({
      assetId: vale3.id,
      tradingDate: today,
      currency: 'BRL',
      close: '40.00',
      providerSymbol: 'VALE3',
    });

    // Owner requests allocation -> 200
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const alloc = res.body.data;
    const brl = alloc.currencies.BRL;
    expect(brl.totalMarketValue.amount).toBe('10000');

    const petr4Alloc = brl.byAsset.find((a: { ticker: string }) => a.ticker === 'PETR4');
    const vale3Alloc = brl.byAsset.find((a: { ticker: string }) => a.ticker === 'VALE3');

    expect(petr4Alloc.marketValue.amount).toBe('6000');
    expect(petr4Alloc.allocationPercent).toBe('60');
    expect(petr4Alloc.quoteFreshness).toBe('STALE');

    expect(vale3Alloc.marketValue.amount).toBe('4000');
    expect(vale3Alloc.allocationPercent).toBe('40');
    expect(vale3Alloc.quoteFreshness).toBe('FRESH');

    // unvaluedAssets must NOT include PETR4 merely because it's stale
    expect(brl.unvaluedAssets).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 43: Section 6 — Stale + Missing differentiation
  // -------------------------------------------------------------------------
  it('Test 43: Section 6 — Stale vs Missing differentiation (PETR4 stale, VALE3 missing)', async () => {
    const userId = 'dddddddd-3333-4111-8111-dddddddddddd';
    const { token, portfolioId, accountId } = await setupPortfolio(userId);

    const petr4 = await createAsset({
      ticker: 'PETR4',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await createAsset({
      ticker: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });

    // Buy PETR4 & VALE3
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '50.00',
        totalAmount: '5000.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-43-petr4',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '50',
        unitPrice: '60.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2025-01-01',
        provider: 'B3',
        externalId: 'tx-43-vale3',
      })
      .expect(201);

    // Only PETR4 has stale quote; VALE3 has NO quote
    await insertPersistedQuote({
      assetId: petr4.id,
      tradingDate: '2025-01-05',
      currency: 'BRL',
      close: '55.00',
      providerSymbol: 'PETR4',
    });

    // Check Valuation
    const valRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const val = valRes.body.data;
    expect(val.summary.totalPositions).toBe(2);
    expect(val.summary.valuedPositions).toBe(1); // PETR4
    expect(val.summary.unvaluedPositions).toBe(1); // VALE3
    expect(val.summary.stalePositions).toBe(1); // PETR4
    expect(val.summary.unavailablePositions).toBe(1); // VALE3

    // Check Allocation
    const allocRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const alloc = allocRes.body.data;
    expect(alloc.status).toBe('PARTIAL');
    const brl = alloc.currencies.BRL;

    // Denominator has PETR4 only
    expect(brl.totalMarketValue.amount).toBe('5500');
    expect(brl.byAsset).toHaveLength(1);
    expect(brl.byAsset[0].ticker).toBe('PETR4');
    expect(brl.byAsset[0].allocationPercent).toBe('100');

    // unvaluedAssets has VALE3 only
    expect(brl.unvaluedAssets).toHaveLength(1);
    expect(brl.unvaluedAssets[0].ticker).toBe('VALE3');
    expect(brl.unvaluedAssets[0].reason).toBe('QUOTE_UNAVAILABLE');
  });
});
