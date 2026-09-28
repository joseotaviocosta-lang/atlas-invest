import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

describe('API Integration: Tax input readiness (GET /api/v1/fiscal/inputs/:competence)', () => {
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
          name: 'Tax Input Tester',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setup(userId: string, assetType: string) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira 4B.2', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora 4B.2', type: 'BANK', country: 'BR' })
      .expect(201);
    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: institutionRes.body.data.id, name: 'Conta', currency: 'BRL' })
      .expect(201);
    const asset = Asset.create({
      ticker: assetType === 'FII' ? 'MXRF11' : 'PETR4',
      name: 'Asset',
      type: assetType as never,
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

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/inputs/2026-09').expect(401);
  });

  it('rejects invalid competence (400)', async () => {
    const token = await session('bb111111-1111-4111-8111-111111111111');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-13')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.code).toBe('FISCAL.INVALID_COMPETENCE');
  });

  it('reports NOT_REQUIRED for a competence with no taxable events', async () => {
    const token = await session('bb222222-2222-4222-8222-222222222222');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.tradeClassificationStatus).toBe('NOT_REQUIRED');
    expect(res.body.data.withholdingStatus).toBe('NOT_REQUIRED');
    expect(res.body.data.productionTaxLiabilityEnabled).toBe(false);
  });

  it('surfaces missing canonical inputs for a taxable sale (no estimation)', async () => {
    const userId = 'bb333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId, assetId } = await setup(userId, 'STOCK');
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: '10',
        unitPrice: '20',
        currency: 'BRL',
        tradeDate: '2026-08-10',
        provider: 'B3',
        externalId: 'b1',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'SELL',
        quantity: '10',
        unitPrice: '30',
        currency: 'BRL',
        tradeDate: '2026-09-10',
        provider: 'B3',
        externalId: 's1',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.classificationCoverage.required).toBe(1);
    expect(data.classificationCoverage.classified).toBe(0);
    expect(data.issues).toContain('UNKNOWN_TRADE_CLASSIFICATION');
    expect(data.issues).toContain('MISSING_WITHHOLDING_INPUT');
    expect(data.tradeClassificationStatus).not.toBe('COMPLETE');
    expect(data.productionTaxLiabilityEnabled).toBe(false);
    // Rows are present for the UI.
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual([
      'tradeClassification',
      'withholding',
      'fiiMetadata',
    ]);
  });

  it('flags missing FII condition metadata for FII activity', async () => {
    const userId = 'bb444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId, assetId } = await setup(userId, 'FII');
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: '10',
        unitPrice: '10',
        currency: 'BRL',
        tradeDate: '2026-08-10',
        provider: 'B3',
        externalId: 'f1',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'SELL',
        quantity: '10',
        unitPrice: '12',
        currency: 'BRL',
        tradeDate: '2026-09-10',
        provider: 'B3',
        externalId: 'f2',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.issues).toContain('MISSING_FII_ELIGIBILITY_METADATA');
    expect(res.body.data.fiiMetadataStatus).not.toBe('COMPLETE');
  });

  it('isolates tax subjects', async () => {
    const userA = 'bb555555-5555-4555-8555-555555555555';
    const userB = 'bb666666-6666-4666-8666-666666666666';
    const { token: tokenA, portfolioId, accountId, assetId } = await setup(userA, 'STOCK');
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        accountId,
        assetId,
        type: 'SELL',
        quantity: '10',
        unitPrice: '30',
        currency: 'BRL',
        tradeDate: '2026-09-10',
        provider: 'B3',
        externalId: 'a',
      })
      .expect(201);
    const tokenB = await session(userB);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.data.tradeClassificationStatus).toBe('NOT_REQUIRED');
  });
});
