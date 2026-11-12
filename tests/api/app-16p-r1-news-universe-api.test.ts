import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: APP-16P-R1 News Universe Independence (PostgreSQL atlas_test)', () => {
  let app: INestApplication;
  let userToken: string;
  let otherUserToken: string;
  let portfolioId: string;
  let accountId: string;
  let assetIds: string[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

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

    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;

    const prisma = getTestPrismaClient();

    // Seed a second user for 404 anti-enumeration verification
    const otherUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: otherUserId,
        email: 'other-r1@atlas.dev',
        name: 'Other User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUserId);
    otherUserToken = otherAuth.token;

    // Seed second account inside the same portfolio for multi-account dedupe check
    const secondAccountId = randomUUID();
    await prisma.account.create({
      data: {
        id: secondAccountId,
        portfolioId,
        institutionId: fixtures.institutionId,
        name: 'Conta Secundária',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    // Seed 36 real-shaped active holdings (24 stocks + 12 FIIs) + 1 fully sold closed stock
    const createdAssetIds: string[] = [];
    for (let i = 1; i <= 24; i++) {
      const id = randomUUID();
      createdAssetIds.push(id);
      await prisma.asset.create({
        data: {
          id,
          ticker: `ATST${String(i).padStart(2, '0')}4`,
          name: `Empresa Teste ${i}`,
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'B3',
        },
      });
    }
    for (let i = 1; i <= 12; i++) {
      const id = randomUUID();
      createdAssetIds.push(id);
      await prisma.asset.create({
        data: {
          id,
          ticker: `AFII${String(i).padStart(2, '0')}11`,
          name: `Fundo Imob Teste ${i}`,
          type: 'FII',
          currency: 'BRL',
          exchange: 'B3',
        },
      });
    }

    const closedAssetId = randomUUID();
    await prisma.asset.create({
      data: {
        id: closedAssetId,
        ticker: 'CLSD3',
        name: 'Posição Encerrada',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    assetIds = createdAssetIds;

    // Seed ledger BUY transactions for all 36 active assets (+ duplicate BUY in second account for asset 0)
    await prisma.transaction.createMany({
      data: [
        ...createdAssetIds.map((assetId) => ({
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '50',
          amount: '500',
          currency: 'BRL',
          source: 'MANUAL',
        })),
        {
          id: randomUUID(),
          portfolioId,
          accountId: secondAccountId,
          assetId: createdAssetIds[0]!,
          type: 'BUY',
          tradeDate: new Date('2026-10-02T00:00:00.000Z'),
          quantity: '5',
          unitPrice: '51',
          amount: '255',
          currency: 'BRL',
          source: 'MANUAL',
        },
        // Closed position: BUY 10, SELL 10 -> zero economic balance
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: closedAssetId,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '20',
          amount: '200',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: randomUUID(),
          portfolioId,
          accountId,
          assetId: closedAssetId,
          type: 'SELL',
          tradeDate: new Date('2026-10-05T00:00:00.000Z'),
          quantity: '10',
          unitPrice: '22',
          amount: '220',
          currency: 'BRL',
          source: 'MANUAL',
        },
      ],
    });

    // Stub external network HTTP calls deterministically while executing real DB + UseCase + Pipeline
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      });
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('audits all 36 holdings when ALL quotes are stale, when NO quotes exist, and when quotes are mixed (VALUED + QUOTE_STALE), while isolating empty portfolios and 404 ownership', async () => {
    const prisma = getTestPrismaClient();
    const server = app.getHttpServer();

    // 1. Seed 36 STALE quotes (tradingDate far in past -> QUOTE_STALE in valuation)
    await prisma.marketQuoteRecord.createMany({
      data: assetIds.map((assetId, idx) => ({
        id: randomUUID(),
        assetId,
        tradingDate: new Date('2026-01-15T00:00:00.000Z'),
        currency: 'BRL',
        close: '50.00',
        provider: 'BRAPI',
        providerSymbol: idx < 24 ? `ATST${String(idx + 1).padStart(2, '0')}4` : `AFII${String(idx - 23).padStart(2, '0')}11`,
        firstFetchedAt: new Date('2026-01-15T18:00:00.000Z'),
        lastFetchedAt: new Date('2026-01-15T18:00:00.000Z'),
      })),
    });

    const staleRes = await request(server)
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/refresh`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(200);

    expect(staleRes.body.data.metrics.totalAuditedAssets).toBe(36);
    expect(Object.keys(staleRes.body.data.assetDailyStatus)).toHaveLength(36);
    expect(staleRes.body.data.assetDailyStatus.AFII0111).toBeDefined();
    expect(staleRes.body.data.assetDailyStatus.CLSD3).toBeUndefined();

    // 2. Delete ALL quotes (NO QUOTES scenario) -> still audits 36 holdings
    await prisma.marketQuoteRecord.deleteMany({});
    const noQuotesRes = await request(server)
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/refresh`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(200);

    expect(noQuotesRes.body.data.metrics.totalAuditedAssets).toBe(36);

    // 3. Mixed quotes: 20 recent + 16 stale -> still audits 36 holdings
    const today = new Date();
    const freshDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    await prisma.marketQuoteRecord.createMany({
      data: assetIds.map((assetId, idx) => ({
        id: randomUUID(),
        assetId,
        tradingDate: idx < 20 ? freshDate : new Date('2026-01-15T00:00:00.000Z'),
        currency: 'BRL',
        close: '52.00',
        provider: 'BRAPI',
        providerSymbol: idx < 24 ? `ATST${String(idx + 1).padStart(2, '0')}4` : `AFII${String(idx - 23).padStart(2, '0')}11`,
        firstFetchedAt: idx < 20 ? freshDate : new Date('2026-01-15T18:00:00.000Z'),
        lastFetchedAt: idx < 20 ? freshDate : new Date('2026-01-15T18:00:00.000Z'),
      })),
    });

    const mixedRes = await request(server)
      .get(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news?refresh=true`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(mixedRes.body.data.metrics.totalAuditedAssets).toBe(36);

    // 4. Empty portfolio -> totalAuditedAssets = 0, providersUsed = []
    const emptyPortfolioId = randomUUID();
    await prisma.portfolio.create({
      data: {
        id: emptyPortfolioId,
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Carteira Vazia',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    const emptyRes = await request(server)
      .post(`/api/v1/portfolios/${emptyPortfolioId}/opportunity-radar/news/refresh`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(200);

    expect(emptyRes.body.data.metrics.totalAuditedAssets).toBe(0);
    expect(emptyRes.body.data.metrics.providerStatus.providersUsed).toEqual([]);

    // 5. Cross-user ownership boundary -> strictly 404 Not Found
    await request(server)
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/refresh`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({})
      .expect(404);
  });
});
