import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset, createAssetId } from '@atlas/domain';
import { BrapiProviderAdapter, AssetType, MarketDataAssetRef } from '@atlas/market-data';

describe('Phase 5A-I1-R1: Authorization Boundaries & Token Security (Sections 15-21)', () => {
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
          name: 'Security Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function setupPortfolio(userId: string): Promise<{
    portfolioId: string;
    token: string;
    petr4AssetId: string;
  }> {
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Security Portfolio', baseCurrency: 'BRL', type: 'PERSONAL' })
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

    return { portfolioId, token, petr4AssetId: petr4.id };
  }

  it('Section 15: Owner authorization succeeds (200 OK)', async () => {
    const userId = randomUUID();
    const { portfolioId, token } = await setupPortfolio(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(200);

    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.portfolioId).toBe(portfolioId);
  });

  it('Section 16: Cross-user access returns 404 Not Found (strict anti-enumeration)', async () => {
    const ownerId = randomUUID();
    const attackerId = randomUUID();
    const { portfolioId } = await setupPortfolio(ownerId);

    await ensureUser(attackerId);
    const { token: attackerToken } = await createAuthenticatedUserSession(attackerId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ providerOverride: 'IN_MEMORY' })
      .expect(404);

    expect(res.body.error).toBe('Not Found');
    expect(res.status).toBe(404);
  });

  it('Section 17: Unsafe input rejection (invalid UUID, malformed parameters)', async () => {
    const userId = randomUUID();
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    // Malformed UUID param
    await request(app.getHttpServer())
      .post('/api/v1/portfolios/not-a-valid-uuid/market-data/update')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    // Non-existent UUID param
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${randomUUID()}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it('Section 18: Synthetic token MARKET_DATA_API_TOKEN is never exposed in responses or receipts', async () => {
    const userId = randomUUID();
    const { portfolioId, token } = await setupPortfolio(userId);

    const syntheticSecret = 'super-secret-market-token-phase5a-xyz123';
    process.env.MARKET_DATA_API_TOKEN = syntheticSecret;

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
        .set('Authorization', `Bearer ${token}`)
        .send({ providerOverride: 'IN_MEMORY' })
        .expect(200);

      const jsonString = JSON.stringify(res.body);
      expect(jsonString).not.toContain(syntheticSecret);
      expect(jsonString).not.toContain('super-secret');
    } finally {
      delete process.env.MARKET_DATA_API_TOKEN;
    }
  });

  it('Section 19: Missing token handling — adapter returns AUTHENTICATION_REQUIRED when token is missing on 401', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({ error: true, code: 'MISSING_TOKEN', message: 'Token required' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );

    const adapter = new BrapiProviderAdapter({
      token: undefined,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const assetRef: MarketDataAssetRef = {
      assetId: createAssetId('00000000-0000-4000-8000-000000000001'),
      ticker: 'HGLG11',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'FII' as AssetType,
    };

    const batch = await adapter.getQuotes([assetRef]);
    expect(batch.quotes.length).toBe(0);
    expect(batch.unavailable.length).toBe(1);
    expect(batch.unavailable[0]?.code).toBe('MARKET_DATA.AUTHENTICATION_REQUIRED');
    expect(batch.unavailable[0]?.retryable).toBe(false);
  });

  it('Section 20: 429 rate limit is mapped to MARKET_DATA.RATE_LIMITED with retryable=true', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ error: true, message: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });

    const adapter = new BrapiProviderAdapter({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const assetRef: MarketDataAssetRef = {
      assetId: createAssetId('00000000-0000-4000-8000-000000000002'),
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK' as AssetType,
    };

    const batch = await adapter.getQuotes([assetRef]);
    expect(batch.unavailable.length).toBe(1);
    expect(batch.unavailable[0]?.code).toBe('MARKET_DATA.RATE_LIMITED');
    expect(batch.unavailable[0]?.retryable).toBe(true);
  });

  it('Section 21: Provider error and timeout mappings', async () => {
    // 503 Provider unavailable
    const mock503 = async () => new Response('Gateway Timeout', { status: 503 });

    const adapter503 = new BrapiProviderAdapter({
      fetchFn: mock503 as unknown as typeof fetch,
    });

    const assetRef: MarketDataAssetRef = {
      assetId: createAssetId('00000000-0000-4000-8000-000000000002'),
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK' as AssetType,
    };

    const batch503 = await adapter503.getQuotes([assetRef]);
    expect(batch503.unavailable[0]?.code).toBe('MARKET_DATA.PROVIDER_UNAVAILABLE');
    expect(batch503.unavailable[0]?.retryable).toBe(true);

    // Timeout (AbortError)
    const mockTimeout = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const adapterTimeout = new BrapiProviderAdapter({
      fetchFn: mockTimeout as unknown as typeof fetch,
    });

    const batchTimeout = await adapterTimeout.getQuotes([assetRef]);
    expect(batchTimeout.unavailable[0]?.code).toBe('MARKET_DATA.TIMEOUT');
    expect(batchTimeout.unavailable[0]?.retryable).toBe(true);
  });
});
