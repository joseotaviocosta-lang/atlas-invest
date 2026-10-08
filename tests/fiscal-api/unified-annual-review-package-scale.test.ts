import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { uuidFor } from '../tax-engine/helpers';
import { buildUnifiedAnnualReviewPackage } from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from '../tax-engine/unified-annual-helpers';
import type { UnifiedRequirement } from '../../packages/tax-engine/src/annual-irpf';

/**
 * Phase 4J.2 — review-package scale: pure assembly at 100/1k/10k requirements
 * and issues, plus real-service package overhead versus the unified GET.
 *
 * Timing/memory numbers are performance telemetry only, never financial math.
 */

interface QueryLog {
  readonly query: string;
  readonly params: string;
}

const recordedQueries: QueryLog[] = [];
let prisma: PrismaClient;

async function buildApp(today: string): Promise<INestApplication> {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
    log: [{ emit: 'event', level: 'query' }],
  });
  prisma.$on('query' as never, (e: { query: string; params: string }) => {
    recordedQueries.push({ query: e.query, params: e.params });
  });
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
        name: 'Package Scale',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

function categorize(query: string): string {
  if (query.includes('"high_income_evidence_records"')) return 'evidence';
  if (query.includes('"transactions"')) return 'ledger';
  if (query.includes('"portfolios"')) return 'portfolios';
  if (query.includes('"assets"')) return 'assets';
  if (query.includes('"accounts"')) return 'accounts';
  if (query.includes('"sessions"')) return 'auth';
  if (query.includes('"tax_obligations"')) return 'obligations';
  if (query.includes('"tax_') || query.includes('"federal_tax_')) return 'monthly-fiscal';
  return 'other';
}

function appQueryCount(): number {
  return recordedQueries.filter((q) => categorize(q.query) !== 'other').length;
}

function syntheticRequirements(n: number): UnifiedRequirement[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `READINESS_EVIDENCE::CAT${i % 50}::subj-${i}::CAT${i % 50}`,
    module: 'READINESS_EVIDENCE' as const,
    category: `CAT${i % 50}`,
    nativeType: `CAT${i % 50}`,
    subjectReference: `subj-${i}`,
    status: i % 3 === 0 ? 'SATISFIED' : 'PENDING',
    blockingReason: i % 3 === 0 ? null : 'MISSING_CONFIRMATION',
  }));
}

describe('Phase 4J.2 — review-package scale', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-04-10');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await cleanDatabase();
    recordedQueries.length = 0;
  });

  it('pure assembly scales linearly over 100/1k/10k requirements and issues', async () => {
    for (const n of [100, 1000, 10000]) {
      const requirements = syntheticRequirements(n);
      const issues = Array.from({ length: n }, (_, i) => ({
        code: 'SOURCE_FINGERPRINT_MISMATCH' as const,
        severity: 'BLOCKING' as const,
        modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'] as const,
        detail: `detail-${i}`,
      }));
      const state = buildState(
        [
          makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
          makeModule({
            module: 'READINESS_EVIDENCE',
            status: 'PARTIAL',
            requirements,
          }),
        ],
        { consistencyIssues: issues },
      );
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
      const start = process.hrtime.bigint();
      const pkg = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-10T00:00:00.000Z',
      });
      const msAssembly = Number(process.hrtime.bigint() - start) / 1e6;
      const startJson = process.hrtime.bigint();
      const json = JSON.stringify(pkg);
      const msJson = Number(process.hrtime.bigint() - startJson) / 1e6;
      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      expect(pkg.sectionDRequirements.requirements).toHaveLength(n);
      expect(pkg.sectionEConsistency.issues).toHaveLength(n);
      expect(pkg.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);
      // eslint-disable-next-line no-console
      console.log(
        `[4J.2 package-scale n=${n}] assemblyMs=${msAssembly} jsonMs=${msJson} jsonBytes=${json.length} memDeltaMb=${memAfter - memBefore}`,
      );
      expect(msAssembly).toBeLessThan(5000);
    }
  }, 300000);

  it('real-service package overhead over the unified GET is serialization-only (zero added queries)', async () => {
    const userId = uuidFor('user-rp-scale');
    const token = await session(userId);
    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('pf-rp-scale'),
        userId,
        name: 'PF scale',
        type: 'PERSONAL',
        status: 'ACTIVE',
        baseCurrency: 'BRL',
      },
    });
    const institution = await prisma.institution.create({
      data: { id: uuidFor('inst-rp-scale'), name: 'Broker', type: 'BROKER', country: 'BR' },
    });
    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-rp-scale'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Acc',
        status: 'ACTIVE',
        currency: 'BRL',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: uuidFor('asset-rp-scale'),
        ticker: 'PETR4',
        name: 'PETR4 SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-rp-scale'),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-05-15T00:00:00Z'),
        settlementDate: new Date('2026-05-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '10000.00',
        currency: 'BRL',
      },
    });
    const server = app.getHttpServer();
    // Warmups (JIT + pool).
    await request(server).get('/api/v1/fiscal/annual/2026').set('Authorization', `Bearer ${token}`);
    await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`);

    recordedQueries.length = 0;
    const startUnified = process.hrtime.bigint();
    await request(server)
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const msUnified = Number(process.hrtime.bigint() - startUnified) / 1e6;
    const unifiedQueries = appQueryCount();

    recordedQueries.length = 0;
    const startPackage = process.hrtime.bigint();
    const pkgRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const msPackage = Number(process.hrtime.bigint() - startPackage) / 1e6;
    const packageQueries = appQueryCount();

    recordedQueries.length = 0;
    const startExport = process.hrtime.bigint();
    await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const msExport = Number(process.hrtime.bigint() - startExport) / 1e6;
    const exportQueries = appQueryCount();

    // The package layer adds NO queries: same composed unified load, plus
    // pure in-memory assembly/serialization.
    expect(packageQueries).toBe(unifiedQueries);
    expect(exportQueries).toBe(unifiedQueries);
    expect(pkgRes.body.data.sectionCModules.modules).toHaveLength(5);
    // eslint-disable-next-line no-console
    console.log(
      `[4J.2 package-overhead] unifiedMs=${msUnified} packageMs=${msPackage} exportMs=${msExport} queries=${unifiedQueries}`,
    );
  }, 300000);

  it('concurrent package exports of the same state share one fingerprint', async () => {
    const userId = uuidFor('user-rp-conc');
    const token = await session(userId);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/fiscal/annual/2026/review-package')
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
      ),
    );
    const fingerprints = new Set(results.map((r) => r.body.data.packageFingerprint as string));
    expect(fingerprints.size).toBe(1);
  }, 300000);
});
