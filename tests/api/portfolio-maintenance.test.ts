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
 * Phase 5S-D — portfolio data maintenance workspace (read-only).
 *
 * Derived over the 5R-E quality composition: every diagnosed issue
 * classified actionable / navigable / unsupported / structural with
 * routes only to existing flows. GET never writes.
 */
describe('API Integration: portfolio data maintenance (Phase 5S-D)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  const prisma = getTestPrismaClient();

  function maintenanceUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/maintenance`;
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
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(fixtures.userId);
    authToken = session.token;
  });

  let tickerSeq = 0;
  async function createAsset(): Promise<ReturnType<typeof Asset.create>> {
    tickerSeq += 1;
    const asset = Asset.create({
      ticker: `P5D${tickerSeq}`,
      name: `P5D ${tickerSeq} S.A.`,
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

  it('returns an empty workspace with structural items for a fresh portfolio', async () => {
    const res = await request(app.getHttpServer())
      .get(maintenanceUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.portfolioId).toBe(portfolioId);
    expect(typeof data.generatedAt).toBe('string');
    // Fresh portfolio: no positions, so no position issues; the
    // structural classification limits are always reported.
    expect(data.summary.total).toBe(data.structuralItems.length);
    expect(data.summary.actionable).toBe(0);
    expect(data.summary.navigable).toBe(0);
    expect(
      data.structuralItems.map((item: { issueCode: string }) => item.issueCode).sort(),
    ).toEqual(
      ['ISSUER_CLASSIFICATION_NOT_AVAILABLE', 'SECTOR_CLASSIFICATION_NOT_AVAILABLE'].sort(),
    );
    for (const item of data.structuralItems) {
      expect(item.maintenanceStatus).toBe('STRUCTURAL');
      expect(item.actionType).toBe('NONE');
      expect(item.route).toBeNull();
    }
    expect(data.actionableItems).toEqual([]);
    expect(data.navigableItems).toEqual([]);
    expect(data.unsupportedItems).toEqual([]);
  });

  it('404s foreign portfolios (anti-enumeration, never 403)', async () => {
    const foreign = await request(app.getHttpServer())
      .get('/api/v1/portfolios/00000000-0000-4000-8000-000000000000/maintenance')
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);
  });

  it('classifies a missing-price position as actionable with a provider-only route', async () => {
    const asset = await createAsset();
    const buyRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId: asset.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId: `tx-5sd-${randomUUID()}`,
      });
    expect(buyRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(maintenanceUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    const missing = data.actionableItems.find(
      (item: { issueCode: string }) => item.issueCode === 'MISSING_PRICE',
    );
    expect(missing).toBeDefined();
    expect(missing.assetId).toBe(asset.id);
    expect(missing.actionType).toBe('REFRESH_MARKET_DATA');
    expect(missing.route).toBe('/market');
    expect(missing.explanation).toBeDefined();
    expect(missing.safetyNote).toMatch(/nunca fabrica/i);
    expect(data.summary.actionable).toBeGreaterThanOrEqual(1);

    // 5R-E consistency: the quality endpoint reports the same issue.
    const quality = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/data-quality`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(quality.status).toBe(200);
    const codes = quality.body.data.positions.flatMap((row: { issues: Array<{ code: string }> }) =>
      row.issues.map((issue) => issue.code),
    );
    expect(codes).toContain('MISSING_PRICE');
  });

  it('is read-only: GET writes nothing and carries no secrets', async () => {
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const beforeQuotes = await prisma.marketQuoteRecord.count();
    const res = await request(app.getHttpServer())
      .get(maintenanceUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(before);
    expect(await prisma.marketQuoteRecord.count()).toBe(beforeQuotes);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/secret|token|BEGIN .*PRIVATE KEY/i);
  });
});
