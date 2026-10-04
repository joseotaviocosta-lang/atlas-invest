import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';

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

interface Fixture {
  userId: string;
  token: string;
  portfolioId: string;
  accountId: string;
  assets: Record<string, string>;
}

async function session(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'High Income User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

async function setupPortfolio(
  userId: string,
  tag: string,
  tickers: Array<{ ticker: string; name: string; type: string }>,
): Promise<Fixture> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-hi-${tag}`),
      userId,
      name: `HI Portfolio ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: {
      id: uuidFor(`inst-hi-${tag}`),
      name: `Broker ${tag}`,
      type: 'BROKER',
      country: 'BR',
    },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-hi-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Account ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const assets: Record<string, string> = {};
  for (const asset of tickers) {
    const created = await prisma.asset.create({
      data: {
        id: uuidFor(`asset-hi-${tag}-${asset.ticker}`),
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    assets[asset.ticker] = created.id;
  }
  return { userId, token: '', portfolioId: portfolio.id, accountId: account.id, assets };
}

async function addIncomeTx(
  fx: Fixture,
  tag: string,
  assetTicker: string,
  type: 'DIVIDEND' | 'JCP' | 'FII_INCOME',
  amount: string,
  tradeDate: string,
  currency = 'BRL',
): Promise<void> {
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-hi-${tag}`),
      portfolioId: fx.portfolioId,
      accountId: fx.accountId,
      assetId: fx.assets[assetTicker]!,
      type,
      tradeDate: new Date(`${tradeDate}T00:00:00Z`),
      settlementDate: new Date(`${tradeDate}T00:00:00Z`),
      quantity: '0',
      unitPrice: '0',
      amount,
      currency,
    },
  });
}

async function addBuySell(
  fx: Fixture,
  tag: string,
  assetTicker: string,
  quantity: string,
  buyPrice: string,
  sellPrice: string,
): Promise<void> {
  const buyAmount = `${Number(quantity) * Number(buyPrice)}`;
  const sellAmount = `${Number(quantity) * Number(sellPrice)}`;
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-hi-buy-${tag}`),
      portfolioId: fx.portfolioId,
      accountId: fx.accountId,
      assetId: fx.assets[assetTicker]!,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity,
      unitPrice: buyPrice,
      amount: buyAmount,
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-hi-sell-${tag}`),
      portfolioId: fx.portfolioId,
      accountId: fx.accountId,
      assetId: fx.assets[assetTicker]!,
      type: 'SELL',
      tradeDate: new Date('2026-06-15T00:00:00Z'),
      settlementDate: new Date('2026-06-17T00:00:00Z'),
      quantity,
      unitPrice: sellPrice,
      amount: sellAmount,
      currency: 'BRL',
    },
  });
}

async function postEvidence(
  server: unknown,
  token: string,
  year: number,
  body: Record<string, unknown>,
  expectedStatus = 201,
) {
  return request(server as never)
    .post(`/api/v1/fiscal/annual/${year}/high-income/evidence`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(expectedStatus);
}

function corporateBody(payerId: string, overrides: Record<string, unknown> = {}) {
  return {
    evidenceType: 'CORPORATE_TAX',
    payerId,
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    evidenceMode: 'FULL',
    accountingProfit: '800000.00',
    irDue: '200000.00',
    csllDue: '68000.00',
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    ...overrides,
  };
}

function adjustmentBody(amount: string) {
  return {
    evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
    adjustmentAmount: amount,
    evidenceSource: 'TAXPAYER_CONFIRMED',
  };
}

describe('API Integration: Annual High-Income Real E2E (Phase 4I.4)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-03-15');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2026/high-income').expect(401);
  });

  it('rejects invalid calendar years with 400 FISCAL.INVALID_YEAR', async () => {
    const token = await session(uuidFor('user-hi-invalid-year'));
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('FISCAL.INVALID_YEAR');
      });
  });

  it('Scenario A: income <= 600k -> NOT_APPLICABLE', async () => {
    const userId = uuidFor('user-hi-a');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'a', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'a-div', 'PETR4', 'DIVIDEND', '10000.00', '2026-05-15');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.calendarYear).toBe(2026);
    expect(res.body.data.declarationExercise).toBe(2027);
    expect(res.body.data.status).toBe('NOT_APPLICABLE');
    expect(res.body.data.totalAnnualIncome).toBe('10000');
    expect(res.body.data.netMinimumTax).toBeNull();
    expect(res.body.data.grossMinimumTax).toBeNull();
    expect(res.body.data.calculationFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Scenario B: applicable equity gains without redutor -> CALCULABLE net', async () => {
    const userId = uuidFor('user-hi-b');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'b', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addBuySell(fx, 'b', 'PETR4', '100000', '10.00', '17.00');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.status).toBe('CALCULABLE');
    expect(res.body.data.totalAnnualIncome).toBe('700000');
    expect(res.body.data.minimumTaxBase).toBe('700000');
    expect(res.body.data.grossMinimumTax).toBe('11666.67');
    expect(res.body.data.netMinimumTax).toBe('11666.67');
    expect(res.body.data.corporateRedutor).toBeNull();
    expect(res.body.data.evidence).toHaveLength(1);
  });

  it('Scenario C: complete redutor evidence -> CALCULABLE net with reduction', async () => {
    const userId = uuidFor('user-hi-c');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'c', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'c-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    const evRes = await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    expect(evRes.body.meta.created).toBe(true);
    expect(evRes.body.data.revision).toBe(1);
    expect(evRes.body.data.authority).toBe('AUTHORITATIVE');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.status).toBe('CALCULABLE');
    expect(res.body.data.grossMinimumTax).toBe('11666.67');
    expect(res.body.data.corporateRedutor.totalSupportedReduction).toBe('8166.67');
    expect(res.body.data.corporateRedutor.payers).toHaveLength(1);
    expect(res.body.data.corporateRedutor.payers[0].payerId).toBe('PETR4');
    // 2026 dividends above R$50k/month incur 10% art. 6º-A withholding (R$70,000),
    // which exceeds the gross minimum tax: net floors at zero with excess classified.
    expect(res.body.data.netMinimumTax).toBe('0');
    expect(res.body.data.creditExcess).toBe('66500');
    expect(res.body.data.evidence).toHaveLength(2);
  });

  it('Scenario D: missing redutor evidence -> gross known, net null', async () => {
    const userId = uuidFor('user-hi-d');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'd', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'd-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(res.body.data.grossMinimumTax).toBe('11666.67');
    expect(res.body.data.netMinimumTax).toBeNull();
  });

  it('Scenario E: conflicting evidence -> BLOCKED, resolve ACCEPT_NEW unlocks', async () => {
    const userId = uuidFor('user-hi-e');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'e', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'e-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    const conflicted = await postEvidence(app.getHttpServer(), token, 2026, {
      ...corporateBody('PETR4', { irDue: '210000.00' }),
      evidenceSource: 'RFB_PREFILLED',
    });
    expect(conflicted.body.data.conflictStatus).toBe('CONFLICT');

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(blocked.body.data.status).toBe('BLOCKED');
    expect(blocked.body.data.netMinimumTax).toBeNull();

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/annual/2026/high-income/evidence/${conflicted.body.data.id}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'ACCEPT_NEW' })
      .expect(200);
    expect(resolved.body.data.conflictStatus).toBe('NONE');
    expect(resolved.body.data.revision).toBe(3);

    const unlocked = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unlocked.body.data.status).toBe('CALCULABLE');
    expect(unlocked.body.data.netMinimumTax).not.toBeNull();
  });

  it('Scenario F: evidence revision supersedes, history retained, fingerprint changes', async () => {
    const userId = uuidFor('user-hi-f');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'f', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addBuySell(fx, 'f', 'PETR4', '100000', '10.00', '17.00');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const first = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.data.status).toBe('CALCULABLE');
    expect(first.body.data.netMinimumTax).toBe('11666.67');

    const rev2 = await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('5000.00'));
    expect(rev2.body.meta.created).toBe(true);
    expect(rev2.body.data.revision).toBe(2);

    const second = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.data.calculationFingerprint).not.toBe(
      first.body.data.calculationFingerprint,
    );
    expect(second.body.data.netMinimumTax).toBe('6666.67');

    const history = await prisma.highIncomeEvidenceRecord.findMany({
      where: { taxSubjectId: userId, calendarYear: 2026, payerKey: '_ANNUAL_' },
      orderBy: { revision: 'asc' },
    });
    expect(history.map((row) => row.revision)).toEqual([1, 2]);
  });

  it('Scenario G: cross-user isolation — no read or write leakage', async () => {
    const userA = uuidFor('user-hi-g-a');
    const tokenA = await session(userA);
    const fxA = await setupPortfolio(userA, 'ga', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fxA, 'ga-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), tokenA, 2026, corporateBody('PETR4'));

    const userB = uuidFor('user-hi-g-b');
    const tokenB = await session(userB);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(resB.body.data.status).toBe('NOT_APPLICABLE');
    expect(resB.body.data.totalAnnualIncome).toBeNull();
    expect(resB.body.data.evidence).toHaveLength(0);

    // B cannot reference A's payer universe: PETR4 is foreign to B.
    await postEvidence(app.getHttpServer(), tokenB, 2026, corporateBody('PETR4'), 404);

    const countA = await prisma.highIncomeEvidenceRecord.count({ where: { taxSubjectId: userA } });
    const countB = await prisma.highIncomeEvidenceRecord.count({ where: { taxSubjectId: userB } });
    expect(countA).toBe(1);
    expect(countB).toBe(0);
  });

  it('Scenario H: cross-year isolation — 2026 evidence never leaks into 2027', async () => {
    const userId = uuidFor('user-hi-h');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'h', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'h-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2027/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.calendarYear).toBe(2027);
    expect(res.body.data.evidence).toHaveLength(0);
    // 2027 has a modeled rule set; with no 2027 upstream facts the year is quiet.
    expect(res.body.data.status).toBe('NOT_APPLICABLE');
  });

  it('Scenario I: unsupported year 2028 -> UNSUPPORTED_YEAR', async () => {
    const userId = uuidFor('user-hi-i');
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2028/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('UNSUPPORTED_YEAR');
    expect(res.body.data.netMinimumTax).toBeNull();
  });

  it('Scenario J: foreign-currency income fails closed upstream', async () => {
    const userId = uuidFor('user-hi-j');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'j', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'j-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15', 'USD');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.blockingReasons).toContain('BLOCKED_UPSTREAM_4H_INCOME');
    expect(res.body.data.netMinimumTax).toBeNull();
  });

  it('Scenario K: multi-payer complete -> deterministic aggregate', async () => {
    const userId = uuidFor('user-hi-k');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'k', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
      { ticker: 'ITUB4', name: 'Itau PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'k-div-petr', 'PETR4', 'DIVIDEND', '400000.00', '2026-05-15');
    await addIncomeTx(fx, 'k-div-itub', 'ITUB4', 'DIVIDEND', '300000.00', '2026-06-15');
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    await postEvidence(
      app.getHttpServer(),
      token,
      2026,
      corporateBody('ITUB4', { irDue: '172000.00' }),
    );
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const first = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(first.body.data.status).toBe('CALCULABLE');
    expect(first.body.data.corporateRedutor.payerCount).toBe(2);
    expect(first.body.data.corporateRedutor.totalSupportedReduction).toBe('4666.67');
    // 2026 dividend withholding (R$70,000 on R$700,000) exceeds gross: net floors at zero.
    expect(first.body.data.netMinimumTax).toBe('0');
    expect(second.body.data.calculationFingerprint).toBe(first.body.data.calculationFingerprint);
  });

  it('Scenario L: multi-payer partial -> supported pieces visible, net null', async () => {
    const userId = uuidFor('user-hi-l');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'l', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
      { ticker: 'ITUB4', name: 'Itau PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'l-div-petr', 'PETR4', 'DIVIDEND', '400000.00', '2026-05-15');
    await addIncomeTx(fx, 'l-div-itub', 'ITUB4', 'DIVIDEND', '300000.00', '2026-06-15');
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(res.body.data.grossMinimumTax).toBe('11666.67');
    expect(res.body.data.netMinimumTax).toBeNull();
    const payers = res.body.data.corporateRedutor.payers as Array<{
      payerId: string;
      status: string;
    }>;
    expect(payers.find((payer) => payer.payerId === 'PETR4')?.status).toBe('APPLICABLE');
    expect(res.body.data.corporateRedutor.blockingPayers).toContain('ITUB4');
  });

  it('Scenario M: 4H source revision rebuilds with changed fingerprint and stale evidence', async () => {
    const userId = uuidFor('user-hi-m');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'm', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'm-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));

    const before = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.data.status).toBe('CALCULABLE');

    await addIncomeTx(fx, 'm-div-late', 'PETR4', 'DIVIDEND', '100000.00', '2026-11-20');

    const after = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.calculationFingerprint).not.toBe(
      before.body.data.calculationFingerprint,
    );
    // Corporate evidence pinned to the old payer aggregate is now stale: fail closed.
    expect(after.body.data.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(after.body.data.netMinimumTax).toBeNull();
    expect(after.body.data.grossMinimumTax).not.toBeNull();
    const evidence = after.body.data.evidence as Array<{ stale: boolean }>;
    expect(evidence.some((entry) => entry.stale)).toBe(true);
  });

  it('Scenario N: idempotent evidence retry produces one legal effect', async () => {
    const userId = uuidFor('user-hi-n');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'n', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'n-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');

    const first = await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    const second = await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));
    expect(first.body.meta.created).toBe(true);
    expect(second.body.meta.created).toBe(false);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.revision).toBe(1);

    const count = await prisma.highIncomeEvidenceRecord.count({
      where: { taxSubjectId: userId, calendarYear: 2026 },
    });
    expect(count).toBe(1);
  });

  it('Scenario O: concurrent evidence writes order deterministically without lost update', async () => {
    const userId = uuidFor('user-hi-o');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'o', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'o-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');

    const identical = await Promise.all(
      Array.from({ length: 5 }, () =>
        postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4')),
      ),
    );
    const createdCount = identical.filter((res) => res.body.meta.created).length;
    expect(createdCount).toBe(1);

    const revisions = ['211000.00', '222000.00', '233000.00'].map((irDue) =>
      postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4', { irDue })),
    );
    const settled = await Promise.all(revisions);
    expect(settled.every((res) => res.status === 201)).toBe(true);

    const history = await prisma.highIncomeEvidenceRecord.findMany({
      where: { taxSubjectId: userId, calendarYear: 2026, payerKey: 'PETR4' },
      orderBy: { revision: 'asc' },
    });
    expect(history.map((row) => row.revision)).toEqual([1, 2, 3, 4]);
    expect(new Set(history.map((row) => row.irDue?.toString()))).toEqual(
      new Set(['200000', '211000', '222000', '233000']),
    );
  });

  it('Scenario P: same payer multiple profit periods fails closed', async () => {
    const userId = uuidFor('user-hi-p');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'p', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'p-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    await postEvidence(app.getHttpServer(), token, 2026, adjustmentBody('0.00'));
    await postEvidence(
      app.getHttpServer(),
      token,
      2026,
      corporateBody('PETR4', { profitPeriodExercise: 2025 }),
    );
    await postEvidence(
      app.getHttpServer(),
      token,
      2026,
      corporateBody('PETR4', { profitPeriodExercise: 2026 }),
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.netMinimumTax).toBeNull();
  });

  it('resolving a non-conflicted revision returns 409 EVIDENCE_CONFLICT', async () => {
    const userId = uuidFor('user-hi-r');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'r', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'r-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');
    const created = await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'));

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/annual/2026/high-income/evidence/${created.body.data.id}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'ACCEPT_NEW' })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('FISCAL.EVIDENCE_CONFLICT');
      });
  });

  it('rejects unknown payer type and malformed decimals with 400', async () => {
    const userId = uuidFor('user-hi-v');
    const token = await session(userId);
    const fx = await setupPortfolio(userId, 'v', [
      { ticker: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    ]);
    await addIncomeTx(fx, 'v-div', 'PETR4', 'DIVIDEND', '700000.00', '2026-05-15');

    await postEvidence(
      app.getHttpServer(),
      token,
      2026,
      { ...corporateBody('PETR4'), payerType: 'OFFSHORE_SHELL' },
      400,
    );
    await postEvidence(
      app.getHttpServer(),
      token,
      2026,
      { ...corporateBody('PETR4'), irDue: '12.34.56' },
      400,
    );
    await postEvidence(app.getHttpServer(), token, 2026, corporateBody('PETR4'), 201);
  });
});
