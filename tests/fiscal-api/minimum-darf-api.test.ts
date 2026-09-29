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

/**
 * Phase 4E production E2E — FII_SALE / revenue code 6015.
 *
 * The canonical withholding input requires a non-zero credit, so every sale
 * competence records a small canonical IRRF of R$ 0,10 (as in the 4C suite).
 * FII rate is 20%, so the tax for a gain `g` is `0.20*g - 0.10`.
 */
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

describe('API Integration: minimum DARF & carry-forward (Phase 4E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // 2026-10-01: both 2026-08 and 2026-09 are closed competences and neither
    // obligation is overdue (2026-09 due 2026-10-30).
    app = await buildApp('2026-10-01');
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

  async function setupAsset(userId: string, type: 'FII' | 'EQUITY' = 'FII', ticker = 'MXRF11') {
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

  async function postTx(
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

  async function recordWithholding(token: string, competence: string, date: string) {
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

  async function summary(token: string, competence: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/payment-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data;
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
    await postTx(token, portfolioId, {
      accountId,
      assetId,
      type,
      quantity: '100',
      unitPrice,
      currency: 'BRL',
      tradeDate,
      provider: 'B3',
      externalId,
    });
  }

  async function buy(...args: Parameters<typeof trade>) {
    await trade(...args);
  }
  async function sell(
    token: string,
    portfolioId: string,
    accountId: string,
    assetId: string,
    tradeDate: string,
    unitPrice: string,
    externalId: string,
  ) {
    await trade(token, portfolioId, accountId, assetId, 'SELL', tradeDate, unitPrice, externalId);
  }

  it('below-minimum (R$ 3,90) is deferred to the same revenue code, never discarded', async () => {
    const userId = 'bb111111-1111-4111-8111-111111111111';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '10.2', 's1'); // tax 3.90
    await recordWithholding(token, '2026-08', '2026-08-10');

    const data = await summary(token, '2026-08');
    expect(data.eligibility.status).toBe('CARRIED_FORWARD');
    expect(data.eligibility.currentAmount).toEqual({ amount: '3.9', currency: 'BRL' });
    expect(data.eligibility.totalPayable).toEqual({ amount: '3.9', currency: 'BRL' });
    expect(data.eligibility.minimumThreshold).toEqual({ amount: '10', currency: 'BRL' });
    expect(data.eligibility.rule.ruleId).toBe('BR-FEDERAL-MINIMUM-DARF-10');
    expect(data.eligibility.darfPreparationV2.eligibilityStatus).toBe('CARRIED_FORWARD');
    expect(data.openCarryForwardEntries).toHaveLength(1);
    expect(data.openCarryForwardEntries[0].amount).toEqual({ amount: '3.9', currency: 'BRL' });
    expect(data.openCarryForwardEntries[0].targetCompetence).toBe('2026-09');
    expect(data.obligation.status).not.toBe('PAID');
    expect(data.obligation.principalAmount).toEqual({ amount: '3.9', currency: 'BRL' });
    expect(data.aggregation.status).toBe('CARRIED_FORWARD');
  });

  it('boundary equality: carry R$ 4,90 + current R$ 5,10 = R$ 10,00 → PAYABLE, settles exactly once', async () => {
    const userId = 'bb222222-2222-4222-8222-222222222222';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-02', '10', 'b2');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '10.25', 's1'); // 4.90
    await recordWithholding(token, '2026-08', '2026-08-10');
    await summary(token, '2026-08');
    await sell(token, portfolioId, accountId, assetId, '2026-09-10', '10.26', 's2'); // 5.10
    await recordWithholding(token, '2026-09', '2026-09-10');

    const sep = await summary(token, '2026-09');
    expect(sep.eligibility.status).toBe('PAYABLE');
    expect(sep.eligibility.currentAmount).toEqual({ amount: '5.1', currency: 'BRL' });
    expect(sep.eligibility.carryForwardAmount).toEqual({ amount: '4.9', currency: 'BRL' });
    expect(sep.eligibility.totalPayable).toEqual({ amount: '10', currency: 'BRL' });
    expect(sep.eligibility.sources).toHaveLength(2);
    expect(sep.aggregation.status).toBe('PAYABLE');
    expect(sep.aggregation.dueDate).toBe('2026-10-30');

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${sep.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-10-01',
        amount: '9.99',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(400);

    const settled = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${sep.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paidAt: '2026-10-01', amount: '10', currency: 'BRL', sourceType: 'MANUAL_CONFIRMED' })
      .expect(200);
    expect(settled.body.data.settlementStatus).toBe('SETTLED');
    expect(settled.body.data.paidAmount).toEqual({ amount: '10', currency: 'BRL' });

    const after = await summary(token, '2026-09');
    expect(after.openCarryForwardEntries).toHaveLength(0);
    expect(after.obligation.status).toBe('PAID');
    expect(after.eligibility.status).toBe('NOT_REQUIRED');

    const again = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${sep.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paidAt: '2026-10-01', amount: '10', currency: 'BRL', sourceType: 'MANUAL_CONFIRMED' })
      .expect(200);
    expect(again.body.data.settlementStatus).toBe('ALREADY_SETTLED');
  });

  it('multi-period accumulation A(3.9) + B(4.9) + C(5.9) = 14.7 → PAYABLE above threshold', async () => {
    const userId = 'bb333333-3333-4333-8333-333333333333';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2025-06-01', '10', 'b0');
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-02', '10', 'b2');
    await sell(token, portfolioId, accountId, assetId, '2025-07-10', '10.2', 's0'); // 3.90
    await recordWithholding(token, '2025-07', '2025-07-10');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '10.25', 's1'); // 4.90
    await recordWithholding(token, '2026-08', '2026-08-10');
    await sell(token, portfolioId, accountId, assetId, '2026-09-10', '10.3', 's2'); // 5.90
    await recordWithholding(token, '2026-09', '2026-09-10');

    const a = await summary(token, '2025-07');
    expect(a.eligibility.status).toBe('CARRIED_FORWARD');
    const b = await summary(token, '2026-08');
    expect(b.eligibility.status).toBe('CARRIED_FORWARD');
    expect(b.eligibility.totalPayable).toEqual({ amount: '8.8', currency: 'BRL' });
    expect(b.openCarryForwardEntries).toHaveLength(2);

    const c = await summary(token, '2026-09');
    expect(c.eligibility.status).toBe('PAYABLE');
    expect(c.eligibility.currentAmount).toEqual({ amount: '5.9', currency: 'BRL' });
    expect(c.eligibility.carryForwardAmount).toEqual({ amount: '8.8', currency: 'BRL' });
    expect(c.eligibility.totalPayable).toEqual({ amount: '14.7', currency: 'BRL' });
    expect(c.eligibility.sources).toHaveLength(3);

    const settled = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${c.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-10-01',
        amount: '14.7',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(200);
    expect(settled.body.data.consumedEntryIds).toHaveLength(2);
    expect(settled.body.data.settlementStatus).toBe('SETTLED');

    const stored = await prisma.taxCarryForwardEntry.findMany({ where: { taxSubjectId: userId } });
    expect(stored.every((entry) => entry.status === 'CONSUMED')).toBe(true);
  });

  it('zero current tax: carried sub-minimum amounts persist and are never discarded', async () => {
    const userId = 'bb444444-4444-4444-8444-444444444444';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId);
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2025-06-01', '10', 'b0');
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await sell(token, portfolioId, accountId, assetId, '2025-07-10', '10.2', 's0'); // 3.90
    await recordWithholding(token, '2025-07', '2025-07-10');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '10.25', 's1'); // 4.90
    await recordWithholding(token, '2026-08', '2026-08-10');
    // Materialize the earlier competences so their sub-minimum amounts are
    // explicitly deferred (and never discarded).
    await summary(token, '2025-07');
    await summary(token, '2026-08');

    // 2026-09 has no sale (current = 0) but carries 3.90 + 4.90 = 8.80. Under the
    // verified rule the running total only reaches the minimum when a current
    // period contributes, so a carry-only total stays deferred — never dropped.
    const sep = await summary(token, '2026-09');
    expect(sep.eligibility.status).toBe('CARRIED_FORWARD');
    expect(sep.eligibility.currentAmount).toBeNull();
    expect(sep.eligibility.carryForwardAmount).toEqual({ amount: '8.8', currency: 'BRL' });
    expect(sep.eligibility.totalPayable).toEqual({ amount: '8.8', currency: 'BRL' });
    expect(sep.openCarryForwardEntries).toHaveLength(2);
    // A deferred aggregation is not payable.
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${sep.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-10-01',
        amount: '8.8',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(400);
  });

  it('missing minimum rule / unsupported bucket fails closed (BLOCKED)', async () => {
    const userId = 'bb555555-5555-4555-8555-555555555555';
    const { token, portfolioId, accountId, assetId } = await setupAsset(userId, 'EQUITY', 'PETR4');
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '20', 's1');

    const data = await summary(token, '2026-08');
    expect(data.eligibility.status).toBe('BLOCKED');
    expect(data.aggregation).toBeNull();
    expect(data.openCarryForwardEntries).toHaveLength(0);
  });

  it('anti-enumeration: another user cannot settle the aggregation (404)', async () => {
    const owner = 'bb666666-6666-4666-8666-666666666666';
    const { token, portfolioId, accountId, assetId } = await setupAsset(owner);
    await buy(token, portfolioId, accountId, assetId, 'BUY', '2026-06-01', '10', 'b1');
    await sell(token, portfolioId, accountId, assetId, '2026-08-10', '10.5', 's1'); // 9.90 → carried? no, 9.90 < 10 → carried
    await recordWithholding(token, '2026-08', '2026-08-10');
    const data = await summary(token, '2026-08');

    const intruder = 'bb777777-7777-4777-8777-777777777777';
    const intruderToken = await session(intruder);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/payment-aggregations/${data.aggregation.id}/payments`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({
        paidAt: '2026-10-01',
        amount: '3.9',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(404);
  });
});
