import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

describe('API Integration: Monthly Tax State (GET /api/v1/fiscal/monthly/:competence)', () => {
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

  async function session(userId: string): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Fiscal Tester',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setupAccount(
    userId: string,
    currency = 'BRL',
  ): Promise<{ token: string; portfolioId: string; accountId: string }> {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Fiscal', baseCurrency: currency, type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora Fiscal', type: 'BANK', country: 'BR' })
      .expect(201);

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: institutionRes.body.data.id, name: 'Conta', currency })
      .expect(201);

    return { token, portfolioId, accountId: accountRes.body.data.id };
  }

  async function seedAsset(
    ticker: string,
    type: string,
    currency: string,
    exchange: string,
  ): Promise<string> {
    const asset = Asset.create({
      ticker,
      name: `${ticker} Asset`,
      type: type as never,
      currency,
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
    return asset.id;
  }

  async function postTransaction(
    token: string,
    portfolioId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
  }

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/monthly/2026-09').expect(401);
  });

  it.each(['2026-13', '2026-00', '2026', '09/2026', 'malformed'])(
    'rejects invalid competence %s with 400',
    async (competence) => {
      const token = await session('f1111111-1111-4111-8111-111111111111');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/monthly/${encodeURIComponent(competence)}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(res.body.code).toBe('FISCAL.INVALID_COMPETENCE');
    },
  );

  it('returns an EMPTY state for a competence without fiscal events', async () => {
    const token = await session('f2222222-2222-4222-8222-222222222222');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.competence).toBe('2026-09');
    expect(res.body.data.status).toBe('EMPTY');
    expect(res.body.data.eventCount).toBe(0);
  });

  it('projects a purchase into the monthly state without any tax liability', async () => {
    const userId = 'f3333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId } = await setupAccount(userId);
    const assetId = await seedAsset('PETR4', 'STOCK', 'BRL', 'B3');
    await postTransaction(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '25.00',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'buy-1',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.status).toBe('COMPLETE');
    expect(data.eventCount).toBe(1);
    expect(data.events[0].eventType).toBe('PURCHASE');
    expect(data.events[0].relevance).toBe('INFORMATIONAL');
    expect(data.events[0].taxAssetCategory).toBe('BRAZILIAN_EQUITY');
    // Foundation: no tax due is ever exposed.
    expect(data.capabilities.taxLiabilitySupported).toBe(false);
    expect(data).not.toHaveProperty('taxDue');
  });

  it('prevents future leakage across competences', async () => {
    const userId = 'f4444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId } = await setupAccount(userId);
    const assetId = await seedAsset('PETR4', 'STOCK', 'BRL', 'B3');
    await postTransaction(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '25.00',
      currency: 'BRL',
      tradeDate: '2026-10-05',
      provider: 'B3',
      externalId: 'buy-oct',
    });

    const sep = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(sep.body.data.status).toBe('EMPTY');

    const oct = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(oct.body.data.eventCount).toBe(1);
  });

  it('never treats transfers as sales/purchases', async () => {
    const userId = 'f5555555-5555-4555-8555-555555555555';
    const { token, portfolioId, accountId } = await setupAccount(userId);
    const assetId = await seedAsset('VALE3', 'STOCK', 'BRL', 'B3');
    await postTransaction(token, portfolioId, {
      accountId,
      assetId,
      type: 'TRANSFER_IN',
      quantity: '5',
      currency: 'BRL',
      tradeDate: '2026-09-11',
      provider: 'B3',
      externalId: 'tin-1',
    });
    await postTransaction(token, portfolioId, {
      accountId,
      type: 'DEPOSIT',
      amount: '1000.00',
      currency: 'BRL',
      tradeDate: '2026-09-01',
      provider: 'B3',
      externalId: 'dep-1',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const eventTypes = res.body.data.events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('TRANSFER_IN');
    expect(eventTypes).toContain('CASH_FLOW');
    expect(eventTypes).not.toContain('SALE');
    expect(eventTypes).not.toContain('PURCHASE');
    expect(res.body.data.categories[0].salesProceeds).toBeNull();
  });

  it('segregates currencies without implicit FX and flags unsupported currency', async () => {
    const userId = 'f6666666-6666-4666-8666-666666666666';
    const { token, portfolioId, accountId } = await setupAccount(userId, 'USD');
    const assetId = await seedAsset('AAPL', 'STOCK', 'USD', 'NASDAQ');
    await postTransaction(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '2',
      unitPrice: '50.00',
      currency: 'USD',
      tradeDate: '2026-09-10',
      provider: 'NYSE',
      externalId: 'usd-buy',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.currencies).toContain('USD');
    const usd = res.body.data.categories.find((c: { currency: string }) => c.currency === 'USD');
    expect(usd.qualityIssues).toContain('UNSUPPORTED_CURRENCY');
  });

  it('serializes monetary values as exact decimal strings (no raw Decimal)', async () => {
    const userId = 'f7777777-7777-4777-8777-777777777777';
    const { token, portfolioId, accountId } = await setupAccount(userId);
    const assetId = await seedAsset('PETR4', 'STOCK', 'BRL', 'B3');
    await postTransaction(token, portfolioId, {
      accountId,
      assetId,
      type: 'DIVIDEND',
      amount: '123.45',
      currency: 'BRL',
      tradeDate: '2026-09-15',
      provider: 'B3',
      externalId: 'div-1',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const incomeEvent = res.body.data.events.find(
      (e: { sourceTransactionType: string }) => e.sourceTransactionType === 'DIVIDEND',
    );
    expect(incomeEvent.amount).toEqual({ amount: '123.45', currency: 'BRL' });
    expect(JSON.stringify(res.body)).not.toContain('Decimal');
  });

  it('isolates tax subjects: user B never sees user A fiscal data', async () => {
    const userA = 'f8888888-8888-4888-8888-888888888888';
    const userB = 'f9999999-9999-4999-8999-999999999999';
    const { token: tokenA, portfolioId, accountId } = await setupAccount(userA);
    const assetId = await seedAsset('PETR4', 'STOCK', 'BRL', 'B3');
    await postTransaction(tokenA, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '25.00',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'a-buy',
    });

    const tokenB = await session(userB);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.data.status).toBe('EMPTY');
    expect(res.body.data.eventCount).toBe(0);
  });
});
