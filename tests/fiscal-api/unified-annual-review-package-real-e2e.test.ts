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
import { Money, Quantity } from '@atlas/domain';

/**
 * Phase 4J.2 — Unified Annual Review Package real-PG E2E (A–X).
 *
 * Exercises the complete derived path over a real database:
 *   4H + 4I → 4J.1 unified state → 4J.2 review package → JSON/CSV export.
 *
 * All financial amounts use the Atlas decimal value objects (never float).
 * Seed tags are `rp-*` so deterministic UUIDs never collide with the 4J.1 suite.
 */

function canonicalAmount(unitPrice: string, quantity: string): string {
  return Money.from(unitPrice, 'BRL').multiply(Quantity.from(quantity).value).amount;
}

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
        name: 'Review Package User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

async function seedDividendPortfolio(
  userId: string,
  tag: string,
  ticker: string,
  amount = '700000.00',
): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-rp-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-rp-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-rp-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-rp-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-buy-rp-${tag}`),
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
      id: uuidFor(`tx-div-rp-${tag}`),
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
}

async function seedBuySellPortfolio(
  userId: string,
  tag: string,
  ticker: string,
  quantity = '100000',
  buyPrice = '10.00',
  sellPrice = '17.00',
  withSale = true,
): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-rp-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-rp-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-rp-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-rp-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-buy-rp-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity,
      unitPrice: buyPrice,
      amount: canonicalAmount(buyPrice, quantity),
      currency: 'BRL',
    },
  });
  if (withSale) {
    await prisma.transaction.create({
      data: {
        id: uuidFor(`tx-sell-rp-${tag}`),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'SELL',
        tradeDate: new Date('2026-06-15T00:00:00Z'),
        settlementDate: new Date('2026-06-17T00:00:00Z'),
        quantity,
        unitPrice: sellPrice,
        amount: canonicalAmount(sellPrice, quantity),
        currency: 'BRL',
      },
    });
  }
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

const REVIEW = (year: number) => `/api/v1/fiscal/annual/${year}/review-package`;
const EXPORT = (year: number, format?: string) =>
  `/api/v1/fiscal/annual/${year}/review-package/export${format ? `?format=${format}` : ''}`;
const UNIFIED = (year: number) => `/api/v1/fiscal/annual/${year}`;

function expectPackageShape(data: Record<string, unknown>) {
  for (const key of [
    'packageVersion',
    'status',
    'generatedAt',
    'packageFingerprint',
    'disclaimer',
    'sectionAIdentity',
    'sectionBReadiness',
    'sectionCModules',
    'sectionDRequirements',
    'sectionEConsistency',
    'sectionFFilingSupport',
    'sectionGProvenance',
    'sectionHDisclaimer',
  ]) {
    expect(data, `package must carry ${key}`).toHaveProperty(key);
  }
  expect(data.packageVersion).toBe('unified-annual-review-package-v1');
  expect(String(data.packageFingerprint)).toMatch(/^[0-9a-f]{64}$/);
  expect(String(data.disclaimer)).toContain('NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
  // Internal identifiers never reach the wire.
  const body = JSON.stringify(data);
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(data).not.toHaveProperty('taxSubjectId');
}

async function reviewPackage(server: unknown, token: string, year = 2026) {
  return request(server as never)
    .get(REVIEW(year))
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
}

describe('Phase 4J.2 — Unified Annual Review Package real-PG E2E (A–X)', () => {
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

  // (A) READY general + HI N/A -> READY_FOR_REVIEW package.
  it('A: buy-only activity yields a READY_FOR_REVIEW package', async () => {
    const userId = uuidFor('u-rp-A');
    const token = await session(userId);
    await seedBuySellPortfolio(userId, 'A', 'PETR4', '100', '10.00', '17.00', false);
    const unified = await request(app.getHttpServer())
      .get(UNIFIED(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const res = await reviewPackage(app.getHttpServer(), token);
    expect(res.body.data.status).toBe(unified.body.data.status);
    expect(res.body.data.status).toBe('READY_FOR_REVIEW');
    expectPackageShape(res.body.data);
  });

  // (B) HI READY is projected faithfully. The global package follows the unified
  // status verbatim: with real gains, payment evidence pends (recording
  // payments is out of scope — NO PAYMENT EXECUTION), so the package is
  // REQUIRES_ACTION, never optimistically READY. Fabricating readiness would
  // violate the support-only contract.
  it('B: HI READY module projected faithfully; package follows unified status', async () => {
    const userId = uuidFor('u-rp-B');
    const token = await session(userId);
    await seedBuySellPortfolio(userId, 'B', 'PETR4');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    const unified = await request(app.getHttpServer())
      .get(UNIFIED(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const res = await reviewPackage(app.getHttpServer(), token);
    expectPackageShape(res.body.data);
    const hi = res.body.data.sectionCModules.modules.find(
      (m: { module: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(hi.status).toBe('READY');
    expect(hi.authoritative).toBe(true);
    expect(hi.calculationFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.status).toBe(unified.body.data.status);
    expect(res.body.data.status).not.toBe('BLOCKED');
  });

  // (C) 4H BLOCKED (foreign-currency income) -> BLOCKED package, no fake readiness.
  it('C: blocked annual state yields a BLOCKED package with blocking issues', async () => {
    const userId = uuidFor('u-rp-C');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'C', 'PETR4');
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-usd-rp-C'),
        portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id,
        accountId: (await prisma.account.findFirst({
          where: { portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id },
        }))!.id,
        assetId: (await prisma.asset.findFirst({ where: { ticker: 'PETR4' } }))!.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-07-15T00:00:00Z'),
        settlementDate: new Date('2026-07-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '700000.00',
        currency: 'USD',
      },
    });
    const res = await reviewPackage(app.getHttpServer(), token);
    expectPackageShape(res.body.data);
    expect(res.body.data.status).toBe('BLOCKED');
    const blocking = res.body.data.sectionEConsistency.issues.filter(
      (i: { blocking: boolean }) => i.blocking,
    );
    expect(blocking.length).toBeGreaterThan(0);
  });

  // (D) 4I BLOCKED (conflicting evidence) -> BLOCKED package per precedence.
  it('D: conflicting high-income evidence yields a BLOCKED package', async () => {
    const userId = uuidFor('u-rp-D');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'D', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, {
      ...corporateEvidenceBody('PETR4', { irDue: '210000.00' }),
      evidenceSource: 'RFB_PREFILLED',
    });
    const res = await reviewPackage(app.getHttpServer(), token);
    expect(res.body.data.status).toBe('BLOCKED');
    const codes = res.body.data.sectionEConsistency.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain('CONFLICTING_EVIDENCE');
  });

  // (E) missing evidence -> requirement exported, package not READY.
  it('E: applicable high income without evidence exports requirements and is not READY', async () => {
    const userId = uuidFor('u-rp-E');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'E', 'PETR4', '700000.00');
    const res = await reviewPackage(app.getHttpServer(), token);
    expectPackageShape(res.body.data);
    expect(res.body.data.sectionDRequirements.requirements.length).toBeGreaterThan(0);
    expect(res.body.data.status).not.toBe('READY_FOR_REVIEW');
    for (const req of res.body.data.sectionDRequirements.requirements) {
      expect(req.recommendedAction).toBeTruthy();
    }
  });

  // (F) stale evidence -> stale requirement exported with STALE_CONFIRMATION.
  it('F: stale high-income evidence exports STALE_CONFIRMATION', async () => {
    const userId = uuidFor('u-rp-F');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'F', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-extra-rp-F'),
        portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id,
        accountId: (await prisma.account.findFirst({
          where: { portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id },
        }))!.id,
        assetId: (await prisma.asset.findFirst({ where: { ticker: 'PETR4' } }))!.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-08-15T00:00:00Z'),
        settlementDate: new Date('2026-08-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '100000.00',
        currency: 'BRL',
      },
    });
    const res = await reviewPackage(app.getHttpServer(), token);
    const codes = res.body.data.sectionEConsistency.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain('STALE_CONFIRMATION');
  });

  // (G) conflicting evidence -> action/consistency issue visible (covered with D;
  // here assert the requirement row carries a resolution-oriented action).
  it('G: conflicting evidence surfaces a resolution action in requirements', async () => {
    const userId = uuidFor('u-rp-G');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'G', 'PETR4', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, {
      ...corporateEvidenceBody('PETR4', { irDue: '210000.00' }),
      evidenceSource: 'RFB_PREFILLED',
    });
    const res = await reviewPackage(app.getHttpServer(), token);
    expect(res.body.data.sectionEConsistency.issues.length).toBeGreaterThan(0);
    for (const issue of res.body.data.sectionEConsistency.issues) {
      expect(issue.recommendedAction).toBeTruthy();
      expect(issue.explanation).toBeTruthy();
    }
  });

  // (H) cross-module consistency blocker present in the package.
  it('H: upstream inconsistency is exposed as a blocking package issue', async () => {
    const userId = uuidFor('u-rp-H');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'H', 'PETR4');
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-usd-rp-H'),
        portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id,
        accountId: (await prisma.account.findFirst({
          where: { portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id },
        }))!.id,
        assetId: (await prisma.asset.findFirst({ where: { ticker: 'PETR4' } }))!.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-07-15T00:00:00Z'),
        settlementDate: new Date('2026-07-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '700000.00',
        currency: 'USD',
      },
    });
    const res = await reviewPackage(app.getHttpServer(), token);
    const blocking = res.body.data.sectionEConsistency.issues.filter(
      (i: { blocking: boolean }) => i.blocking,
    );
    expect(blocking.length).toBeGreaterThan(0);
    expect(res.body.data.status).toBe('BLOCKED');
  });

  // (I) legitimate different tax treatment across regimes -> no false blocker.
  it('I: diversified filer is not falsely blocked by payer-identity mismatch', async () => {
    const userId = uuidFor('u-rp-I');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'I1', 'PETR4', '700000.00');
    await seedDividendPortfolio(userId, 'I2', 'VALE3', '10000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    const res = await reviewPackage(app.getHttpServer(), token);
    const codes = res.body.data.sectionEConsistency.issues.map((i: { code: string }) => i.code);
    expect(codes).not.toContain('PAYER_IDENTITY_MISMATCH');
  });

  // (J) HI NOT_APPLICABLE does not block an otherwise coherent package.
  it('J: high-income NOT_APPLICABLE keeps the package unblocked', async () => {
    const userId = uuidFor('u-rp-J');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'J', 'PETR4', '10000.00');
    const unified = await request(app.getHttpServer())
      .get(UNIFIED(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const res = await reviewPackage(app.getHttpServer(), token);
    const hi = res.body.data.sectionCModules.modules.find(
      (m: { module: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(hi.status).toBe('NOT_APPLICABLE');
    expect(res.body.data.status).toBe(unified.body.data.status);
    expect(res.body.data.status).not.toBe('BLOCKED');
  });

  // (K) NO_ACTIVITY across all modules -> NO_ACTIVITY package.
  it('K: empty subject yields a NO_ACTIVITY package', async () => {
    const token = await session(uuidFor('u-rp-K'));
    const res = await reviewPackage(app.getHttpServer(), token);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expectPackageShape(res.body.data);
  });

  // (L) unsupported year -> safe UNSUPPORTED package output.
  it('L: out-of-window year yields a safe UNSUPPORTED package', async () => {
    const token = await session(uuidFor('u-rp-L'));
    const res = await reviewPackage(app.getHttpServer(), token, 2028);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expectPackageShape(res.body.data);
  });

  // (M) source revision -> new annualFingerprint AND new packageFingerprint.
  it('M: source revision changes both annual and package fingerprints', async () => {
    const userId = uuidFor('u-rp-M');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'M', 'PETR4', '10000.00');
    const first = await reviewPackage(app.getHttpServer(), token);
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-extra-rp-M'),
        portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id,
        accountId: (await prisma.account.findFirst({
          where: { portfolioId: (await prisma.portfolio.findFirst({ where: { userId } }))!.id },
        }))!.id,
        assetId: (await prisma.asset.findFirst({ where: { ticker: 'PETR4' } }))!.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-09-15T00:00:00Z'),
        settlementDate: new Date('2026-09-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '5000.00',
        currency: 'BRL',
      },
    });
    const second = await reviewPackage(app.getHttpServer(), token);
    expect(second.body.data.sectionGProvenance.annualFingerprint).not.toBe(
      first.body.data.sectionGProvenance.annualFingerprint,
    );
    expect(second.body.data.packageFingerprint).not.toBe(first.body.data.packageFingerprint);
  });

  // (N) evidence revision -> packageFingerprint changes.
  it('N: additional evidence changes the package fingerprint', async () => {
    const userId = uuidFor('u-rp-N');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'N1', 'PETR4', '700000.00');
    await seedDividendPortfolio(userId, 'N2', 'VALE3', '700000.00');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('PETR4'));
    const first = await reviewPackage(app.getHttpServer(), token);
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, corporateEvidenceBody('VALE3'));
    const second = await reviewPackage(app.getHttpServer(), token);
    expect(second.body.data.packageFingerprint).not.toBe(first.body.data.packageFingerprint);
  });

  // (O) cross-user isolation: B sees only their own empty package.
  it('O: cross-user export isolation holds (no leakage, never 403)', async () => {
    const userA = uuidFor('u-rp-OA');
    const tokenA = await session(userA);
    await seedDividendPortfolio(userA, 'OA', 'PETR4', '700000.00');
    const packageA = await reviewPackage(app.getHttpServer(), tokenA);

    const tokenB = await session(uuidFor('u-rp-OB'));
    const packageB = await reviewPackage(app.getHttpServer(), tokenB);
    expect(packageB.body.data.status).toBe('NO_ACTIVITY');
    expect(packageB.body.data.packageFingerprint).not.toBe(packageA.body.data.packageFingerprint);

    const exportB = await request(app.getHttpServer())
      .get(EXPORT(2026, 'csv'))
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(exportB.text).not.toContain(packageA.body.data.packageFingerprint);
  });

  // (P) JSON export: content, type, headers, fingerprint agreement with review.
  it('P: JSON export matches the review package with correct headers', async () => {
    const userId = uuidFor('u-rp-P');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'P', 'PETR4', '10000.00');
    const review = await reviewPackage(app.getHttpServer(), token);
    const res = await request(app.getHttpServer())
      .get(EXPORT(2026, 'json'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="atlas-irpf-2026-relatorio-apoio.json"',
    );
    expect(res.headers['cache-control']).toContain('no-store');
    const body = JSON.parse(res.text) as { packageFingerprint: string; status: string };
    expect(body.packageFingerprint).toBe(review.body.data.packageFingerprint);
    expect(body.status).toBe(review.body.data.status);
  });

  // (Q) human export defaults to CSV with the support-only label.
  it('Q: default export is CSV labeled as support-only', async () => {
    const userId = uuidFor('u-rp-Q');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'Q', 'PETR4', '10000.00');
    const res = await request(app.getHttpServer())
      .get(EXPORT(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="atlas-irpf-2026-relatorio-apoio.csv"',
    );
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain('DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
    expect(res.text).toContain('\r\n');
    expect(res.text).toContain('SECAO H - AVISO LEGAL');
  });

  // (R) CSV injection: hostile ticker text is neutralized, never a formula row.
  it('R: hostile identifiers are OWASP-escaped in CSV export', async () => {
    const userId = uuidFor('u-rp-R');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'R', '=2+5+cmd', '10000.00');
    const res = await request(app.getHttpServer())
      .get(EXPORT(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).not.toMatch(/^=2\+5/m);
    for (const line of res.text.split('\r\n')) {
      if (line.startsWith('#') || line === '') continue;
      expect(line[0]).not.toMatch(/^[=+\-@]/);
    }
  });

  // (S) null vs zero distinguished across JSON export.
  it('S: null fingerprints stay null (never zero/empty) in JSON export', async () => {
    const userId = uuidFor('u-rp-S');
    const token = await session(userId);
    await seedBuySellPortfolio(userId, 'S', 'PETR4');
    await postHighIncomeEvidence(app.getHttpServer(), token, 2026, adjustmentEvidenceBody('0.00'));
    const res = await request(app.getHttpServer())
      .get(EXPORT(2026, 'json'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = JSON.parse(res.text) as {
      sectionCModules: {
        modules: Array<{ module: string; calculationFingerprint: string | null }>;
      };
    };
    const positions = body.sectionCModules.modules.find((m) => m.module === 'ANNUAL_POSITIONS')!;
    const hi = body.sectionCModules.modules.find((m) => m.module === 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(positions.calculationFingerprint).toBeNull();
    expect(hi.calculationFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(res.text).not.toContain('"calculationFingerprint":""');
  });

  // (T) concurrent revision during export -> coherent package or deterministic conflict.
  it('T: concurrent revision during export never yields a mixed package', async () => {
    const userId = uuidFor('u-rp-T');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'T', 'PETR4', '10000.00');
    const server = app.getHttpServer();
    const [exportRes] = await Promise.all([
      request(server).get(EXPORT(2026, 'json')).set('Authorization', `Bearer ${token}`),
      postHighIncomeEvidence(server, token, 2026, corporateEvidenceBody('PETR4'), 201).catch(
        (error: unknown) => error,
      ),
    ]);
    expect([200, 400, 422]).toContain(exportRes.status);
    if (exportRes.status === 200) {
      const body = JSON.parse(exportRes.text) as {
        packageFingerprint: string;
        sectionCModules: { modules: unknown[] };
      };
      expect(body.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(body.sectionCModules.modules).toHaveLength(5);
    }
  });

  // (U) large decimals flow without precision loss or scientific notation.
  it('U: large decimal amounts export without precision loss', async () => {
    const userId = uuidFor('u-rp-U');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'U', 'PETR4', '12345678901234567890.123456789012345678');
    const res = await request(app.getHttpServer())
      .get(EXPORT(2026, 'json'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).not.toMatch(/\d+e[+-]\d+/i);
    const body = JSON.parse(res.text) as { packageFingerprint: string };
    expect(body.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  // (X) route safety: sibling annual literals are not captured by package routes.
  it('X: sibling annual routes are not captured by the review-package routes', async () => {
    const token = await session(uuidFor('u-rp-X'));
    const opening = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`);
    expect(opening.status).toBe(200);
    expect(Array.isArray(opening.body.data)).toBe(true);

    const badYear = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/not-a-year/review-package')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(badYear.headers['cache-control']).toContain('no-store');

    const badFormat = await request(app.getHttpServer())
      .get(EXPORT(2026, 'pdf'))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(JSON.stringify(badFormat.body)).not.toMatch(/stack/i);
  });

  // Auth + error-path cache headers on the package surface.
  it('V/W: unauthenticated package access is 401 with no-store; invalid year is 400', async () => {
    const noAuth = await request(app.getHttpServer()).get(REVIEW(2026)).expect(401);
    expect(noAuth.headers['cache-control']).toContain('no-store');

    const noAuthExport = await request(app.getHttpServer()).get(EXPORT(2026)).expect(401);
    expect(noAuthExport.headers['cache-control']).toContain('no-store');

    const token = await session(uuidFor('u-rp-VW'));
    const badYear = await request(app.getHttpServer())
      .get(REVIEW(1800))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(JSON.stringify(badYear.body)).toContain('FISCAL.INVALID_YEAR');
    expect(badYear.headers['cache-control']).toContain('no-store');
  });
});
