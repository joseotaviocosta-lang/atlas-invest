import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { vi } from 'vitest';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { uuidFor } from '../tax-engine/helpers';
import { GetAnnualCapitalMarketSummaryUseCase } from '../../apps/api/src/application/fiscal/get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from '../../apps/api/src/application/fiscal/get-annual-investment-income-summary.use-case';

interface QueryLog {
  readonly query: string;
}

const recordedQueries: QueryLog[] = [];
let prisma: PrismaClient;

async function buildApp(today: string): Promise<INestApplication> {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
    log: [{ emit: 'event', level: 'query' }],
  });
  prisma.$on('query' as never, (e: { query: string }) => {
    recordedQueries.push({ query: e.query });
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

async function seedPortfolio(userId: string, tag: string, dividendCount: number): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-ub-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-ub-${tag}`), name: `B ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-ub-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `A ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-ub-${tag}`),
      ticker: `TCK${tag}`,
      name: `TCK ${tag}`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  const txs = Array.from({ length: dividendCount }, (_, i) => ({
    id: uuidFor(`tx-ub-${tag}-${i}`),
    portfolioId: portfolio.id,
    accountId: account.id,
    assetId: asset.id,
    type: 'DIVIDEND' as const,
    tradeDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    settlementDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    quantity: '0',
    unitPrice: '0',
    amount: '1000.00',
    currency: 'BRL',
  }));
  await prisma.transaction.createMany({ data: txs });
}

function categorize(query: string): string {
  if (query.includes('"transactions"')) return 'ledger';
  if (query.includes('"portfolios"')) return 'portfolios';
  if (query.includes('"assets"')) return 'assets';
  if (query.includes('"high_income_evidence_records"')) return 'evidence';
  if (query.includes('"taxpayer_confirmations"')) return 'confirmations';
  if (query.includes('"annual_opening_positions"')) return 'opening-positions';
  if (query.includes('"tax_obligations"')) return 'obligations';
  return 'other';
}

function countBy(logs: QueryLog[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of logs) {
    const category = categorize(entry.query);
    map.set(category, (map.get(category) ?? 0) + 1);
  }
  return map;
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

describe('Phase 4J.1 — Unified Annual Query Budget (Real App Path)', () => {
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

  it('query shape is transaction-count invariant: 2 vs 200 dividends -> identical ledger/portfolio query counts', async () => {
    const smallUser = uuidFor('u-ub-small');
    const smallToken = await session(smallUser);
    await seedPortfolio(smallUser, 'small', 2);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${smallToken}`)
      .expect(200);
    const small = [...recordedQueries];

    await cleanDatabase();
    recordedQueries.length = 0;
    const largeUser = uuidFor('u-ub-large');
    const largeToken = await session(largeUser);
    await seedPortfolio(largeUser, 'large', 200);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${largeToken}`)
      .expect(200);
    const large = [...recordedQueries];

    const smallBy = countBy(small);
    const largeBy = countBy(large);

    // Ledger / portfolio / asset query COUNTS must not grow with transaction count
    // (bounded reads; the per-portfolio replay reads the whole ledger once).
    expect(largeBy.get('ledger')).toBe(smallBy.get('ledger'));
    expect(largeBy.get('portfolios')).toBe(smallBy.get('portfolios'));
    expect(largeBy.get('assets') ?? 0).toBe(smallBy.get('assets') ?? 0);

    // eslint-disable-next-line no-console
    console.log(
      `[4J.1 query-budget] small total=${small.length} large total=${large.length} ` +
        `largeCategories=${JSON.stringify(Object.fromEntries(largeBy))}`,
    );
  });

  it('request-scoped memo collapses duplicate 4H.3/4H.4 use-case executions within each composed load', async () => {
    const userId = uuidFor('u-ub-memo');
    const token = await session(userId);
    await seedPortfolio(userId, 'memo', 4);

    // Spy on the actual DB-hitting `compute` of the CM and income use-cases. The
    // unified `load()` fires five loads concurrently (direct CM + direct income +
    // readiness [calls CM+income] + high-income [calls CM+income] + positions).
    // Without the in-flight memo, `compute` would run up to 3x per load() for
    // each of CM and income. The memo collapses the CONCURRENT duplicates so
    // `compute` runs exactly ONCE per load(); the outer fence performs two
    // load()s (before/after) by design, so a single request yields exactly 2
    // compute() calls per use-case — never the 6x of the un-memoized path.
    const cmUseCase = app.get(GetAnnualCapitalMarketSummaryUseCase);
    const incomeUseCase = app.get(GetAnnualInvestmentIncomeSummaryUseCase);
    const cmSpy = vi.spyOn(
      cmUseCase as unknown as { compute: (q: unknown) => Promise<unknown> },
      'compute',
    );
    const incomeSpy = vi.spyOn(
      incomeUseCase as unknown as { compute: (q: unknown) => Promise<unknown> },
      'compute',
    );

    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Exactly one compute() per composed load(); exactly two load()s per request
    // (the before/after fence pair). This is the collapsed shape — 2, not 6.
    expect(cmSpy).toHaveBeenCalledTimes(2);
    expect(incomeSpy).toHaveBeenCalledTimes(2);

    cmSpy.mockRestore();
    incomeSpy.mockRestore();
    // eslint-disable-next-line no-console
    console.log(
      `[4J.1 query-budget memo] cm.compute=2 income.compute=2 ledger reads=${countBy(recordedQueries).get('ledger')}`,
    );
  });

  it('positions fan-out ledger reads scale with portfolio count (explicit per-count budget), not transaction count', async () => {
    // One portfolio.
    const oneUser = uuidFor('u-ub-fan-one');
    const oneToken = await session(oneUser);
    await seedPortfolio(oneUser, 'one', 2);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${oneToken}`)
      .expect(200);
    const oneLedger = countBy(recordedQueries).get('ledger') ?? 0;

    // Three portfolios (same tiny transaction count each).
    await cleanDatabase();
    const threeUser = uuidFor('u-ub-fan-three');
    const threeToken = await session(threeUser);
    for (let i = 0; i < 3; i++) {
      await seedPortfolio(threeUser, `fan-${i}`, 2);
    }
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${threeToken}`)
      .expect(200);
    const threeLedger = countBy(recordedQueries).get('ledger') ?? 0;

    // Explicit budget: both loads do bounded ledger reads. The per-portfolio
    // positions fan-out (plus the income fan-out) means three portfolios issue
    // strictly MORE ledger reads than one, and the growth is bounded by the
    // portfolio-count delta — never by transaction count.
    expect(oneLedger).toBeGreaterThan(0);
    expect(threeLedger).toBeGreaterThan(oneLedger);
    // The three-portfolio ledger reads must not explode: a safe linear ceiling is
    // (perLoadFixedReads + perPortfolioReads * portfolios) across the two fenced
    // loads. With <= a handful of fixed reads per load, 3 portfolios stay well
    // under this generous bound (guards against an accidental N^2 fan-out).
    expect(threeLedger).toBeLessThanOrEqual(oneLedger * 3 + 8);

    // eslint-disable-next-line no-console
    console.log(
      `[4J.1 query-budget fanout] 1-portfolio ledger=${oneLedger} 3-portfolio ledger=${threeLedger}`,
    );
  });

  it('an empty (no-portfolio) subject issues NO ledger/asset reads (fast-path budget)', async () => {
    const userId = uuidFor('u-ub-empty');
    const token = await session(userId);
    recordedQueries.length = 0;
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const by = countBy(recordedQueries);
    // No portfolios -> the income/positions fan-outs short-circuit; there is no
    // ledger or asset access at all for an inactive subject.
    expect(by.get('ledger') ?? 0).toBe(0);
    expect(by.get('assets') ?? 0).toBe(0);
    // The subject's own portfolio lookup still runs (bounded).
    expect(by.get('portfolios') ?? 0).toBeGreaterThan(0);
  });
});
