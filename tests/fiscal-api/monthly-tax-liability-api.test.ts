import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LocalDate, Asset } from '@atlas/domain';
import type { TaxRuleSet } from '@atlas/tax-engine';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { TAX_RULE_REGISTRY } from '../../apps/api/src/application/fiscal/tokens';
import {
  createAuthenticatedUserSession,
  getTestPrismaClient,
  cleanDatabase,
  disconnectTestDatabase,
} from '../api/setup';

const VERIFIED_EQUITY: TaxRuleSet = {
  id: 'TEST-VERIFIED-EQUITY',
  jurisdiction: 'BR',
  version: 'verified-1',
  effectiveFrom: LocalDate.from('2020-01-01'),
  status: 'VERIFIED',
  taxCategory: 'BRAZILIAN_EQUITY',
  components: { ratePercentage: '15' },
  source: {
    legalSourceId: 'SYNTHETIC_TEST',
    legalSourceReference: 'api fixture',
    verifiedAt: '2026-01-01',
  },
};

const TEST_ONLY_EQUITY: TaxRuleSet = {
  ...VERIFIED_EQUITY,
  id: 'TEST-ONLY-EQUITY',
  version: 'test-1',
  status: 'TEST_ONLY',
};

async function buildApp(registry: readonly TaxRuleSet[]): Promise<INestApplication> {
  const prisma = getTestPrismaClient();
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(TAX_RULE_REGISTRY)
    .useValue(registry)
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API Integration: Monthly Tax Liability (GET /api/v1/fiscal/monthly/:competence/liability)', () => {
  let prodApp: INestApplication;
  let verifiedApp: INestApplication;
  let testOnlyApp: INestApplication;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    prodApp = await buildApp([]);
    verifiedApp = await buildApp([VERIFIED_EQUITY]);
    testOnlyApp = await buildApp([TEST_ONLY_EQUITY]);
  });

  afterAll(async () => {
    await prodApp.close();
    await verifiedApp.close();
    await testOnlyApp.close();
    await disconnectTestDatabase();
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
          name: 'Fiscal Liability Tester',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setup(app: INestApplication, userId: string) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Fiscal 4B', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora 4B', type: 'BANK', country: 'BR' })
      .expect(201);
    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: institutionRes.body.data.id, name: 'Conta', currency: 'BRL' })
      .expect(201);
    const asset = Asset.create({
      ticker: 'PETR4',
      name: 'Petro',
      type: 'STOCK',
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
    return { token, portfolioId, accountId: accountRes.body.data.id, assetId: asset.id };
  }

  async function postTx(
    app: INestApplication,
    token: string,
    portfolioId: string,
    body: Record<string, unknown>,
  ) {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
  }

  it('requires authentication (401)', async () => {
    await request(prodApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .expect(401);
  });

  it('rejects invalid competence with 400', async () => {
    const token = await session('aa111111-1111-4111-8111-111111111111');
    const res = await request(prodApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-13/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('FISCAL.INVALID_COMPETENCE');
  });

  it('returns NO_ACTIVITY with zero tax due for a month with no taxable events', async () => {
    const userId = 'aa222222-2222-4222-8222-222222222222';
    const { token, portfolioId, accountId, assetId } = await setup(verifiedApp, userId);
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-09-05',
      provider: 'B3',
      externalId: 'buy-1',
    });
    const res = await request(verifiedApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expect(res.body.data.taxDue).toEqual({ amount: '0', currency: 'BRL' });
    expect(res.body.data.categories).toHaveLength(0);
  });

  it('computes a COMPLETE taxable liability when a VERIFIED rule is effective', async () => {
    const userId = 'aa333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId, assetId } = await setup(verifiedApp, userId);
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 'buy-2',
    });
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'sell-2',
    });
    const res = await request(verifiedApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('COMPLETE');
    const equity = data.categories.find(
      (c: { category: string }) => c.category === 'BRAZILIAN_EQUITY',
    );
    expect(equity.realizedResult).toEqual({ amount: '100', currency: 'BRL' });
    expect(equity.taxBeforeWithholding).toEqual({ amount: '15', currency: 'BRL' });
    expect(data.taxDue).toEqual({ amount: '15', currency: 'BRL' });
    expect(data.capabilities.productionRuleVerified).toBe(true);
    expect(data.traceSummary.length).toBeGreaterThan(0);
    // Decimal strings only; no raw Decimal/float.
    expect(JSON.stringify(data)).not.toMatch(/Decimal|NaN/);
  });

  it('fails closed (BLOCKED, taxDue null) with the empty production registry', async () => {
    const userId = 'aa444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId, assetId } = await setup(prodApp, userId);
    await postTx(prodApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 'buy-3',
    });
    await postTx(prodApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'sell-3',
    });
    const res = await request(prodApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.taxDue).toBeNull();
    expect(res.body.data.dataQuality.issues).toContain('MISSING_RULE_SET');
  });

  it('never produces production tax due from a TEST_ONLY rule', async () => {
    const userId = 'aa555555-5555-4555-8555-555555555555';
    const { token, portfolioId, accountId, assetId } = await setup(testOnlyApp, userId);
    await postTx(testOnlyApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 'buy-4',
    });
    await postTx(testOnlyApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'sell-4',
    });
    const res = await request(testOnlyApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.taxDue).toBeNull();
    expect(res.body.data.dataQuality.issues).toContain('UNVERIFIED_RULE_SET');
  });

  it('carries a prior-month loss into a later gain (no cross-month leakage of events)', async () => {
    const userId = 'aa666666-6666-4666-8666-666666666666';
    const { token, portfolioId, accountId, assetId } = await setup(verifiedApp, userId);
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-07-01',
      provider: 'B3',
      externalId: 'b1',
    });
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 's1',
    });
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-20',
      provider: 'B3',
      externalId: 'b2',
    });
    await postTx(verifiedApp, token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 's2',
    });
    const res = await request(verifiedApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const equity = res.body.data.categories.find(
      (c: { category: string }) => c.category === 'BRAZILIAN_EQUITY',
    );
    expect(equity.openingLossBalance).toEqual({ amount: '100', currency: 'BRL' });
    expect(equity.lossApplied).toEqual({ amount: '100', currency: 'BRL' });
    expect(equity.taxDue).toEqual({ amount: '0', currency: 'BRL' });
  });

  it('isolates tax subjects: user B never sees user A liability', async () => {
    const userA = 'aa777777-7777-4777-8777-777777777777';
    const userB = 'aa888888-8888-4888-8888-888888888888';
    const { token: tokenA, portfolioId, accountId, assetId } = await setup(verifiedApp, userA);
    await postTx(verifiedApp, tokenA, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '10',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 'a-buy',
    });
    await postTx(verifiedApp, tokenA, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '10',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-09-10',
      provider: 'B3',
      externalId: 'a-sell',
    });
    const tokenB = await session(userB);
    const res = await request(verifiedApp.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/liability')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expect(res.body.data.categories).toHaveLength(0);
  });
});
