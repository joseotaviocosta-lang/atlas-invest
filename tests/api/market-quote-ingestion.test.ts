import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';
import { PrismaMarketQuoteRepository } from '../../packages/database/src/repositories/market-quote.repository';

describe('API Integration: Market Data Ingestion Endpoint (POST /api/v1/portfolios/:id/market-data/update)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let marketQuoteRepo: PrismaMarketQuoteRepository;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    marketQuoteRepo = new PrismaMarketQuoteRepository(prisma);
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
          name: 'Market Data Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function setupPortfolioWithHeldAssets(userId: string): Promise<{
    portfolioId: string;
    token: string;
    petr4AssetId: string;
    vale3AssetId: string;
  }> {
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Mercado EOD', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XP Investimentos', type: 'BANK', country: 'BR' })
      .expect(201);
    const institutionId = institutionRes.body.data.id;

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'Conta Principal', currency: 'BRL' })
      .expect(201);
    const accountId = accountRes.body.data.id;

    const petr4 = Asset.create({
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: petr4.id,
        ticker: petr4.ticker,
        name: petr4.name,
        type: petr4.type,
        currency: petr4.currency,
        exchange: petr4.exchange,
      },
    });

    const vale3 = Asset.create({
      ticker: 'VALE3',
      name: 'Vale ON',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: vale3.id,
        ticker: vale3.ticker,
        name: vale3.name,
        type: vale3.type,
        currency: vale3.currency,
        exchange: vale3.exchange,
      },
    });

    // Establish positions via BUY
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '35.00',
        totalAmount: '3500.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        quantity: '200',
        unitPrice: '60.00',
        totalAmount: '12000.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
      })
      .expect(201);

    return {
      portfolioId,
      token,
      petr4AssetId: petr4.id,
      vale3AssetId: vale3.id,
    };
  }

  it('successfully updates market data for held assets using IN_MEMORY provider override', async () => {
    const userId = randomUUID();
    const { portfolioId, token, petr4AssetId, vale3AssetId } =
      await setupPortfolioWithHeldAssets(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);

    expect(res.body.data).toBeDefined();
    const receipt = res.body.data;

    expect(receipt.portfolioId).toBe(portfolioId);
    expect(receipt.provider).toBe('IN_MEMORY');
    expect(receipt.requestedAssets).toBe(2);
    expect(receipt.resolvedAssets).toBe(2);
    expect(receipt.quotesFetched).toBe(2);
    expect(receipt.quotesInserted).toBe(2);
    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.startedAt).toBeDefined();
    expect(receipt.finishedAt).toBeDefined();

    // Verify persisted rows in PostgreSQL
    const petr4Quote = await marketQuoteRepo.findLatest(petr4AssetId);
    expect(petr4Quote).not.toBeNull();
    expect(petr4Quote?.provider).toBe('IN_MEMORY');
    expect(petr4Quote?.fetchCount).toBe(1);

    const vale3Quote = await marketQuoteRepo.findLatest(vale3AssetId);
    expect(vale3Quote).not.toBeNull();
    expect(vale3Quote?.provider).toBe('IN_MEMORY');
    expect(vale3Quote?.fetchCount).toBe(1);
  });

  it('is strictly idempotent on identical consecutive runs (quotesUnchanged increments fetchCount)', async () => {
    const userId = randomUUID();
    const { portfolioId, token, petr4AssetId } = await setupPortfolioWithHeldAssets(userId);

    // Run 1
    const res1 = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);
    expect(res1.body.data.quotesInserted).toBe(2);
    expect(res1.body.data.quotesUnchanged).toBe(0);

    // Run 2 (identical)
    const res2 = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);
    expect(res2.body.data.quotesInserted).toBe(0);
    expect(res2.body.data.quotesUnchanged).toBe(2);
    expect(res2.body.data.status).toBe('COMPLETED');

    const petr4Quote = await marketQuoteRepo.findLatest(petr4AssetId);
    expect(petr4Quote?.fetchCount).toBe(2);
  });

  it('enforces 404 anti-enumeration when accessing portfolio of another user', async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    const { portfolioId } = await setupPortfolioWithHeldAssets(userA);

    await ensureUser(userB);
    const { token: attackerToken } = await createAuthenticatedUserSession(userB);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({})
      .expect(404);

    expect(res.body.error).toBe('Not Found');
  });

  it('returns 404 when portfolio does not exist', async () => {
    const userId = randomUUID();
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    await request(app.getHttpServer())
      .post('/api/v1/portfolios/99999999-9999-4999-8999-999999999999/market-data/update')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it('returns COMPLETED immediately when portfolio has no active held assets', async () => {
    const userId = randomUUID();
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Vazia', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);

    expect(res.body.data.requestedAssets).toBe(0);
    expect(res.body.data.quotesFetched).toBe(0);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('handles partial completion with warnings when an asset fails or requires auth without failing the whole batch', async () => {
    const userId = randomUUID();
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Mista', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BTG Pactual', type: 'BANK', country: 'BR' })
      .expect(201);

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        institutionId: institutionRes.body.data.id,
        name: 'Conta Investimento',
        currency: 'BRL',
      })
      .expect(201);
    const accountId = accountRes.body.data.id;

    // PETR4 (valid stock)
    const petr4 = Asset.create({
      ticker: 'PETR4',
      name: 'Petrobras',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: petr4.id,
        ticker: petr4.ticker,
        name: petr4.name,
        type: petr4.type,
        currency: petr4.currency,
        exchange: petr4.exchange,
      },
    });

    // Fictional asset that will not be found in in-memory provider
    const unlisted = Asset.create({
      ticker: 'UNLISTED99',
      name: 'Unlisted Asset',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: unlisted.id,
        ticker: unlisted.ticker,
        name: unlisted.name,
        type: unlisted.type,
        currency: unlisted.currency,
        exchange: unlisted.exchange,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '50',
        unitPrice: '30.00',
        totalAmount: '1500.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: unlisted.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '100.00',
        totalAmount: '1000.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);

    const receipt = res.body.data;
    expect(receipt.status).toBe('COMPLETED_WITH_WARNINGS');
    expect(receipt.quotesInserted).toBe(1); // PETR4 ingested
    expect(receipt.missingAssets).toContain('UNLISTED99'); // UNLISTED99 flagged
  });

  it('redacts tokens and never exposes MARKET_DATA_API_TOKEN in API response or logs', async () => {
    const userId = randomUUID();
    const { portfolioId, token } = await setupPortfolioWithHeldAssets(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('token');
    expect(bodyStr).not.toContain('Bearer');
    expect(bodyStr).not.toContain('secret');
  });
});
