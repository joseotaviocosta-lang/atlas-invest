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
 * Phase 5R-E — position data quality diagnostics (read-only).
 *
 * Same composition as the portfolio endpoint filtered to one open asset:
 * no replay per position, no per-asset reconciliation inference.
 */
describe('API Integration: position data quality (Phase 5R-E)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function positionQualityUrl(assetId: string, id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/positions/${assetId}/data-quality`;
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

  function todaySp(offsetDays = 0): string {
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  let tickerSeq = 500;
  async function createAsset() {
    tickerSeq += 1;
    const ticker = `P5Q${tickerSeq}`;
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: 'BRL',
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

  async function buy(assetId: string, externalId: string, tradeDate: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate,
        provider: 'B3',
        externalId,
      });
    expect(res.status).toBe(201);
  }

  async function seedQuote(assetId: string, tradingDate: string) {
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${tradingDate}T00:00:00.000Z`),
        currency: 'BRL',
        close: '38.50',
        provider: 'BRAPI',
        providerSymbol: 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  it('returns position issues with affected capabilities and actions', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5rq-buy-${randomUUID()}`, addDays(todaySp(), -10));

    const res = await request(app.getHttpServer())
      .get(positionQualityUrl(asset.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.assetId).toBe(asset.id);
    expect(data.status).toBe('BLOCKED');
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0]).toMatchObject({
      code: 'MISSING_PRICE',
      domain: 'MARKET_DATA',
      severity: 'BLOCKING',
      actions: [{ type: 'VIEW_POSITION', assetId: asset.id }],
    });
    expect(data.issues[0].affectedCapabilities).toContain('VALUATION');
    expect(data.affectedCapabilities).toContain('VALUATION');
    expect(data.issueCount).toBe(1);
    expect(data.blockingCount).toBe(1);
    expect(data.reviewCount).toBe(0);
  });

  it('404s closed, unknown and foreign positions without writing', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5rq-buy-c-${randomUUID()}`, addDays(todaySp(), -10));
    await seedQuote(asset.id, todaySp());

    const clean = await request(app.getHttpServer())
      .get(positionQualityUrl(asset.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(clean.status).toBe(200);
    expect(clean.body.data.status).toBe('COMPLETE');

    // Full close removes the open position: no detail, never zeroed.
    const sell = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId: asset.id,
        type: 'SELL',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: addDays(todaySp(), -5),
        provider: 'B3',
        externalId: `tx-5rq-sell-${randomUUID()}`,
      });
    expect(sell.status).toBe(201);
    const closed = await request(app.getHttpServer())
      .get(positionQualityUrl(asset.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(closed.status).toBe(404);

    const unknown = await request(app.getHttpServer())
      .get(positionQualityUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(unknown.status).toBe(404);

    const foreign = await request(app.getHttpServer())
      .get(positionQualityUrl(asset.id, randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    const before = await prisma.transaction.count({ where: { portfolioId } });
    const again = await request(app.getHttpServer())
      .get(positionQualityUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(again.status).toBe(404);
    const after = await prisma.transaction.count({ where: { portfolioId } });
    expect(after).toBe(before);
  });
});
