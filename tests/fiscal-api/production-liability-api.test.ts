import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

describe('API Integration: real production liability — FII_SALE (Phase 4B.5)', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    app = await createTestApp();
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
          name: 'T',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setupFii(userId: string) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'FII', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
    const inst = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora', type: 'BANK', country: 'BR' })
      .expect(201);
    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: inst.body.data.id, name: 'Conta', currency: 'BRL' })
      .expect(201);
    const asset = Asset.create({
      ticker: 'MXRF11',
      name: 'FII',
      type: 'FII',
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

  async function postTx(token: string, portfolioId: string, body: Record<string, unknown>) {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
  }

  it('returns a real COMPLETE liability (non-null taxDue) using the VERIFIED production rule', async () => {
    const userId = 'ff111111-1111-4111-8111-111111111111';
    const { token, portfolioId, accountId, assetId } = await setupFii(userId);
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      currency: 'BRL',
      tradeDate: '2026-07-01',
      provider: 'B3',
      externalId: 'b1',
    });
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '100',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 's1',
    });
    // Canonical IRRF input (0,005% of R$ 2.000 = R$ 0,10).
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-08',
        economicDate: '2026-08-10',
        category: 'FII',
        amount: '0.1',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'irrf-1',
      })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('COMPLETE');
    const fii = data.categories.find((c: { category: string }) => c.category === 'FII');
    expect(fii.ruleSetStatus).toBe('VERIFIED');
    expect(fii.ruleVersion).toBe('1.0.0');
    expect(fii.taxDue).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(data.taxDue).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(data.capabilities.productionRuleVerified).toBe(true);
    // Trace exposes the production rule version (auditability).
    expect(JSON.stringify(data.traceSummary)).toContain('1.0.0');
  });

  it('fails closed (PARTIAL, null taxDue) without the canonical IRRF input', async () => {
    const userId = 'ff222222-2222-4222-8222-222222222222';
    const { token, portfolioId, accountId, assetId } = await setupFii(userId);
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      currency: 'BRL',
      tradeDate: '2026-07-01',
      provider: 'B3',
      externalId: 'b1',
    });
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '100',
      unitPrice: '20',
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 's1',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('PARTIAL');
    expect(res.body.data.taxDue).toBeNull();
    expect(res.body.data.dataQuality.issues).toContain('MISSING_REQUIRED_WITHHOLDING');
  });

  it('reports rule coverage as available for the activated bucket', async () => {
    const userId = 'ff333333-3333-4333-8333-333333333333';
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-08')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.ruleCoverage).toBe('AVAILABLE');
    expect(res.body.data.productionVerifiedRuleCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.productionTaxLiabilityEnabled).toBe(true);
  });
});
