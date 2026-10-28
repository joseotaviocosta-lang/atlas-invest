import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';
import { Asset } from '@atlas/domain';

describe('API Integration: Market Intelligence & Watchlist (Phase 5T)', () => {
  let app: INestApplication;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let portfolioAId: string;
  let accountAId: string;
  const prisma = getTestPrismaClient();

  async function createCatalogAsset(
    ticker: string,
    currency = 'BRL',
    exchange = 'BVMF',
    type = 'EQUITY',
  ) {
    const asset = Asset.create({
      ticker,
      name: `${ticker} Test Asset`,
      type: type as never,
      currency: currency as never,
      exchange,
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

  async function insertQuote(
    assetId: string,
    price: string,
    currency = 'BRL',
    tradingDate = '2026-10-27',
  ) {
    return prisma.marketQuoteRecord.create({
      data: {
        id: randomUUID(),
        assetId,
        tradingDate: new Date(`${tradingDate}T00:00:00.000Z`),
        currency,
        close: price,
        provider: 'BRAPI',
        providerSymbol: 'TEST',
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await cleanDatabase();

    // User A from seedBaseFixtures
    const fixtures = await seedBaseFixtures();
    userAId = fixtures.userId;
    portfolioAId = fixtures.portfolioId;
    accountAId = fixtures.accountId;
    const sessionA = await createAuthenticatedUserSession(userAId);
    userAToken = sessionA.token;

    // User B
    userBId = randomUUID();
    await prisma.user.create({
      data: {
        id: userBId,
        email: 'userb_market@test.com',
        name: 'User B Market',
        passwordHash: 'dummyhash12345',
      },
    });
    const sessionB = await createAuthenticatedUserSession(userBId);
    userBToken = sessionB.token;
  });

  describe('GET /api/v1/watchlist', () => {
    it('returns empty list when user has no items in watchlist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns watched assets with quote and multi-currency segregation', async () => {
      const brlAsset = await createCatalogAsset('VALE3', 'BRL', 'BVMF');
      const usdAsset = await createCatalogAsset('AAPL', 'USD', 'NASDAQ');

      await insertQuote(brlAsset.id, '62.50', 'BRL');
      await insertQuote(usdAsset.id, '230.15', 'USD');

      await prisma.watchlistItem.createMany({
        data: [
          { id: randomUUID(), userId: userAId, assetId: brlAsset.id },
          { id: randomUUID(), userId: userAId, assetId: usdAsset.id },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);

      const vale = res.body.data.find((item: { ticker: string }) => item.ticker === 'VALE3');
      const aapl = res.body.data.find((item: { ticker: string }) => item.ticker === 'AAPL');

      expect(vale).toBeDefined();
      expect(vale.currency).toBe('BRL');
      expect(vale.quote).toBeDefined();
      expect(vale.quote.price).toBe('62.5');
      expect(vale.quote.currency).toBe('BRL');

      expect(aapl).toBeDefined();
      expect(aapl.currency).toBe('USD');
      expect(aapl.quote).toBeDefined();
      expect(aapl.quote.price).toBe('230.15');
      expect(aapl.quote.currency).toBe('USD');
    });
  });

  describe('POST /api/v1/watchlist', () => {
    it('adds an asset to the user watchlist', async () => {
      const asset = await createCatalogAsset('PETR4', 'BRL');

      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ assetId: asset.id });

      expect(res.status).toBe(201);
      expect(res.body.data.assetId).toBe(asset.id);
      expect(res.body.data.ticker).toBe('PETR4');
      expect(res.body.data.currency).toBe('BRL');

      // Verify in database
      const row = await prisma.watchlistItem.findUnique({
        where: {
          userId_assetId: {
            userId: userAId,
            assetId: asset.id,
          },
        },
      });
      expect(row).not.toBeNull();
    });

    it('is idempotent when adding the same asset multiple times', async () => {
      const asset = await createCatalogAsset('ITUB4', 'BRL');

      const first = await request(app.getHttpServer())
        .post('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ assetId: asset.id });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ assetId: asset.id });
      expect(second.status).toBe(201);
      expect(second.body.data.assetId).toBe(asset.id);

      const count = await prisma.watchlistItem.count({
        where: { userId: userAId, assetId: asset.id },
      });
      expect(count).toBe(1);
    });

    it('returns 404 when assetId does not exist in catalog', async () => {
      const missingId = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ assetId: missingId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMMON.NOT_FOUND');
    });

    it('returns 400 when assetId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlist')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ assetId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/watchlist/:assetId', () => {
    it('removes asset from watchlist', async () => {
      const asset = await createCatalogAsset('WEGE3', 'BRL');
      await prisma.watchlistItem.create({
        data: { id: randomUUID(), userId: userAId, assetId: asset.id },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/watchlist/${asset.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);

      const row = await prisma.watchlistItem.findUnique({
        where: { userId_assetId: { userId: userAId, assetId: asset.id } },
      });
      expect(row).toBeNull();
    });

    it('returns 404 when removing an asset not on user watchlist', async () => {
      const asset = await createCatalogAsset('RENT3', 'BRL');

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/watchlist/${asset.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });

    it('enforces strict cross-user isolation: User B cannot unwatch User A asset', async () => {
      const asset = await createCatalogAsset('BBAS3', 'BRL');
      await prisma.watchlistItem.create({
        data: { id: randomUUID(), userId: userAId, assetId: asset.id },
      });

      // User B tries to delete asset from their watchlist (which they do not have)
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/watchlist/${asset.id}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(404);

      // Verify User A item is intact
      const stillThere = await prisma.watchlistItem.findUnique({
        where: { userId_assetId: { userId: userAId, assetId: asset.id } },
      });
      expect(stillThere).not.toBeNull();
    });
  });

  describe('GET /api/v1/market/assets/:assetId', () => {
    it('returns market asset detail with quote, watch status, and holding status', async () => {
      const asset = await createCatalogAsset('B3SA3', 'BRL');
      await insertQuote(asset.id, '12.80', 'BRL');

      // User A watches the asset
      await prisma.watchlistItem.create({
        data: { id: randomUUID(), userId: userAId, assetId: asset.id },
      });

      // User A holds the asset in portfolioAId
      await prisma.transaction.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioAId,
          accountId: accountAId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '11.50',
          amount: '1150.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/market/assets/${asset.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(asset.id);
      expect(res.body.data.ticker).toBe('B3SA3');
      expect(res.body.data.isWatched).toBe(true);
      expect(res.body.data.isHeld).toBe(true);
      expect(res.body.data.heldInPortfolios).toHaveLength(1);
      expect(res.body.data.heldInPortfolios[0].name).toBe('Test Portfolio');

      // Check limitations disclosures
      expect(res.body.data.fundamentals.status).toBe('UNAVAILABLE');
      expect(res.body.data.fundamentals.providerStatus).toBe('MARKET_DATA_PROVIDER_GAP');
      expect(res.body.data.news.status).toBe('UNAVAILABLE');
      expect(res.body.data.news.providerStatus).toBe('MARKET_DATA_PROVIDER_GAP');
    });

    it('returns 404 for nonexistent asset ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/market/assets/${randomUUID()}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMMON.NOT_FOUND');
    });
  });
});
