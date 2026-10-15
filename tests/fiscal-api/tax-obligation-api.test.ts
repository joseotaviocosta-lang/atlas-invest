import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { Asset } from '@atlas/domain';

const prisma = getTestPrismaClient();

async function buildApp(today: string): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => today })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API Integration: tax obligations & direct deadline registry (Phase 4C.2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2026-09-29');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function session(userId: string): Promise<string> {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'T',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
      update: {},
    });
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setupAsset(userId: string, type: 'FII' | 'EQUITY', ticker: string) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
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
    const asset = Asset.create({ ticker, name: ticker, type, currency: 'BRL', exchange: 'B3' });
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

  async function recordWithholding(
    token: string,
    competence: string,
    economicDate: string,
    amount: string,
  ) {
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence,
        economicDate,
        category: 'FII',
        amount,
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: `irrf-${competence}`,
      })
      .expect(200);
  }

  /** Real production chain for FII_SALE competence 2026-08 (due 2026-09-30). */
  async function fiiChain(userId: string, sellUnitPrice = '20') {
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId, 'FII', 'MXRF11');
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
      unitPrice: sellUnitPrice,
      currency: 'BRL',
      tradeDate: '2026-08-10',
      provider: 'B3',
      externalId: 's1',
    });
    await recordWithholding(token, '2026-08', '2026-08-10', '0.1');
    return { token, portfolioId, accountId, assetId };
  }

  it('materializes a real OPEN obligation bound to the official deadline (6015 / 2026-09-30)', async () => {
    const userId = 'aa111111-1111-4111-8111-111111111111';
    const { token } = await fiiChain(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('OPEN');
    expect(data.taxBucket).toBe('FII_SALE');
    expect(data.revenueCode).toBe('6015');
    expect(data.principalAmount).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(data.dueDate).toBe('2026-09-30');
    expect(data.darfReadiness).toBe('READY');
    expect(data.deadline.sourceDocument).toContain('ADE CORAT');
    expect(data.deadline.sourceAuthority).toBe('RFB');
    expect(data.darfPreparation.revenueCode).toBe('6015');
    // Exact decimal strings, never numbers.
    expect(typeof data.principalAmount.amount).toBe('string');
  });

  it('materialization is idempotent (same canonical liability → one obligation)', async () => {
    const userId = 'aa121212-1212-4212-8212-121212121212';
    const { token } = await fiiChain(userId);
    const first = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/obligations?competence=2026-08')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('zero COMPLETE liability → NO_PAYMENT_DUE / NOT_REQUIRED', async () => {
    const userId = 'aa222222-2222-4222-8222-222222222222';
    const { token } = await fiiChain(userId, '10');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_PAYMENT_DUE');
    expect(res.body.data.principalAmount).toBeNull();
    expect(res.body.data.darfReadiness).toBe('NOT_REQUIRED');
  });

  it('missing official deadline fails closed (no payable obligation)', async () => {
    const userId = 'aa333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId, 'FII', 'HGLG11');
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      currency: 'BRL',
      tradeDate: '2026-06-01',
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
      tradeDate: '2026-07-10',
      provider: 'B3',
      externalId: 's1',
    });
    await recordWithholding(token, '2026-07', '2026-07-10', '0.1');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-07/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.reasonCode).toBe('MISSING_OFFICIAL_DEADLINE');
    expect(res.body.data.principalAmount).toBeNull();
  });

  it('unsupported bucket (equity) fails closed', async () => {
    const userId = 'aa444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId, 'EQUITY', 'PETR4');
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
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.principalAmount).toBeNull();
  });

  it('records manual payment evidence and marks the obligation PAID', async () => {
    const userId = 'aa555555-5555-4555-8555-555555555555';
    const { token } = await fiiChain(userId);
    const obligation = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const id = obligation.body.data.id;

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-09-29',
        amount: '199.9',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.payments).toHaveLength(1);
    expect(paid.body.data.payments[0].amount).toEqual({ amount: '199.9', currency: 'BRL' });

    // Wrong amount is rejected and does not mutate state.
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-09-29',
        amount: '100',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
        sourceReference: 'x',
      })
      .expect(400);
  });

  it('supersedes a paid obligation after a liability change (reconciliation, no auto-credit)', async () => {
    const userId = 'aa666666-6666-4666-8666-666666666666';
    const { token, portfolioId, accountId, assetId } = await fiiChain(userId);
    const first = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const firstId = first.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${firstId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-09-29',
        amount: '199.9',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(200);

    // Append a further sale in the same competence → liability changes.
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity: '50',
      unitPrice: '30',
      currency: 'BRL',
      tradeDate: '2026-08-20',
      provider: 'B3',
      externalId: 's2',
    });

    const second = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.data.id).not.toBe(firstId);

    const old = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${firstId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(old.body.data.status).toBe('RECONCILIATION_REQUIRED');
    expect(old.body.data.payments).toHaveLength(1);
  });

  it('enforces authorization: another subject cannot read the obligation (404)', async () => {
    const owner = 'aa777777-7777-4777-8777-777777777777';
    const { token } = await fiiChain(owner);
    const obligation = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const id = obligation.body.data.id;

    const intruder = await session('aa888888-8888-4888-8888-888888888888');
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${id}`)
      .set('Authorization', `Bearer ${intruder}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${id}/payments`)
      .set('Authorization', `Bearer ${intruder}`)
      .send({
        paidAt: '2026-09-29',
        amount: '199.9',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(404);
  });

  it('derives OVERDUE from the injected clock without penalty math', async () => {
    const overdueApp = await buildApp('2026-10-01');
    try {
      const userId = 'aa999999-9999-4999-8999-999999999999';
      const token = await session(userId);
      const portfolioRes = await request(overdueApp.getHttpServer())
        .post('/api/v1/portfolios')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
        .expect(201);
      const portfolioId = portfolioRes.body.data.id;
      const inst = await request(overdueApp.getHttpServer())
        .post('/api/v1/institutions')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'C', type: 'BANK', country: 'BR' })
        .expect(201);
      const accountRes = await request(overdueApp.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ institutionId: inst.body.data.id, name: 'Conta', currency: 'BRL' })
        .expect(201);
      const asset = Asset.create({
        ticker: 'KNRI11',
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
      const accountId = accountRes.body.data.id;
      for (const [type, quantity, price, date, externalId] of [
        ['BUY', '100', '10', '2026-07-01', 'b1'],
        ['SELL', '100', '20', '2026-08-10', 's1'],
      ] as const) {
        await request(overdueApp.getHttpServer())
          .post(`/api/v1/portfolios/${portfolioId}/transactions`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            accountId,
            assetId: asset.id,
            type,
            quantity,
            unitPrice: price,
            currency: 'BRL',
            tradeDate: date,
            provider: 'B3',
            externalId,
          })
          .expect(201);
      }
      await request(overdueApp.getHttpServer())
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
          sourceReference: 'irrf',
        })
        .expect(200);
      const res = await request(overdueApp.getHttpServer())
        .get('/api/v1/fiscal/monthly/2026-08/obligation')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.status).toBe('OVERDUE');
      expect(res.body.data.baseStatus).toBe('OPEN');
      // No penalty/interest fields exist.
      expect(res.body.data).not.toHaveProperty('penaltyAmount');
      expect(res.body.data).not.toHaveProperty('interestAmount');
    } finally {
      await overdueApp.close();
    }
  });

  it('H8-03: obligations list surfaces current revisions only (superseded stays auditable by ID)', async () => {
    const userId = 'aab0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';
    const token = await session(userId);
    await prisma.taxObligationRecord.create({
      data: {
        id: 'a0b00000-0000-4000-a000-000000000001',
        taxSubjectId: userId,
        competence: '2026-10',
        taxBucket: 'FII_SALE',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-h8-old-v1',
        revision: 1,
        principalAmount: null,
        currency: 'BRL',
        dueDate: null,
        status: 'SUPERSEDED',
        reasonCode: 'LIABILITY_BLOCKED',
        darfReadiness: 'BLOCKED',
        dataQuality: 'BLOCKED',
        provenance: {},
      },
    });
    await prisma.taxObligationRecord.create({
      data: {
        id: 'a0b00000-0000-4000-a000-000000000002',
        taxSubjectId: userId,
        competence: '2026-10',
        taxBucket: 'FII_SALE',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-h8-current-v1',
        revision: 1,
        principalAmount: '15',
        currency: 'BRL',
        dueDate: null,
        status: 'PROVISIONAL',
        reasonCode: 'IN_PROGRESS_COMPETENCE',
        darfReadiness: 'PARTIAL',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/obligations?competence=2026-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('PROVISIONAL');
    expect(list.body.data[0].principalAmount).toEqual({ amount: '15', currency: 'BRL' });

    // Explicit historical query still reaches the superseded revision by status.
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/obligations?competence=2026-10&status=SUPERSEDED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.data).toHaveLength(1);

    // ...and by ID (audit preserved, never deleted).
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/obligations/a0b00000-0000-4000-a000-000000000001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
