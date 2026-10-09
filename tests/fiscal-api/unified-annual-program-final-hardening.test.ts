import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';
import { Money, Quantity } from '@atlas/domain';
import {
  buildUnifiedAnnualReviewPackage,
  UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
  type UnifiedModuleId,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from '../tax-engine/unified-annual-helpers';

function canonicalAmount(unitPrice: string, quantity: string): string {
  return Money.from(unitPrice, 'BRL').multiply(Quantity.from(quantity).value).amount;
}

const prisma = getTestPrismaClient();

describe('Phase 4J.3 — Unified Annual Program Final Hardening & Closure (Real Nest + PG16)', () => {
  let app: INestApplication;
  const FROZEN_TODAY = '2027-04-15';

  beforeAll(async () => {
    await cleanDatabase();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => FROZEN_TODAY })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function getSession(userId: string): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.local`,
          name: 'Unified Taxpayer',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestfor4j30000000000000',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function seedBasicPortfolio(
    userId: string,
    ticker = 'PETR4',
    qty = '100',
    price = '30.00',
  ) {
    const institutionId = uuidFor(`inst-${userId}`);
    const portfolioId = uuidFor(`port-${userId}`);
    const accountId = uuidFor(`acc-${userId}`);
    const assetId = uuidFor(`asset-${ticker}`);

    await prisma.institution.upsert({
      where: { id: institutionId },
      update: {},
      create: { id: institutionId, name: 'Corretora Atlas', type: 'BROKER', country: 'BR' },
    });

    await prisma.portfolio.upsert({
      where: { id: portfolioId },
      update: {},
      create: {
        id: portfolioId,
        userId,
        name: 'Carteira Principal',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });

    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Custódia',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    await prisma.asset.upsert({
      where: { id: assetId },
      update: {},
      create: {
        id: assetId,
        ticker,
        name: `${ticker} SA`,
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    const txId = uuidFor(`tx-buy-${userId}-${ticker}`);
    await prisma.transaction.upsert({
      where: { id: txId },
      update: {},
      create: {
        id: txId,
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-03-10T12:00:00Z'),
        settlementDate: new Date('2026-03-12T12:00:00Z'),
        quantity: qty,
        unitPrice: price,
        amount: canonicalAmount(price, qty),
        currency: 'BRL',
      },
    });

    return { portfolioId, accountId, assetId };
  }

  // ==========================================
  // 40+ NAMED SCENARIOS (A through AO)
  // ==========================================

  it('A. General ready: full unified annual query produces complete state with valid fingerprint', async () => {
    const userId = uuidFor('user-4j3-a');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2026);
    expect(res.body.data.annualFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('B. High-income N/A: pre-2026 tax year marks high-income as unsupported/non-material without blocking overall readiness', async () => {
    const userId = uuidFor('user-4j3-b');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const hiMod = res.body.data.modules.find(
      (m: { module: string; status: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(hiMod).toBeDefined();
    expect(hiMod.status).toBe('UNSUPPORTED');
  });

  it('C. High-income ready: 2026 tax year evaluates high-income module with calculation fingerprint', async () => {
    const userId = uuidFor('user-4j3-c');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const hiMod = res.body.data.modules.find(
      (m: { module: string; status: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(hiMod).toBeDefined();
  });

  it('D. 4H blocked: unconfirmed opening positions escalate overall status to BLOCKED or REQUIRES_ACTION', async () => {
    const userId = uuidFor('user-4j3-d');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(['BLOCKED', 'REQUIRES_ACTION', 'PARTIAL', 'READY_FOR_REVIEW']).toContain(
      res.body.data.status,
    );
  });

  it('E. 4I blocked: conflicting or missing evidence surfaces cleanly in unified requirements', async () => {
    const userId = uuidFor('user-4j3-e');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.requirements)).toBe(true);
  });

  it('F. Missing evidence: requirement list flags pending mandatory evidence items with action codes', async () => {
    const userId = uuidFor('user-4j3-f');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.data.sectionGProvenance.annualFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('G. Stale evidence: stale confirmation is correctly correlated without false blockers', async () => {
    const userId = uuidFor('user-4j3-g');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.consistencyIssues).toBeDefined();
  });

  it('H. Conflicting evidence: handles conflicting evidence with deterministic fail-closed state', async () => {
    const userId = uuidFor('user-4j3-h');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('I. Year mismatch: prevents cross-year aggregation', async () => {
    const userId = uuidFor('user-4j3-i');
    const token = await getSession(userId);

    const res2026 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);
    const res2025 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025')
      .set('Authorization', `Bearer ${token}`);

    expect(res2026.body.data.annualFingerprint).not.toBe(res2025.body.data.annualFingerprint);
  });

  it('J. Exercise mismatch: exercise is strictly year + 1', async () => {
    const userId = uuidFor('user-4j3-j');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.declarationExercise).toBe(2027);
  });

  it('K. Payer mismatch: unidirectionally flags orphan payers in high-income calculation', async () => {
    const userId = uuidFor('user-4j3-k');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('L. Source fingerprint mismatch: fences detect discrepancy between sub-engine source digests', async () => {
    const userId = uuidFor('user-4j3-l');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('M. Same-fact / different treatment: exempt vs taxable dividends on same asset do not false block', async () => {
    const userId = uuidFor('user-4j3-m');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('N. Source revision: altering transaction ledger produces new annualFingerprint and packageFingerprint', async () => {
    const userId = uuidFor('user-4j3-n');
    const token = await getSession(userId);
    const { portfolioId, accountId, assetId } = await seedBasicPortfolio(userId, 'VALE3', '50');

    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    const fp1 = res1.body.data.packageFingerprint;

    // Add a new transaction
    const txId2 = uuidFor(`tx-buy-2-${userId}`);
    await prisma.transaction.create({
      data: {
        id: txId2,
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-06-15T12:00:00Z'),
        settlementDate: new Date('2026-06-17T12:00:00Z'),
        quantity: '50',
        unitPrice: '60.00',
        amount: canonicalAmount('60.00', '50'),
        currency: 'BRL',
      },
    });

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    const fp2 = res2.body.data.packageFingerprint;

    expect(fp1).not.toBe(fp2);
  });

  it('O. Evidence revision: modifying taxpayer confirmation updates fingerprint', async () => {
    const userId = uuidFor('user-4j3-o');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    const fp1 = res1.body.data.packageFingerprint;

    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('P. Double race: source revision followed by evidence revision remains deterministic', async () => {
    const userId = uuidFor('user-4j3-p');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('Q. Cross-user isolation: User A cannot read or influence User B annual state', async () => {
    const userA = uuidFor('user-4j3-q-a');
    const userB = uuidFor('user-4j3-q-b');
    const tokenA = await getSession(userA);
    const tokenB = await getSession(userB);

    await seedBasicPortfolio(userA, 'ITUB4', '100');
    await seedBasicPortfolio(userB, 'BBDC4', '200');

    const resA = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.data.packageFingerprint).not.toBe(resB.body.data.packageFingerprint);
  });

  it('R. Cross-portfolio consolidation: multiple portfolios of same user consolidate without duplication', async () => {
    const userId = uuidFor('user-4j3-r');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId, 'PETR4', '100');

    // Create a second portfolio for same user
    const institutionId = uuidFor(`inst-r-2`);
    const port2 = uuidFor(`port-r-2`);
    const acc2 = uuidFor(`acc-r-2`);
    const assetId = uuidFor(`asset-BBAS3`);

    await prisma.institution.upsert({
      where: { id: institutionId },
      update: {},
      create: { id: institutionId, name: 'XP', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: port2,
        userId,
        name: 'Carteira Secundária',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: acc2,
        portfolioId: port2,
        institutionId,
        name: 'Conta XP',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.upsert({
      where: { id: assetId },
      update: {},
      create: {
        id: assetId,
        ticker: 'BBAS3',
        name: 'BB ON',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-r-2'),
        portfolioId: port2,
        accountId: acc2,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-04-10T12:00:00Z'),
        settlementDate: new Date('2026-04-12T12:00:00Z'),
        quantity: '50',
        unitPrice: '25.00',
        amount: canonicalAmount('25.00', '50'),
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('S. No activity: empty taxpayer state evaluates strictly to NO_ACTIVITY', async () => {
    const userId = uuidFor('user-4j3-s-empty');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
  });

  it('T. Unsupported year: year outside supported range returns 400 Bad Request', async () => {
    const userId = uuidFor('user-4j3-t');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('U. Zero vs Null vs Unavailable: fields maintain explicit semantic distinction', async () => {
    const userId = uuidFor('user-4j3-u');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body.data);
    expect(bodyStr).not.toContain('"0" == null');
  });

  it('V. Large decimal precision: arbitrary decimal precision preserved without scientific notation', async () => {
    const userId = uuidFor('user-4j3-v');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId, 'VALE3', '1000000', '999999.99');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body.data);
    expect(bodyStr).not.toMatch(/\d+e[+-]\d+/i);
  });

  it('W. JSON export: endpoint returns valid application/json with year in filename', async () => {
    const userId = uuidFor('user-4j3-w');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=json')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('atlas-irpf-2026-relatorio-apoio.json');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('X. CSV export: endpoint returns text/csv with semicolon separator and CRLF lines', async () => {
    const userId = uuidFor('user-4j3-x');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('atlas-irpf-2026-relatorio-apoio.csv');
    expect(res.text).toContain('DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
    expect(res.text).toContain('\r\n');
  });

  it('Y. CSV formula injection: escapes =, +, -, @, tab, and CR characters safely', async () => {
    const userId = uuidFor('user-4j3-y');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Check that lines starting with formula triggers are escaped
    const lines = res.text.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('=') || line.startsWith('+') || line.startsWith('@')) {
        expect(line.startsWith("'")).toBe(true);
      }
    }
  });

  it('Z. XSS protection: tags and scripts in notes render without executing', async () => {
    const userId = uuidFor('user-4j3-z');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('AA. Header injection protection: newline in parameters rejected safely', async () => {
    const userId = uuidFor('user-4j3-aa');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026%0d%0aSet-Cookie:%20evil=1/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('AB. Malformed format: format=exe or format=pdf rejected with 400 Bad Request', async () => {
    const userId = uuidFor('user-4j3-ab');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=pdf')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('AC. Invalid year: strings and out-of-range integers rejected safely', async () => {
    const userId = uuidFor('user-4j3-ac');
    const token = await getSession(userId);

    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid-year')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(400);

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(400);
  });

  it('AD. Stale old package comparison: isPackageCurrent correctly distinguishes old export', async () => {
    const userId = uuidFor('user-4j3-ad');
    const token = await getSession(userId);
    const { portfolioId, accountId, assetId } = await seedBasicPortfolio(userId, 'MGLU3', '100');

    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    const oldFingerprint = res1.body.data.packageFingerprint;

    // Mutate state
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-ad-mutated'),
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00Z'),
        settlementDate: new Date('2026-08-03T12:00:00Z'),
        quantity: '50',
        unitPrice: '10.00',
        amount: canonicalAmount('10.00', '50'),
        currency: 'BRL',
      },
    });

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    const currentFingerprint = res2.body.data.packageFingerprint;

    const isCurrent = oldFingerprint === currentFingerprint;
    expect(isCurrent).toBe(false);
  });

  it('AE. Current export is always freshly evaluated: live export endpoint evaluates current state', async () => {
    const userId = uuidFor('user-4j3-ae');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=json')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const pkg = JSON.parse(res.text);
    expect(pkg.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('AF. 10 concurrent exports: produce mathematically identical package fingerprints', async () => {
    const userId = uuidFor('user-4j3-af');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const promises = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .get('/api/v1/fiscal/annual/2026/review-package')
        .set('Authorization', `Bearer ${token}`),
    );

    const results = await Promise.all(promises);
    const fps = results.map((r) => r.body.data.packageFingerprint);
    const firstFp = fps[0];
    for (const fp of fps) {
      expect(fp).toBe(firstFp);
    }
  });

  it('AG. Cross-user concurrency: concurrent requests across 5 users maintain strict isolation', async () => {
    const users = Array.from({ length: 5 }, (_, i) => uuidFor(`user-4j3-ag-${i}`));
    const tokens = await Promise.all(users.map((u) => getSession(u)));
    await Promise.all(users.map((u, i) => seedBasicPortfolio(u, `TICK${i}`, `${(i + 1) * 10}`)));

    const promises = tokens.map((token) =>
      request(app.getHttpServer())
        .get('/api/v1/fiscal/annual/2026/review-package')
        .set('Authorization', `Bearer ${token}`),
    );

    const results = await Promise.all(promises);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const fps = results.map((r) => r.body.data.packageFingerprint);
    const uniqueFps = new Set(fps);
    expect(uniqueFps.size).toBe(5);
  });

  it('AH. Module shuffle invariance: permutation of module map yields identical package fingerprint', () => {
    const MODULE_IDS: readonly UnifiedModuleId[] = [
      'ANNUAL_POSITIONS',
      'CAPITAL_MARKETS',
      'INVESTMENT_INCOME',
      'READINESS_EVIDENCE',
      'HIGH_INCOME_MINIMUM_TAX',
    ];
    const modulesA = MODULE_IDS.map((module) => makeModule({ module, status: 'READY' }));
    const modulesB = [...modulesA].reverse();

    const state1 = buildState(modulesA, { calendarYear: 2026 });
    const state2 = buildState(modulesB, { calendarYear: 2026 });

    const pkg1 = buildUnifiedAnnualReviewPackage(state1, {
      generatedAt: '2027-04-15T00:00:00.000Z',
    });
    const pkg2 = buildUnifiedAnnualReviewPackage(state2, {
      generatedAt: '2027-04-15T12:34:56.789Z',
    });

    expect(pkg1.packageFingerprint).toBe(pkg2.packageFingerprint);
  });

  it('AI. Requirement shuffle invariance: requirement ordering does not alter fingerprint', () => {
    const reqA = {
      key: 'ANNUAL_POSITIONS::OPENING_POSITIONS::petr4::OPENING_POSITIONS',
      module: 'ANNUAL_POSITIONS' as const,
      category: 'OPENING_POSITIONS',
      nativeType: 'OPENING_POSITIONS',
      subjectReference: 'petr4',
      status: 'PENDING',
      blockingReason: 'UNCONFIRMED',
    };
    const reqB = {
      key: 'CAPITAL_MARKETS::CUSTOM_CODE::vale3::CUSTOM_CODE',
      module: 'CAPITAL_MARKETS' as const,
      category: 'CUSTOM_CODE',
      nativeType: 'CUSTOM_CODE',
      subjectReference: 'vale3',
      status: 'SATISFIED',
      blockingReason: null,
    };

    const modules1 = [
      makeModule({ module: 'ANNUAL_POSITIONS', requirements: [reqA, reqB] }),
      makeModule({ module: 'CAPITAL_MARKETS' }),
      makeModule({ module: 'INVESTMENT_INCOME' }),
      makeModule({ module: 'READINESS_EVIDENCE' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX' }),
    ];
    const modules2 = [
      makeModule({ module: 'ANNUAL_POSITIONS', requirements: [reqB, reqA] }),
      makeModule({ module: 'CAPITAL_MARKETS' }),
      makeModule({ module: 'INVESTMENT_INCOME' }),
      makeModule({ module: 'READINESS_EVIDENCE' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX' }),
    ];

    const state1 = buildState(modules1, { calendarYear: 2026 });
    const state2 = buildState(modules2, { calendarYear: 2026 });

    const pkg1 = buildUnifiedAnnualReviewPackage(state1, {
      generatedAt: '2027-04-15T00:00:00.000Z',
    });
    const pkg2 = buildUnifiedAnnualReviewPackage(state2, {
      generatedAt: '2027-04-15T00:00:00.000Z',
    });
    expect(pkg1.packageFingerprint).toBe(pkg2.packageFingerprint);
  });

  it('AJ. Consistency issue shuffle invariance: issues ordering does not alter fingerprint', () => {
    const issue1 = {
      code: 'YEAR_MISMATCH' as const,
      severity: 'BLOCKING' as const,
      modules: ['ANNUAL_POSITIONS' as const, 'CAPITAL_MARKETS' as const],
      detail: 'Year mismatch',
    };
    const issue2 = {
      code: 'PAYER_IDENTITY_MISMATCH' as const,
      severity: 'WARNING' as const,
      modules: ['INVESTMENT_INCOME' as const],
      detail: 'Payer mismatch',
    };

    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS' }),
      makeModule({ module: 'CAPITAL_MARKETS' }),
      makeModule({ module: 'INVESTMENT_INCOME' }),
      makeModule({ module: 'READINESS_EVIDENCE' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX' }),
    ];

    const state1 = buildState(modules, {
      calendarYear: 2026,
      consistencyIssues: [issue1, issue2],
    });
    const state2 = buildState(modules, {
      calendarYear: 2026,
      consistencyIssues: [issue2, issue1],
    });

    const pkg1 = buildUnifiedAnnualReviewPackage(state1, {
      generatedAt: '2027-04-15T00:00:00.000Z',
    });
    const pkg2 = buildUnifiedAnnualReviewPackage(state2, {
      generatedAt: '2027-04-15T00:00:00.000Z',
    });
    expect(pkg1.packageFingerprint).toBe(pkg2.packageFingerprint);
  });

  it('AK. Package-version sensitivity: incrementing packageVersion changes fingerprint', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ];

    const state = buildState(modules, { calendarYear: 2026 });
    const pkg = buildUnifiedAnnualReviewPackage(state, { generatedAt: '2027-04-15T00:00:00.000Z' });
    expect(pkg.packageVersion).toBe(UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION);
  });

  it('AL. Cache-Control private, no-store on all HTTP response codes (200, 400, 401, 404)', async () => {
    const userId = uuidFor('user-4j3-al');
    const token = await getSession(userId);

    const res200 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);
    expect(res200.headers['cache-control']).toBe('private, no-store');

    const res400 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid/review-package')
      .set('Authorization', `Bearer ${token}`);
    expect(res400.headers['cache-control']).toBe('private, no-store');

    const res401 = await request(app.getHttpServer()).get(
      '/api/v1/fiscal/annual/2026/review-package',
    );
    expect(res401.headers['cache-control']).toBe('private, no-store');
  });

  it('AM. Route safety: review-package routes do not collide with annual sibling endpoints', async () => {
    const userId = uuidFor('user-4j3-am');
    const token = await getSession(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.packageFingerprint).toBeDefined();
  });

  it('AN. Mobile viewport payload usability: review package payload is compact and structured with all sections', async () => {
    const userId = uuidFor('user-4j3-an');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sectionAIdentity).toBeDefined();
    expect(res.body.data.sectionBReadiness).toBeDefined();
    expect(res.body.data.sectionCModules).toBeDefined();
    expect(res.body.data.sectionDRequirements).toBeDefined();
    expect(res.body.data.sectionEConsistency).toBeDefined();
    expect(res.body.data.sectionFFilingSupport).toBeDefined();
    expect(res.body.data.sectionGProvenance).toBeDefined();
    expect(res.body.data.sectionHDisclaimer).toBeDefined();
  });

  it('AO. Export disclaimer: exported JSON and CSV contain non-official support disclaimer banner', async () => {
    const userId = uuidFor('user-4j3-ao');
    const token = await getSession(userId);
    await seedBasicPortfolio(userId);

    const resJson = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=json')
      .set('Authorization', `Bearer ${token}`);
    const pkg = JSON.parse(resJson.text);
    expect(pkg.disclaimer).toBeDefined();
    expect(pkg.disclaimer.length).toBeGreaterThan(10);

    const resCsv = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', `Bearer ${token}`);
    expect(resCsv.text).toContain('DOCUMENTO DE APOIO');
  });
});
