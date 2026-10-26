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
 * Phase 5R-C — portfolio composition intelligence (read-only).
 *
 * Canonical asset/asset-class/currency breakdowns over a single known
 * denominator, with unvalued positions and unavailable classifications
 * reported explicitly. Issuer and sector dimensions stay unavailable:
 * no canonical source exists and nothing is inferred.
 */
describe('API Integration: portfolio composition (Phase 5R-C)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function compositionUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/composition`;
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

  function todaySp(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  async function createAsset(ticker: string, type = 'STOCK', currency = 'BRL') {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: type as never,
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

  async function buy(
    assetId: string,
    quantity: string,
    unitPrice: string,
    tradeDate = '2026-03-01',
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity,
        unitPrice,
        totalAmount: (Number(quantity) * Number(unitPrice)).toFixed(2),
        currency: 'BRL',
        tradeDate,
        provider: 'B3',
        externalId: `tx-5rc-${randomUUID()}`,
      });
    expect(res.status).toBe(201);
  }

  async function seedQuote(assetId: string, close: string, currency = 'BRL') {
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${todaySp()}T00:00:00.000Z`),
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

  async function seedFx(base: string, quote: string, rate: string) {
    await prisma.fxObservationRecord.deleteMany({
      where: { baseCurrency: base, quoteCurrency: quote },
    });
    await prisma.fxObservationRecord.create({
      data: {
        baseCurrency: base,
        quoteCurrency: quote,
        observationDate: new Date(`${todaySp()}T00:00:00.000Z`),
        rate,
        source: 'TEST',
      },
    });
  }

  it('composes asset, class and currency dimensions over one known denominator', async () => {
    const petr = await createAsset('PETR4', 'STOCK');
    const rend = await createAsset('REND1', 'FIXED_INCOME');
    const itub = await createAsset('ITUB4', 'STOCK');
    await buy(petr.id, '100', '30.00');
    await buy(rend.id, '100', '20.00');
    await buy(itub.id, '10', '25.00');
    await seedQuote(petr.id, '38.50');
    await seedQuote(rend.id, '22.00');
    // ITUB4 left unquoted: visible as unvalued, never zero-filled.

    const res = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(typeof data.generatedAt).toBe('string');
    // marketDataAsOf mirrors the allocation basis (null when the basis carries none).
    expect(data.marketDataAsOf === null || typeof data.marketDataAsOf === 'string').toBe(true);
    expect(['REPORTING_CURRENCY', 'SINGLE_CURRENCY']).toContain(data.basis);
    // Partial coverage (unvalued ITUB4) forces the single-currency path:
    // no translated block is consumed, so no reporting currency is claimed.
    expect(data.basis).toBe('SINGLE_CURRENCY');
    expect(data.reportingCurrency).toBeNull();
    expect(data.availableDimensions).toEqual(['ASSET', 'ASSET_CLASS', 'CURRENCY', 'EXCHANGE']);

    // Known total: 3850 + 2200 = 6050 (ITUB4 unvalued, excluded).
    const byAsset = data.dimensions.byAsset;
    expect(byAsset.currency).toBe('BRL');
    expect(byAsset.totalKnownValue).toMatchObject({ amount: '6050', currency: 'BRL' });
    const weights = Object.fromEntries(
      byAsset.buckets.map((row: { key: string; weightBp: number }) => [row.key, row.weightBp]),
    );
    // 3850/6050 = 63.636...% -> 6364bp; 2200/6050 = 36.363...% -> 3636bp.
    expect(weights[petr.id]).toBe(6364);
    expect(weights[rend.id]).toBe(3636);
    expect(
      byAsset.buckets.reduce((sum: number, row: { weightBp: number }) => sum + row.weightBp, 0),
    ).toBe(10000);
    expect(byAsset.buckets[0].key).toBe(petr.id);
    expect(byAsset.coveragePercent).toBe('100.00');

    // Asset class aggregation reuses the canonical taxonomy.
    const byClass = data.dimensions.byAssetClass;
    const classes = Object.fromEntries(
      byClass.buckets.map((row: { key: string; weightBp: number }) => [row.key, row.weightBp]),
    );
    expect(classes['STOCK']).toBe(weights[petr.id]);
    expect(classes['FIXED_INCOME']).toBe(weights[rend.id]);

    // Single currency: full weight on BRL.
    expect(data.dimensions.byCurrency.buckets).toEqual([
      expect.objectContaining({ key: 'BRL', weightBp: 10000 }),
    ]);

    // Exchange comes from the canonical asset record, not heuristics.
    expect(data.dimensions.byExchange.buckets).toEqual([
      expect.objectContaining({ key: 'B3', weightBp: 10000 }),
    ]);

    // Concentration facts are neutral (no judgment, no score).
    expect(data.concentrationFacts.largestPosition).toMatchObject({
      assetId: petr.id,
      weightBp: 6364,
    });
    expect(data.concentrationFacts.largestAssetClass).toMatchObject({ key: 'STOCK' });
    expect(JSON.stringify(data.concentrationFacts)).not.toMatch(/score|diversific|concentrated/i);

    // Top positions ordered by weight with stable ranks.
    expect(data.topPositions.map((row: { assetId: string }) => row.assetId)).toEqual([
      petr.id,
      rend.id,
    ]);
    expect(data.topPositions[0]).toMatchObject({ rank: 1, weightBp: 6364 });

    // Unvalued positions are listed, never dropped or zeroed.
    expect(data.unvaluedPositions).toEqual([
      expect.objectContaining({ assetId: itub.id, ticker: 'ITUB4' }),
    ]);
    expect(data.coverage.partialCoverage).toBe(true);
    expect(data.limitations).toContain('PARTIAL_PORTFOLIO_VALUATION');

    // Issuer/sector stay unavailable: no canonical source, nothing inferred.
    expect(data.limitations).toContain('ISSUER_CLASSIFICATION_NOT_AVAILABLE');
    expect(data.limitations).toContain('SECTOR_CLASSIFICATION_NOT_AVAILABLE');
    expect(data.availableDimensions).not.toContain('ISSUER');
    expect(data.availableDimensions).not.toContain('SECTOR');
  });

  it('translates multi-currency holdings with real FX and never mixes without it', async () => {
    const petr = await createAsset('PETR4', 'STOCK');
    await buy(petr.id, '100', '30.00');
    await seedQuote(petr.id, '38.50');

    const aapl = await createAsset('AAPL', 'STOCK');
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: aapl.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '200.00',
        currency: 'USD',
        tradeDate: new Date('2026-03-01T00:00:00.000Z'),
      },
    });
    await seedQuote(aapl.id, '210.00', 'USD');
    await seedFx('USD', 'BRL', '5.00');

    const res = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.basis).toBe('REPORTING_CURRENCY');
    expect(data.reportingCurrency).toBe('BRL');
    // Known total in BRL: 3850 + 10 * 210 * 5 = 3850 + 10500 = 14350.
    expect(data.dimensions.byAsset.totalKnownValue).toMatchObject({
      amount: '14350',
      currency: 'BRL',
    });
    const weights = Object.fromEntries(
      data.dimensions.byAsset.buckets.map((row: { key: string; weightBp: number }) => [
        row.key,
        row.weightBp,
      ]),
    );
    expect(weights[petr.id]).toBe(2683);
    expect(weights[aapl.id]).toBe(7317);
    expect(
      data.dimensions.byAsset.buckets.reduce(
        (sum: number, row: { weightBp: number }) => sum + row.weightBp,
        0,
      ),
    ).toBe(10000);
  });

  it('falls back to per-currency buckets without inventing cross-currency weights', async () => {
    const petr = await createAsset('PETR4', 'STOCK');
    await buy(petr.id, '100', '30.00');
    await seedQuote(petr.id, '38.50');

    // EUR has no FX observation: translation is unavailable.
    const sap = await createAsset('SAP4', 'STOCK', 'EUR');
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: sap.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '100.00',
        currency: 'EUR',
        tradeDate: new Date('2026-03-01T00:00:00.000Z'),
      },
    });
    await seedQuote(sap.id, '120.00', 'EUR');
    await prisma.fxObservationRecord.deleteMany({
      where: { OR: [{ baseCurrency: 'EUR' }, { quoteCurrency: 'EUR' }] },
    });

    const res = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.basis).toBe('PER_CURRENCY');
    expect(data.dimensions.byAsset).toBeNull();
    expect(data.dimensions.byAssetClass).toBeNull();
    expect(data.dimensions.byExchange).toBeNull();
    expect(data.availableDimensions).toEqual(['CURRENCY']);
    expect(data.limitations).toContain('MIXED_CURRENCIES_WITHOUT_TRANSLATION');
    const byCurrency = data.dimensions.byCurrency.buckets;
    expect(byCurrency).toHaveLength(2);
    const brl = byCurrency.find((row: { key: string }) => row.key === 'BRL');
    const eur = byCurrency.find((row: { key: string }) => row.key === 'EUR');
    expect(brl).toMatchObject({ marketValue: { amount: '3850', currency: 'BRL' }, weightBp: null });
    expect(eur).toMatchObject({ marketValue: { amount: '1200', currency: 'EUR' }, weightBp: null });
    expect(data.topPositions).toEqual([]);
  });

  it('reports an empty portfolio factually without fake buckets', async () => {
    const res = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dimensions).toEqual({
      byAsset: null,
      byAssetClass: null,
      byCurrency: null,
      byExchange: null,
    });
    expect(res.body.data.availableDimensions).toEqual([]);
    expect(res.body.data.limitations).toContain('NO_ACTIVITY');
    expect(res.body.data.topPositions).toEqual([]);
  });

  it('protects foreign portfolios with 404', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5rc@atlas.dev', name: 'S', passwordHash: 'x' },
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
          .get(compositionUrl(strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('shares the allocation basis and as-of date', async () => {
    const petr = await createAsset('PETR4', 'STOCK');
    await buy(petr.id, '10', '30.00');
    await seedQuote(petr.id, '38.50');

    const [composition, allocation] = await Promise.all([
      request(app.getHttpServer())
        .get(compositionUrl())
        .set('Authorization', `Bearer ${authToken}`),
      request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/allocation`)
        .set('Authorization', `Bearer ${authToken}`),
    ]);
    expect(composition.status).toBe(200);
    expect(allocation.status).toBe(200);
    expect(composition.body.data.marketDataAsOf).toBe(allocation.body.data.asOf);
    expect(composition.body.data.coverage.valuationCoveragePercent).toBe(
      allocation.body.data.valuationCoveragePercent,
    );
  });

  it('performs zero writes, stays deterministic and exposes no internal IDs', async () => {
    const petr = await createAsset('PETR4', 'STOCK');
    await buy(petr.id, '10', '30.00');
    await seedQuote(petr.id, '38.50');

    const counts = () =>
      Promise.all([
        prisma.transaction.count({ where: { portfolioId } }),
        prisma.marketQuoteRecord.count(),
        prisma.asset.count(),
      ]);
    const before = await counts();
    const first = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(compositionUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await counts()).toEqual(before);
    const { generatedAt: _first, ...firstRest } = first.body.data as Record<string, unknown>;
    const { generatedAt: _second, ...secondRest } = second.body.data as Record<string, unknown>;
    expect(secondRest).toEqual(firstRest);

    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toMatch(
      /passwordHash|refreshToken|externalId|fingerprint|providerSymbol|provider/i,
    );
  });
});
