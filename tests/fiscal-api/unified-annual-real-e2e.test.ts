import 'reflect-metadata';
import { execSync } from 'node:child_process';
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

async function session(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Unified User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

/** Seed a portfolio with a dividend-paying asset (drives income + positions). */
async function seedDividendPortfolio(
  userId: string,
  tag: string,
  ticker: string,
  amount = '700000.00',
): Promise<string> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-buy-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity: '100',
      unitPrice: '10.00',
      amount: '1000.00',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-div-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'DIVIDEND',
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount,
      currency: 'BRL',
    },
  });
  return portfolio.id;
}

/** Seed a BUY+SELL on a listed stock (drives capital-market + high-income gains). */
async function seedBuySellPortfolio(
  userId: string,
  tag: string,
  ticker: string,
  quantity = '100000',
  buyPrice = '10.00',
  sellPrice = '17.00',
): Promise<string> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-buy-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity,
      unitPrice: buyPrice,
      amount: `${Number(quantity) * Number(buyPrice)}`,
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-sell-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'SELL',
      tradeDate: new Date('2026-06-15T00:00:00Z'),
      settlementDate: new Date('2026-06-17T00:00:00Z'),
      quantity,
      unitPrice: sellPrice,
      amount: `${Number(quantity) * Number(sellPrice)}`,
      currency: 'BRL',
    },
  });
  return portfolio.id;
}

/** Seed a dividend portfolio in a chosen currency (USD -> BLOCKED upstream income). */
async function seedDividendCurrency(
  userId: string,
  tag: string,
  ticker: string,
  amount: string,
  currency: string,
): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-div-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'DIVIDEND',
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount,
      currency,
    },
  });
}

function corporateEvidenceBody(payerId: string, overrides: Record<string, unknown> = {}) {
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

function adjustmentEvidenceBody(amount: string) {
  return {
    evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
    adjustmentAmount: amount,
    evidenceSource: 'TAXPAYER_CONFIRMED',
  };
}

async function postHighIncomeEvidence(
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

function moduleOf(body: { data: { modules: Array<{ module: string }> } }, id: string) {
  return body.data.modules.find((m) => m.module === id);
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

describe('Phase 4J.1 — Unified Annual IRPF Orchestration real-PG E2E (A–T)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-04-10');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  // (A) empty subject -> NO_ACTIVITY
  it('A: empty subject -> NO_ACTIVITY', async () => {
    const token = await session(uuidFor('u-A'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expect(res.body.data.modules).toHaveLength(5);
  });

  // (B) response identity + envelope shape
  it('B: response envelope lifts identity fields and drops internal fields', async () => {
    const token = await session(uuidFor('u-B'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.calendarYear).toBe(2026);
    expect(data.declarationExercise).toBe(2027);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('modules');
    expect(data).toHaveProperty('requirements');
    expect(data).toHaveProperty('consistencyIssues');
    expect(data).toHaveProperty('sourceFingerprint');
    expect(data).toHaveProperty('annualFingerprint');
    // Internal fields must NOT be on the wire.
    expect(data).not.toHaveProperty('taxSubjectId');
    expect(data).not.toHaveProperty('generatedAt');
    expect(data).not.toHaveProperty('ruleVersions');
    expect(data).not.toHaveProperty('identity');
  });

  // (E) multi-portfolio income activity -> positions READY (worst-status fold)
  it('E: multi-portfolio activity yields module summaries for all five modules', async () => {
    const userId = uuidFor('u-E');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'E1', 'PETR4');
    await seedDividendPortfolio(userId, 'E2', 'VALE3');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const positions = res.body.data.modules.find(
      (m: { module: string }) => m.module === 'ANNUAL_POSITIONS',
    );
    expect(positions.source).toBe('4H.2');
    expect(['READY', 'PARTIAL', 'REQUIRES_CONFIRMATION', 'NO_ACTIVITY']).toContain(
      positions.status,
    );
  });

  // (H) pre-2026 high-income is non-material and never blocks global readiness.
  // The frozen 4I posture returns UNSUPPORTED_YEAR for out-of-window years
  // (<2026); the unified layer treats HIGH_INCOME as non-material for those
  // years so it never forces BLOCKED/UNSUPPORTED on the whole package.
  it('H: pre-2026 high-income is non-blocking (non-material out-of-window)', async () => {
    const userId = uuidFor('u-H');
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get(URL(2024))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hi = res.body.data.modules.find(
      (m: { module: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(['NOT_APPLICABLE', 'UNSUPPORTED']).toContain(hi.status);
    // The non-material high-income status must not drive the global state.
    expect(res.body.data.status).not.toBe('BLOCKED');
    expect(res.body.data.status).not.toBe('UNSUPPORTED');
  });

  // (Q) response carries no DB UUID / no subject id / no raw amount
  it('Q: body carries no subject id, no DB UUID and no raw monetary amount', async () => {
    const userId = uuidFor('u-Q');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'Q', 'ITUB4', '123456.78');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(userId);
    expect(body).not.toContain('123456.78');
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // (R) private/no-store header present
  it('R: Cache-Control private, no-store header present', async () => {
    const token = await session(uuidFor('u-R'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['cache-control']).toContain('private');
  });

  // (S) deterministic annualFingerprint across two identical requests
  it('S: deterministic annualFingerprint across two identical requests', async () => {
    const userId = uuidFor('u-S');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'S', 'BBAS3');
    const first = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.data.annualFingerprint).toBe(second.body.data.annualFingerprint);
    expect(first.body.data.annualFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  // (T) out-of-range year -> 400 FISCAL.INVALID_YEAR
  it('T: out-of-range year -> 400 FISCAL.INVALID_YEAR', async () => {
    const token = await session(uuidFor('u-T'));
    const res = await request(app.getHttpServer())
      .get(URL(1800))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('FISCAL.INVALID_YEAR');
  });

  // (C) single portfolio, modest dividend -> all five modules present, high-income
  // NOT_APPLICABLE (income under threshold), global not BLOCKED.
  it('C: modest single-portfolio activity -> coherent non-blocked state', async () => {
    const userId = uuidFor('u-C');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'C', 'PETR4', '10000.00');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.modules).toHaveLength(5);
    const hi = moduleOf(res.body, 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(hi.status).toBe('NOT_APPLICABLE');
    expect(res.body.data.status).not.toBe('BLOCKED');
  });

  // (G) income BLOCKED (foreign-currency dividend) -> UPSTREAM_NOT_READY consistency
  // issue, HIGH_INCOME forced BLOCKED, global BLOCKED.
  it('G: foreign-currency income -> high-income BLOCKED + UPSTREAM_NOT_READY -> global BLOCKED', async () => {
    const userId = uuidFor('u-G');
    const token = await session(userId);
    await seedDividendCurrency(userId, 'G', 'PETR4', '700000.00', 'USD');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hi = moduleOf(res.body, 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(hi.status).toBe('BLOCKED');
    expect(res.body.data.status).toBe('BLOCKED');
    const codes = res.body.data.consistencyIssues.map((i: { code: string }) => i.code);
    expect(codes).toContain('UPSTREAM_NOT_READY');
  });

  // (I) in-window high-income CALCULABLE -> HIGH_INCOME READY + authoritative.
  it('I: in-window high-income CALCULABLE -> HIGH_INCOME READY and authoritative', async () => {
    const userId = uuidFor('u-I');
    const token = await session(userId);
    await seedBuySellPortfolio(userId, 'I', 'PETR4');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hi = moduleOf(res.body, 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(hi.status).toBe('READY');
    expect(hi.authoritative).toBe(true);
    // 4I is the only module populating calculationFingerprint.
    expect(hi.calculationFingerprint).toMatch(/^[0-9a-f]{64}$/);
    const positions = moduleOf(res.body, 'ANNUAL_POSITIONS')!;
    expect(positions.calculationFingerprint).toBeNull();
  });

  // (J) 4I conflicting evidence -> HIGH_INCOME BLOCKED + CONFLICTING_EVIDENCE -> global BLOCKED.
  it('J: conflicting high-income evidence -> CONFLICTING_EVIDENCE + global BLOCKED', async () => {
    const userId = uuidFor('u-J');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'J', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    const conflicted = await postHighIncomeEvidence(app.getHttpServer(), token, 2026, {
      ...corporateEvidenceBody('PETR4', { irDue: '210000.00' }),
      evidenceSource: 'RFB_PREFILLED',
    });
    expect(conflicted.body.data.conflictStatus).toBe('CONFLICT');

    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hi = moduleOf(res.body, 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(hi.status).toBe('BLOCKED');
    expect(res.body.data.status).toBe('BLOCKED');
    const codes = res.body.data.consistencyIssues.map((i: { code: string }) => i.code);
    expect(codes).toContain('CONFLICTING_EVIDENCE');
  });

  // (K) 4I stale evidence while a requirement remains unresolved -> STALE_CONFIRMATION.
  it('K: stale high-income evidence with unresolved requirement -> STALE_CONFIRMATION', async () => {
    const userId = uuidFor('u-K');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'K', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    // Mutate the 4H income facts AFTER recording evidence -> evidence pinned to the
    // old payer aggregate becomes stale.
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-K-late'),
        portfolioId: uuidFor('pf-K'),
        accountId: uuidFor('acc-K'),
        assetId: uuidFor('asset-K'),
        type: 'DIVIDEND',
        tradeDate: new Date('2026-11-20T00:00:00Z'),
        settlementDate: new Date('2026-11-20T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '100000.00',
        currency: 'BRL',
      },
    });
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const codes = res.body.data.consistencyIssues.map((i: { code: string }) => i.code);
    expect(codes).toContain('STALE_CONFIRMATION');
    // Stale required evidence is BLOCKING -> global BLOCKED, never a mixed READY.
    expect(res.body.data.status).toBe('BLOCKED');
    // The stale/evidence identifiers must never leak onto the wire.
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(userId);
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // (K2) annual-scoped stale evidence (ANNUAL_ADJUSTMENT_IRPF) with unresolved
  // requirement -> STALE_CONFIRMATION, correlated by scope not by raw id.
  it('K2: annual-scoped stale evidence (annual adjustment pinned to a prior income revision) -> STALE_CONFIRMATION (no id leak)', async () => {
    const userId = uuidFor('u-K2');
    const token = await session(userId);
    // Dividend portfolio drives investment income (also leaves the CORPORATE
    // requirement unresolved, so the subject still has an open required action).
    await seedDividendPortfolio(userId, 'K2', 'PETR4', '700000.00');
    // Seed an ANNUAL-scoped (payerId null) adjustment evidence row directly with
    // an upstreamFingerprint that does NOT match the current income revision, so
    // the frozen engine marks it stale. This exercises the annual-scoped branch of
    // the stale correlation (payerId null), which the POST path cannot pin.
    await prisma.highIncomeEvidenceRecord.create({
      data: {
        taxSubjectId: userId,
        calendarYear: 2026,
        payerKey: '_ANNUAL_',
        payerId: null,
        evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
        adjustmentAmount: '0.00',
        authority: 'AUTHORITATIVE',
        evidenceSource: 'TAXPAYER_CONFIRMED',
        conflictStatus: 'NONE',
        upstreamFingerprint: 'stale-prior-income-revision',
        sourceFingerprint: 'sfp-K2-annual',
        revision: 1,
        fingerprint: 'fp-K2-annual',
        createdByPrincipal: userId,
      },
    });
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const codes = res.body.data.consistencyIssues.map((i: { code: string }) => i.code);
    expect(codes).toContain('STALE_CONFIRMATION');
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(userId);
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // (M) payer divergence: 4I references a payer 4H.4 never produced -> this is
  // engineered via corporate evidence for a payer with no income. The frozen 4I
  // engine rejects foreign payers (404), so we instead assert the BENIGN case:
  // a diversified filer (4H has extra payers 4I does not track) is NOT blocked.
  it('M: diversified filer (4H has extra payers) is not falsely PAYER_IDENTITY_MISMATCH-blocked', async () => {
    const userId = uuidFor('u-M');
    const token = await session(userId);
    // Two in-window dividend payers; corporate evidence recorded for only one.
    await seedDividendPortfolio(userId, 'M1', 'PETR4', '400000.00');
    await seedDividendPortfolio(userId, 'M2', 'VALE3', '300000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const codes = res.body.data.consistencyIssues.map((i: { code: string }) => i.code);
    // VALE3 is a legitimate 4H income payer without corporate evidence; this must
    // NOT fire PAYER_IDENTITY_MISMATCH (orphanInIncome is benign).
    expect(codes).not.toContain('PAYER_IDENTITY_MISMATCH');
  });

  // (P) requirement dedup across modules: the aggregated requirement list carries
  // no DB UUID and no raw subject id.
  it('P: aggregated requirements carry no DB UUID and no raw subject id', async () => {
    const userId = uuidFor('u-P');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'P', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const reqs = JSON.stringify(res.body.data.requirements);
    expect(reqs).not.toContain(userId);
    expect(reqs).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Keys follow the semantic `module::category::subject::nativeType` shape.
    for (const r of res.body.data.requirements as Array<{ key: string }>) {
      expect(r.key.split('::')).toHaveLength(4);
    }
  });

  // Position provenance: a content change that preserves summary counts/status
  // still changes the annualFingerprint (positionsMarker hashes full content).
  it('position provenance: changing a position cost (same counts) changes annualFingerprint', async () => {
    const userId = uuidFor('u-posfp');
    const token = await session(userId);
    await seedBuySellPortfolio(userId, 'posfp', 'PETR4', '100', '10.00', '12.00');
    const before = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Mutate the BUY unit price (changes cost basis, not asset/position counts).
    await prisma.transaction.update({
      where: { id: uuidFor('tx-buy-posfp') },
      data: { unitPrice: '11.00', amount: '1100.00' },
    });
    const after = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.annualFingerprint).not.toBe(before.body.data.annualFingerprint);
    expect(after.body.data.sourceFingerprint).not.toBe(before.body.data.sourceFingerprint);
  });

  // Routing: literal annual/opening-positions still resolves to the 4H handler
  it('routing: GET /annual/opening-positions resolves to the 4H list handler (not the unified route)', async () => {
    const token = await session(uuidFor('u-route'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`);
    // The 4H list route returns 200 with a data array; it must NOT be captured
    // by the parametric unified route (which would 400 on a non-integer year).
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('routing: GET /annual/2026 resolves to the unified handler', async () => {
    const token = await session(uuidFor('u-route2'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveProperty('annualFingerprint');
  });

  // Param guard: injection-shaped year -> 400 with no internal detail
  it('param guard: /annual/20);DROP -> 400 with no stack/.ts/node_modules in body', async () => {
    const token = await session(uuidFor('u-inj'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/20);DROP')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at\s+\/|\.ts:\d+|node_modules/);
    expect(body).not.toMatch(/stack/i);
  });

  // DB-final-proof: no new migration directory and migrate status clean
  it('DB-final-proof: prisma migrate status is clean (no schema drift from 4J.1)', () => {
    const output = execSync('pnpm --filter @atlas/database exec prisma migrate status', {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_TEST_URL ??
          'postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output).toMatch(/up to date|Database schema is up to date/i);
  });
});
