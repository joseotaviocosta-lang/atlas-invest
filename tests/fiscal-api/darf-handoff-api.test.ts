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
const CLOCK = '2026-10-05';

async function buildApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => CLOCK })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API Integration: official DARF readiness & handoff (Phase 4F)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
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

  async function setupAsset(userId: string) {
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

  async function trade(
    token: string,
    portfolioId: string,
    accountId: string,
    assetId: string,
    type: 'BUY' | 'SELL',
    tradeDate: string,
    unitPrice: string,
    externalId: string,
  ) {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type,
        quantity: '100',
        unitPrice,
        currency: 'BRL',
        tradeDate,
        provider: 'B3',
        externalId,
      })
      .expect(201);
  }

  async function withholding(token: string, competence: string, date: string) {
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence,
        economicDate: date,
        category: 'FII',
        amount: '0.1',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: `irrf-${competence}`,
      })
      .expect(200);
  }

  async function obligation(token: string, competence: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/obligation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data;
  }

  async function readiness(token: string, obligationId: string, paymentDate?: string) {
    const qs = paymentDate ? `?paymentDate=${paymentDate}` : '';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/darf-readiness${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data;
  }

  async function handoff(token: string, obligationId: string, paymentDate?: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${obligationId}/darf-handoff`)
      .set('Authorization', `Bearer ${token}`)
      .send(paymentDate ? { paymentDate } : {})
      .expect(200);
    return res.body.data;
  }

  it('on-time payable: prepares exact values and records a USER_ACTION_REQUIRED handoff', async () => {
    const userId = 'cc111111-1111-4111-8111-111111111111';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-09-10', '20', 's1');
    await withholding(token, '2026-09', '2026-09-10');
    const obl = await obligation(token, '2026-09');
    expect(obl.status).toBe('OPEN');

    const ready = await readiness(token, obl.id);
    expect(ready.status).toBe('USER_ACTION_REQUIRED');
    expect(ready.eligible).toBe(true);
    expect(ready.overdue).toBe(false);
    expect(ready.generationMode).toBe('OFFICIAL_INTERACTIVE_HANDOFF');
    expect(ready.officialGenerationSupported).toBe(false);
    expect(ready.revenueCode).toBe('6015');
    expect(ready.preparedValues.principalAmount).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(ready.preparedValues.totalAmount).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(ready.preparedValues.lateFeeAmount).toBeNull();
    expect(ready.destination.sourceSystem).toBe('RFB_SICALC');
    expect(ready.destination.url).toContain('sicalc.receita.fazenda.gov.br');
    expect(ready.destination.prefillSupported).toBe(false);
    expect(ready.requiresTaxpayerIdentity).toBe(true);

    const result = await handoff(token, obl.id);
    expect(result.readiness.status).toBe('USER_ACTION_REQUIRED');
    expect(result.record.status).toBe('USER_ACTION_REQUIRED');
    expect(result.record.generationMode).toBe('OFFICIAL_INTERACTIVE_HANDOFF');
    expect(result.record.sourceSystem).toBe('RFB_SICALC');
    expect(result.record.generatedByAtlas).toBe(false);
    expect(result.record.officialDocumentId).toBeNull();

    // GENERATED != PAID: the obligation remains unpaid until payment evidence exists.
    const after = await obligation(token, '2026-09');
    expect(after.status).not.toBe('PAID');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/darfs?obligationId=${obl.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    const single = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/darfs/${result.record.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(single.body.data.id).toBe(result.record.id);
  });

  it('overdue: prepared values reproduce the verified official amounts (199.90 + 0.66 + 2.00 = 202.56)', async () => {
    const userId = 'cc222222-2222-4222-8222-222222222222';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-08-10', '20', 's1');
    await withholding(token, '2026-08', '2026-08-10');
    const obl = await obligation(token, '2026-08');
    expect(obl.status).toBe('OVERDUE');

    const ready = await readiness(token, obl.id, '2026-10-01');
    expect(ready.status).toBe('USER_ACTION_REQUIRED');
    expect(ready.overdue).toBe(true);
    expect(ready.adjustment.status).toBe('READY');
    expect(ready.preparedValues.principalAmount).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(ready.preparedValues.lateFeeAmount).toEqual({ amount: '0.66', currency: 'BRL' });
    expect(ready.preparedValues.interestAmount).toEqual({ amount: '2.00', currency: 'BRL' });
    expect(ready.preparedValues.totalAmount).toEqual({ amount: '202.56', currency: 'BRL' });

    const result = await handoff(token, obl.id, '2026-10-01');
    expect(result.record.status).toBe('USER_ACTION_REQUIRED');
    expect(result.record.totalAmount).toEqual({ amount: '202.56', currency: 'BRL' });
    expect(result.record.lateFeeAmount).toEqual({ amount: '0.66', currency: 'BRL' });
  });

  it('carry-forward: aggregated payable prepares the aggregate principal and preserves the breakdown', async () => {
    const userId = 'cc333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-02', '10', 'b2');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-08-10', '10.25', 's1'); // 4.90
    await withholding(token, '2026-08', '2026-08-10');
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/payment-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-09-10', '10.26', 's2'); // 5.10
    await withholding(token, '2026-09', '2026-09-10');
    const obl = await obligation(token, '2026-09');

    const ready = await readiness(token, obl.id);
    expect(ready.status).toBe('USER_ACTION_REQUIRED');
    expect(ready.preparedValues.principalAmount).toEqual({ amount: '10', currency: 'BRL' });
    expect(ready.preparedValues.carryForwardAmount).toEqual({ amount: '4.9', currency: 'BRL' });
    expect(ready.preparedValues.totalAmount).toEqual({ amount: '10', currency: 'BRL' });

    const result = await handoff(token, obl.id);
    expect(result.record.carryForwardAmount).toEqual({ amount: '4.9', currency: 'BRL' });
  });

  it('below minimum fails closed (never prepares a sub-minimum DARF)', async () => {
    const userId = 'cc444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-08-10', '10.2', 's1'); // 3.90
    await withholding(token, '2026-08', '2026-08-10');
    const obl = await obligation(token, '2026-08');

    const ready = await readiness(token, obl.id);
    expect(ready.status).toBe('BLOCKED');
    expect(ready.reasonCode).toBe('BELOW_MINIMUM');
    expect(ready.preparedValues).toBeNull();

    const result = await handoff(token, obl.id);
    expect(result.readiness.status).toBe('BLOCKED');
    expect(result.record).toBeNull();
  });

  it('taxpayer identity is validated and stored masked (raw never returned)', async () => {
    const userId = 'cc555555-5555-4555-8555-555555555555';
    const token = await session(userId);

    const before = await request(app.getHttpServer())
      .get('/api/v1/fiscal/taxpayer-identity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.data.identityAvailable).toBe(false);

    await request(app.getHttpServer())
      .put('/api/v1/fiscal/taxpayer-identity')
      .set('Authorization', `Bearer ${token}`)
      .send({ identityType: 'CPF', identifier: '111.111.111-11' })
      .expect(400);

    const recorded = await request(app.getHttpServer())
      .put('/api/v1/fiscal/taxpayer-identity')
      .set('Authorization', `Bearer ${token}`)
      .send({ identityType: 'CPF', identifier: '529.982.247-25' })
      .expect(200);
    expect(recorded.body.data.identityAvailable).toBe(true);
    expect(recorded.body.data.maskedIdentifier).toBe('***.***.247-**');
    expect(JSON.stringify(recorded.body)).not.toContain('52998224725');

    const row = await prisma.taxpayerIdentityRecord.findUnique({ where: { userId } });
    expect(row?.maskedIdentifier).toBe('***.***.247-**');
    expect(row?.secureReference).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.secureReference).not.toContain('52998224725');
  });

  it('supersedes the previous handoff when the preparation changes', async () => {
    const userId = 'cc666666-6666-4666-8666-666666666666';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-09-10', '20', 's1');
    await withholding(token, '2026-09', '2026-09-10');
    const obl = await obligation(token, '2026-09');

    const first = await handoff(token, obl.id);
    expect(first.record.status).toBe('USER_ACTION_REQUIRED');
    expect(first.readiness.reasonCode).toBe('TAXPAYER_IDENTITY_REQUIRED');

    await request(app.getHttpServer())
      .put('/api/v1/fiscal/taxpayer-identity')
      .set('Authorization', `Bearer ${token}`)
      .send({ identityType: 'CPF', identifier: '529.982.247-25' })
      .expect(200);

    const second = await handoff(token, obl.id);
    expect(second.record.id).not.toBe(first.record.id);
    expect(second.readiness.reasonCode).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/darfs?obligationId=${obl.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const statuses = list.body.data.map((r: { status: string }) => r.status).sort();
    expect(statuses).toEqual(['SUPERSEDED', 'USER_ACTION_REQUIRED']);
  });

  it('anti-enumeration: another user cannot read readiness or a DARF record (404)', async () => {
    const owner = 'cc777777-7777-4777-8777-777777777777';
    const { token, portfolioId, accountId, assetId } = await setupAsset(owner);
    await trade(token, portfolioId, accountId, assetId, 'BUY', '2026-07-01', '10', 'b1');
    await trade(token, portfolioId, accountId, assetId, 'SELL', '2026-09-10', '20', 's1');
    await withholding(token, '2026-09', '2026-09-10');
    const obl = await obligation(token, '2026-09');
    const result = await handoff(token, obl.id);

    const intruder = 'cc888888-8888-4888-8888-888888888888';
    const intruderToken = await session(intruder);
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obl.id}/darf-readiness`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/darfs/${result.record.id}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(404);
  });
});
