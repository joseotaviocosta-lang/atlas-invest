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
        name: 'Budget User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

const TICKERS = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'WEGE3', 'RENT3', 'LREN3', 'PRIO3'];

async function setupCase(tag: string, payerCount: number): Promise<{ token: string }> {
  const userId = uuidFor(`user-hi-budget-${tag}`);
  const token = await session(userId);
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-hi-budget-${tag}`),
      userId,
      name: `Budget ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: {
      id: uuidFor(`inst-hi-budget-${tag}`),
      name: `Broker ${tag}`,
      type: 'BROKER',
      country: 'BR',
    },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-hi-budget-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Account ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  for (let p = 0; p < payerCount; p++) {
    const ticker = TICKERS[p % TICKERS.length]!;
    const asset = await prisma.asset.create({
      data: {
        id: uuidFor(`asset-hi-budget-${tag}-${p}`),
        ticker: `${ticker}${p}`,
        name: `${ticker} ${p}`,
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    await prisma.transaction.create({
      data: {
        id: uuidFor(`tx-hi-budget-${tag}-${p}`),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-05-15T00:00:00Z'),
        settlementDate: new Date('2026-05-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '100000.00',
        currency: 'BRL',
      },
    });
    await prisma.highIncomeEvidenceRecord.create({
      data: {
        taxSubjectId: userId,
        calendarYear: 2026,
        payerKey: `${ticker}${p}`,
        payerId: `${ticker}${p}`,
        evidenceType: 'CORPORATE_TAX',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        evidenceMode: 'FULL',
        accountingProfit: '800000.00',
        irDue: '200000.00',
        csllDue: '68000.00',
        authority: 'AUTHORITATIVE',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        conflictStatus: 'NONE',
        upstreamFingerprint: 'pin',
        sourceFingerprint: `fp-${tag}-${p}`,
        revision: 1,
        fingerprint: `fp-full-${tag}-${p}`,
        createdByPrincipal: userId,
      },
    });
  }
  return { token };
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

describe('Phase 4I.4 — Annual High-Income Query Budget (Real App Path)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-03-15');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await cleanDatabase();
    recordedQueries.length = 0;
  });

  it('query count is payer-count invariant: 1 payer vs 5 payers execute identical query shapes', async () => {
    const one = await setupCase('one', 1);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${one.token}`)
      .expect(200);
    const onePayer = [...recordedQueries];

    await cleanDatabase();
    recordedQueries.length = 0;
    const five = await setupCase('five', 5);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${five.token}`)
      .expect(200);
    const fivePayer = [...recordedQueries];

    const countBy = (logs: QueryLog[]) => {
      const map = new Map<string, number>();
      for (const entry of logs) {
        const category = categorize(entry.query);
        map.set(category, (map.get(category) ?? 0) + 1);
      }
      return map;
    };
    const oneBy = countBy(onePayer);
    const fiveBy = countBy(fivePayer);

    // Evidence access is bulk and constant: exactly list(1) + watermark(2).
    expect(oneBy.get('evidence')).toBe(3);
    expect(fiveBy.get('evidence')).toBe(3);

    // No per-payer / per-evidence / per-income growth: identical query shapes.
    expect(fiveBy.get('ledger')).toBe(oneBy.get('ledger'));
    expect(fiveBy.get('assets')).toBe(oneBy.get('assets'));
    expect(fiveBy.get('portfolios')).toBe(oneBy.get('portfolios'));
    expect(fivePayer.length).toBe(onePayer.length);

    // Determinism: same setup shape yields the same total twice.
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${five.token}`)
      .expect(200);
    expect(recordedQueries.length).toBe(fivePayer.length);

    // Budget report (informational): categories and totals.
    // eslint-disable-next-line no-console
    console.log(
      `[4I.4 query-budget] total=${fivePayer.length} categories=${JSON.stringify(Object.fromEntries(fiveBy))}`,
    );
  });

  it('Phase 4I.6: /review loads the 4I.4 result ONCE — evidence access is bulk + payer-invariant', async () => {
    const one = await setupCase('rp-one', 1);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income/review')
      .set('Authorization', `Bearer ${one.token}`)
      .expect(200);
    const onePayer = [...recordedQueries];

    await cleanDatabase();
    recordedQueries.length = 0;
    const five = await setupCase('rp-five', 5);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income/review')
      .set('Authorization', `Bearer ${five.token}`)
      .expect(200);
    const fivePayer = [...recordedQueries];

    const countBy = (logs: QueryLog[]) => {
      const map = new Map<string, number>();
      for (const entry of logs) {
        const category = categorize(entry.query);
        map.set(category, (map.get(category) ?? 0) + 1);
      }
      return map;
    };
    const oneBy = countBy(onePayer);
    const fiveBy = countBy(fivePayer);

    // The 4I.4 result is loaded exactly once: evidence stays list(1)+watermark(2).
    expect(oneBy.get('evidence')).toBe(3);
    expect(fiveBy.get('evidence')).toBe(3);
    // No per-payer growth: review wraps the single 4I.4 load, no extra queries.
    expect(fivePayer.length).toBe(onePayer.length);
  });

  it('Phase 4I.6: /export?format=csv loads the 4I.4 result ONCE — same bounded shapes as /review', async () => {
    const five = await setupCase('rp-exp', 5);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income/review')
      .set('Authorization', `Bearer ${five.token}`)
      .expect(200);
    const reviewQueries = [...recordedQueries];

    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income/export?format=csv')
      .set('Authorization', `Bearer ${five.token}`)
      .expect(200);
    const exportQueries = [...recordedQueries];

    const countBy = (logs: QueryLog[]) => {
      const map = new Map<string, number>();
      for (const entry of logs) {
        const category = categorize(entry.query);
        map.set(category, (map.get(category) ?? 0) + 1);
      }
      return map;
    };
    // Export rebuilds the current package via the SAME single 4I.4 load.
    expect(countBy(exportQueries).get('evidence')).toBe(3);
    expect(exportQueries.length).toBe(reviewQueries.length);
  });
});
