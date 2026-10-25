import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5R-A — position intelligence (read-only composition).
 *
 * One integrated answer per open position from canonical sources only:
 * replay state, valuation, allocation, ledger income and history. No new
 * engine, no persistence, no recommendations. Per-position performance
 * does not exist canonically — always null with an explicit limitation.
 */
describe('API Integration: position intelligence (Phase 5R-A)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function intelligenceUrl(assetId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/positions/${assetId}/intelligence`;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
  });

  async function createAsset(ticker: string, currency = 'BRL') {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency,
      exchange: 'B3',
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

  function todaySp(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  async function seedQuote(assetId: string, close: string, tradingDate?: string, currency = 'BRL') {
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${tradingDate ?? todaySp()}T00:00:00.000Z`),
        currency,
        close,
        provider: 'BRAPI',
        providerSymbol: 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  async function postTx(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  async function buy(
    assetId: string,
    quantity: string,
    unitPrice: string,
    externalId: string,
    tradeDate = '2026-03-01',
  ) {
    return postTx({
      accountId,
      assetId,
      type: 'BUY',
      quantity,
      unitPrice,
      totalAmount: (Number(quantity) * Number(unitPrice)).toFixed(2),
      currency: 'BRL',
      tradeDate,
      provider: 'B3',
      externalId,
    });
  }

  async function income(
    assetId: string,
    type: string,
    amount: string,
    externalId: string,
    tradeDate = '2026-06-15',
  ) {
    return postTx({
      accountId,
      assetId,
      type,
      amount,
      currency: 'BRL',
      tradeDate,
      provider: 'B3',
      externalId,
    });
  }

  it('composes a valid open position from canonical sources only', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '100', '30.00', 'tx-5ra-buy-1');
    await income(petr.id, 'DIVIDEND', '150.00', 'tx-5ra-div-1');
    await income(petr.id, 'JCP', '50.00', 'tx-5ra-jcp-1');
    await seedQuote(petr.id, '38.50');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.assetId).toBe(petr.id);
    expect(data.asset).toMatchObject({ ticker: 'PETR4', type: 'STOCK', currency: 'BRL' });
    expect(typeof data.generatedAt).toBe('string');

    // Quantity and cost basis from the canonical replay state.
    expect(data.position).toMatchObject({
      quantity: '100',
      currency: 'BRL',
      costBasisStatus: 'KNOWN',
      isOpen: true,
    });
    expect(data.position.totalCost).toMatchObject({ amount: '3000', currency: 'BRL' });
    expect(data.position.averageCost).toMatchObject({ amount: '30', currency: 'BRL' });

    // Valuation reuses the existing engine (price, value, unrealized).
    expect(data.valuation.status).toBe('VALUED');
    expect(data.valuation.price).toMatchObject({ amount: '38.5', currency: 'BRL' });
    expect(typeof data.valuation.price.asOf).toBe('string');
    expect(data.valuation.marketValue).toMatchObject({ amount: '3850', currency: 'BRL' });
    expect(data.valuation.unrealizedGainLoss).toMatchObject({ amount: '850', currency: 'BRL' });

    // Allocation weight matches the canonical allocation endpoint.
    const allocation = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const bucketWeight = allocation.body.data.currencies.BRL.byAsset.find(
      (row: { assetId: string }) => row.assetId === petr.id,
    );
    expect(data.allocation.weightPercent).toBe(bucketWeight.allocationPercent);
    expect(data.allocation.weightDenominator).toMatchObject(
      allocation.body.data.currencies.BRL.totalMarketValue,
    );
    expect(data.allocation.coveragePercent).toBe(allocation.body.data.valuationCoveragePercent);
    expect(data.allocation.partialCoverage).toBe(false);

    // Value matches the canonical valuation endpoint.
    const valuation = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/valuation`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const valued = valuation.body.data.positions.find(
      (row: { assetId: string }) => row.assetId === petr.id,
    );
    expect(data.valuation.marketValue).toEqual(valued.marketValue);
    expect(data.valuation.unrealizedGainLoss).toEqual(valued.unrealizedGainLoss);
    expect(data.marketDataAsOf).toBe(valuation.body.data.asOf);

    // Income derived from canonical DIVIDEND/JCP events, inception totals.
    expect(data.income.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '150', jcp: '50', fiiIncome: '0', total: '200' },
    ]);
    expect(data.income.recent).toHaveLength(2);

    // Recent activity is bounded and newest-first.
    expect(data.recentActivity.length).toBeLessThanOrEqual(10);
    expect(data.recentActivity[0]?.type).toBe('JCP');

    // No per-position performance engine exists: null + limitation.
    expect(data.performance).toBeNull();
    expect(data.limitations).toContain('POSITION_PERFORMANCE_NOT_AVAILABLE');
    expect(data.limitations).not.toContain('COST_BASIS_NOT_AVAILABLE');
  });

  it('protects foreign portfolios and unknown assets with 404', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '10', '30.00', 'tx-5ra-buy-404');

    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5ra@atlas.dev', name: 'S', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'SP',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(intelligenceUrl(petr.id, strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);

    // Asset exists globally but the portfolio holds no position: 404, never a zeroed shell.
    const other = await createAsset('VALE3');
    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(other.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/"quantity"\s*:\s*"0"/);
  });

  it('reports a missing price explicitly without inventing a value', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '100', '30.00', 'tx-5ra-buy-noprice');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.valuation.status).toBe('QUOTE_UNAVAILABLE');
    expect(data.valuation.price).toBeNull();
    expect(data.valuation.marketValue).toBeNull();
    expect(data.limitations).toContain('MISSING_PRICE');
    expect(data.dataQuality.priceAsOf).toBeNull();
    // Quantity and cost basis still come from the ledger replay.
    expect(data.position.quantity).toBe('100');
    expect(data.allocation.weightPercent).toBeNull();
  });

  it('reports a stale price with its date instead of calling it current', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '10', '30.00', 'tx-5ra-buy-stale', '2025-01-01');
    await seedQuote(petr.id, '35.00', '2025-01-05');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.valuation.status).toBe('QUOTE_STALE');
    expect(data.limitations).toContain('STALE_PRICE');
    expect(data.valuation.price).toMatchObject({ amount: '35', asOf: '2025-01-05' });
    expect(data.dataQuality.priceAsOf).toBe('2025-01-05');
    expect(data.valuation.marketValue).toMatchObject({ amount: '350', currency: 'BRL' });
  });

  it('keeps an incomplete cost basis null (never zero) with an explicit limitation', async () => {
    const bbdc = await createAsset('BBDC4');
    await postTx({
      accountId,
      assetId: bbdc.id,
      type: 'TRANSFER_IN',
      quantity: '50',
      unitPrice: '0',
      totalAmount: '0',
      currency: 'BRL',
      tradeDate: '2026-03-01',
      provider: 'B3',
      externalId: 'tx-5ra-transfer-in',
    });
    await seedQuote(bbdc.id, '15.00');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(bbdc.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.position.costBasisStatus).toBe('INCOMPLETE');
    expect(data.position.totalCost).toBeNull();
    expect(data.position.averageCost).toBeNull();
    expect(data.limitations).toContain('COST_BASIS_NOT_AVAILABLE');
    expect(data.valuation.status).toBe('COST_INCOMPLETE');
    expect(data.valuation.marketValue).toMatchObject({ amount: '750', currency: 'BRL' });
    expect(data.valuation.unrealizedGainLoss).toBeNull();
    expect(JSON.stringify(data.position)).not.toMatch(/"amount"\s*:\s*"0"/);
  });

  it('qualifies partial portfolio valuation instead of hiding it', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '100', '30.00', 'tx-5ra-buy-partial');
    await seedQuote(petr.id, '38.50');
    const itub = await createAsset('ITUB4');
    await buy(itub.id, '10', '20.00', 'tx-5ra-buy-unquoted');
    // ITUB4 intentionally left without a quote.

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.allocation.partialCoverage).toBe(true);
    expect(data.limitations).toContain('PARTIAL_PORTFOLIO_VALUATION');
    expect(Number(data.allocation.coveragePercent)).toBeLessThan(100);
    // The known part still carries a qualified weight (unique to this asset).
    expect(data.allocation.weightPercent).toBe('100');
  });

  it('never sums across currencies and flags missing FX translation', async () => {
    // EUR has no FX observation in the test database (USD/BRL is seeded by
    // other suites and cleanDatabase preserves fx_observations).
    await prisma.fxObservationRecord.deleteMany({
      where: { OR: [{ baseCurrency: 'EUR' }, { quoteCurrency: 'EUR' }] },
    });
    const sap = await createAsset('SAP', 'EUR');
    await postTx({
      accountId,
      assetId: sap.id,
      type: 'BUY',
      quantity: '10',
      unitPrice: '200.00',
      totalAmount: '2000.00',
      currency: 'EUR',
      tradeDate: '2026-03-01',
      provider: 'BROKER',
      externalId: 'tx-5ra-buy-eur',
    });
    await seedQuote(sap.id, '210.00', undefined, 'EUR');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(sap.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.position.currency).toBe('EUR');
    expect(data.valuation.marketValue).toMatchObject({ amount: '2100', currency: 'EUR' });
    expect(data.allocation.weightPercent).toBe('100');
    expect(data.limitations).toContain('NO_FX_TRANSLATION');
    expect(data.allocation.translatedWeightPercent).toBeNull();
    expect(data.allocation.reportingMarketValue).toBeNull();
    expect(data.allocation.reportingCurrency).toBe('BRL');
  });

  it('lists realized disposals with canonical gain/loss and bounds activity', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '100', '30.00', 'tx-5ra-buy-sell', '2026-01-05');
    await postTx({
      accountId,
      assetId: petr.id,
      type: 'SELL',
      quantity: '40',
      unitPrice: '40.00',
      totalAmount: '1600.00',
      currency: 'BRL',
      tradeDate: '2026-04-10',
      provider: 'B3',
      externalId: 'tx-5ra-sell-1',
    });
    for (let index = 0; index < 12; index += 1) {
      await income(petr.id, 'DIVIDEND', '10.00', `tx-5ra-div-${index}`, '2026-05-01');
    }
    await seedQuote(petr.id, '38.50');

    const res = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    // 60 remaining after the partial sale.
    expect(data.position.quantity).toBe('60');
    expect(data.realizedDisposals).toHaveLength(1);
    expect(data.realizedDisposals[0]).toMatchObject({
      quantity: '40',
      tradeDate: '2026-04-10',
      status: 'KNOWN',
    });
    expect(data.realizedDisposals[0].realizedGainLoss).toMatchObject({
      amount: '400',
      currency: 'BRL',
    });
    // Activity bounded to 10, newest first.
    expect(data.recentActivity).toHaveLength(10);
    expect(data.recentActivity[0]?.tradeDate >= data.recentActivity[9]?.tradeDate).toBe(true);
    // Income totals cover all 12 events even though recent shows 5.
    expect(data.income.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '120', jcp: '0', fiiIncome: '0', total: '120' },
    ]);
    expect(data.income.recent).toHaveLength(5);
  });

  it('performs zero writes and exposes no provider or external identifiers', async () => {
    const petr = await createAsset('PETR4');
    await buy(petr.id, '100', '30.00', 'tx-5ra-buy-readonly');
    await income(petr.id, 'DIVIDEND', '150.00', 'tx-5ra-div-readonly');
    await seedQuote(petr.id, '38.50');

    const counts = () =>
      Promise.all([
        prisma.transaction.count({ where: { portfolioId } }),
        prisma.marketQuoteRecord.count(),
        prisma.asset.count(),
      ]);
    const before = await counts();
    const first = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(intelligenceUrl(petr.id))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await counts()).toEqual(before);
    // Deterministic across reads (except the per-request clock).
    const { generatedAt: _first, ...firstRest } = first.body.data as Record<string, unknown>;
    const { generatedAt: _second, ...secondRest } = second.body.data as Record<string, unknown>;
    expect(secondRest).toEqual(firstRest);

    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toMatch(
      /passwordHash|refreshToken|externalId|fingerprint|providerSymbol|provider/i,
    );
  });
});
