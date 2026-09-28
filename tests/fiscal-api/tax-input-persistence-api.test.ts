import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

describe('API Integration: canonical tax input persistence (Phase 4B.3)', () => {
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

  async function setup(userId: string, assetType = 'STOCK') {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira 4B.3', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora', type: 'BANK', country: 'BR' })
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
    const buyRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: accountRes.body.data.id,
        assetId: asset.id,
        type: 'BUY',
        quantity: '10',
        unitPrice: '20',
        currency: 'BRL',
        tradeDate: '2026-09-05',
        provider: 'B3',
        externalId: `b-${asset.id}`,
      })
      .expect(201);
    return {
      token,
      portfolioId,
      accountId: accountRes.body.data.id,
      assetId: asset.id,
      transactionId: buyRes.body.data.id,
    };
  }

  it('requires authentication (401) for writes and reads', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/trade-classifications')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .send({})
      .expect(401);
  });

  it('persists a manual trade classification, is idempotent and never infers', async () => {
    const { token, transactionId } = await setup('cc111111-1111-4111-8111-111111111111');
    const body = {
      transactionId,
      classification: 'DAY_TRADE',
      sourceType: 'MANUAL_CONFIRMED',
      sourceReference: 'manual-1',
      effectiveDate: '2026-09-05',
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(first.body.data.outcome).toBe('CREATED');

    const second = await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(second.body.data.outcome).toBe('DUPLICATE');

    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].classification).toBe('DAY_TRADE');
  });

  it('keeps UNKNOWN first-class (never normalized to NORMAL)', async () => {
    const { token, transactionId } = await setup('cc222222-2222-4222-8222-222222222222');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId,
        classification: 'UNKNOWN',
        sourceType: 'CANONICAL_LEDGER',
        sourceReference: 'unknown-1',
        effectiveDate: '2026-09-05',
      })
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data[0].classification).toBe('UNKNOWN');
    expect(list.body.data[0].status).toBe('UNKNOWN');
  });

  it('rejects a transaction not owned by the subject (404, anti-enumeration)', async () => {
    const a = await setup('cc333333-3333-4333-8333-333333333333');
    const tokenB = await session('cc444444-4444-4444-8444-444444444444');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        transactionId: a.transactionId,
        classification: 'NORMAL',
        sourceType: 'MANUAL_CONFIRMED',
        sourceReference: 'x',
        effectiveDate: '2026-09-05',
      })
      .expect(404);
  });

  it('persists exact-decimal withholding and reflects it in readiness', async () => {
    const userId = 'cc555555-5555-4555-8555-555555555555';
    const { token, portfolioId, accountId, assetId } = await setup(userId);
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
        externalId: 's-1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'BRAZILIAN_EQUITY',
        amount: '123.456789012345678901',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'wh-1',
      })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/withholdings?competence=2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data[0].amount).toBe('123.456789012345678901');

    const readiness = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(readiness.body.data.withholdingStatus).toBe('COMPLETE');
    expect(readiness.body.data.productionTaxLiabilityEnabled).toBe(false);
  });

  it('rejects UNKNOWN withholding that carries an amount', async () => {
    const token = await session('cc666666-6666-4666-8666-666666666666');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'BRAZILIAN_EQUITY',
        amount: '10',
        currency: 'BRL',
        status: 'UNKNOWN',
        sourceType: 'MANUAL',
        sourceReference: 'wh-u',
      })
      .expect(400);
  });

  it('persists FII metadata and enforces as-of (no future leakage)', async () => {
    const userId = 'cc777777-7777-4777-8777-777777777777';
    const { token, assetId } = await setup(userId, 'FII');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/fii-metadata')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        asOfDate: '2026-01-01',
        holderCount: 500,
        investorOwnershipPercent: '3.999999999999999999',
        isExchangeTraded: true,
        sourceType: 'OFFICIAL_FUND_DATA',
        sourceReference: 'fund-1',
        status: 'KNOWN',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/fii-metadata')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        asOfDate: '2026-06-01',
        holderCount: 900,
        investorOwnershipPercent: '1.5',
        isExchangeTraded: true,
        sourceType: 'OFFICIAL_FUND_DATA',
        sourceReference: 'fund-1',
        status: 'KNOWN',
      })
      .expect(200);

    const asOfMarch = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/inputs/fii-metadata?assetId=${assetId}&asOf=2026-03-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(asOfMarch.body.data).toHaveLength(1);
    expect(asOfMarch.body.data[0].asOfDate).toBe('2026-01-01');
    expect(asOfMarch.body.data[0].holderCount).toBe(500);
    expect(asOfMarch.body.data[0].investorOwnershipPercent).toBe('3.999999999999999999');
  });

  it('blocks a conflicting same-identity input (409) without silent overwrite', async () => {
    const { token, transactionId } = await setup('cc888888-8888-4888-8888-888888888888');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId,
        classification: 'DAY_TRADE',
        sourceType: 'BROKER_IMPORT',
        sourceReference: 'note-1',
        effectiveDate: '2026-09-05',
      })
      .expect(200);
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId,
        classification: 'NORMAL',
        sourceType: 'BROKER_IMPORT',
        sourceReference: 'note-1',
        effectiveDate: '2026-09-05',
      })
      .expect(409);
    expect(conflict.body.code).toBe('TAX_INPUT.CONFLICT');

    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Original value preserved, flagged as conflicted.
    expect(list.body.data[0].classification).toBe('DAY_TRADE');
    expect(list.body.data[0].conflictStatus).toBe('CONFLICT');
  });

  it('downgrades readiness when an input is conflicted', async () => {
    const userId = 'ccbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { token, portfolioId, accountId, assetId } = await setup(userId);
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
        externalId: 's-conf',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'BRAZILIAN_EQUITY',
        amount: '10',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'w-conf',
      })
      .expect(200);
    const before = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.data.withholdingStatus).toBe('COMPLETE');

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'BRAZILIAN_EQUITY',
        amount: '99',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'w-conf',
      })
      .expect(409);

    const after = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.withholdingStatus).toBe('PARTIAL');
  });

  it('isolates tax subjects on reads', async () => {
    const a = await setup('cc999999-9999-4999-8999-999999999999');
    const tokenB = await session('ccaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        transactionId: a.transactionId,
        classification: 'NORMAL',
        sourceType: 'MANUAL_CONFIRMED',
        sourceReference: 'm-1',
        effectiveDate: '2026-09-05',
      })
      .expect(200);
    const listB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/trade-classifications')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body.data).toHaveLength(0);
  });
});
