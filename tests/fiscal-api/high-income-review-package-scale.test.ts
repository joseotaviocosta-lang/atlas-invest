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
        name: 'Scale User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

const TICKERS = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'WEGE3', 'RENT3', 'LREN3', 'PRIO3'];

/**
 * Seeds `payerCount` dividend payers (each with a dividend transaction) and
 * `factCount - payerCount` extra non-income transactions as ledger "facts" to
 * exercise ledger scale independently of payer count.
 */
async function setupScaleCase(
  tag: string,
  payerCount: number,
  factCount: number,
): Promise<{ token: string }> {
  const userId = uuidFor(`user-rp-scale-${tag}`);
  const token = await session(userId);
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-rp-scale-${tag}`),
      userId,
      name: `Scale ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: {
      id: uuidFor(`inst-rp-scale-${tag}`),
      name: `Broker ${tag}`,
      type: 'BROKER',
      country: 'BR',
    },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-rp-scale-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });

  const payerAssetIds: string[] = [];
  for (let p = 0; p < payerCount; p++) {
    const ticker = TICKERS[p % TICKERS.length]!;
    const asset = await prisma.asset.create({
      data: {
        id: uuidFor(`asset-rp-scale-${tag}-${p}`),
        ticker: `${ticker}${p}`,
        name: `${ticker} ${p}`,
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    payerAssetIds.push(asset.id);
    await prisma.transaction.create({
      data: {
        id: uuidFor(`tx-rp-scale-div-${tag}-${p}`),
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

  // Extra ledger facts (benign BUYs) to grow the ledger beyond payer count.
  const extra = Math.max(0, factCount - payerCount);
  const anchorAsset = payerAssetIds[0];
  if (anchorAsset && extra > 0) {
    const data = Array.from({ length: extra }, (_, i) => ({
      id: uuidFor(`tx-rp-scale-fact-${tag}-${i}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: anchorAsset,
      type: 'BUY' as const,
      tradeDate: new Date('2026-02-01T00:00:00Z'),
      settlementDate: new Date('2026-02-03T00:00:00Z'),
      quantity: '1',
      unitPrice: '1.00',
      amount: '1.00',
      currency: 'BRL',
    }));
    // Chunked createMany to avoid oversized statements.
    const CHUNK = 1000;
    for (let i = 0; i < data.length; i += CHUNK) {
      await prisma.transaction.createMany({ data: data.slice(i, i + CHUNK) });
    }
  }

  return { token };
}

function categorize(query: string): string {
  if (query.includes('"high_income_evidence_records"')) return 'evidence';
  if (query.includes('"transactions"')) return 'ledger';
  if (query.includes('"portfolios"')) return 'portfolios';
  if (query.includes('"assets"')) return 'assets';
  if (query.includes('"accounts"')) return 'accounts';
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

const REVIEW = '/api/v1/fiscal/annual/2026/high-income/review';
const EXPORT = '/api/v1/fiscal/annual/2026/high-income/export?format=csv';

describe('API Scale: High-Income Review/Support Package (Phase 4I.6)', () => {
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

  it('review query shapes are payer-count invariant across 100 / 1k payers (no N+1)', async () => {
    const small = await setupScaleCase('p100', 100, 100);
    recordedQueries.length = 0;
    const t0 = Date.now();
    await request(app.getHttpServer())
      .get(REVIEW)
      .set('Authorization', `Bearer ${small.token}`)
      .expect(200);
    const smallQueries = [...recordedQueries];
    const smallMs = Date.now() - t0;

    await cleanDatabase();
    const big = await setupScaleCase('p1k', 1000, 1000);
    recordedQueries.length = 0;
    const t1 = Date.now();
    await request(app.getHttpServer())
      .get(REVIEW)
      .set('Authorization', `Bearer ${big.token}`)
      .expect(200);
    const bigQueries = [...recordedQueries];
    const bigMs = Date.now() - t1;

    const smallBy = countBy(smallQueries);
    const bigBy = countBy(bigQueries);

    // Evidence access stays bulk + constant (list + 2 watermark reads).
    expect(smallBy.get('evidence')).toBe(3);
    expect(bigBy.get('evidence')).toBe(3);
    // No per-payer (N+1) growth: a 900-payer increase must not grow the query
    // count proportionally. Allow a tiny constant slack for infra/planner reads.
    expect(Math.abs(bigQueries.length - smallQueries.length)).toBeLessThanOrEqual(3);
    expect(bigBy.get('ledger')).toBe(smallBy.get('ledger'));

    // eslint-disable-next-line no-console
    console.log(
      `[4I.6 review scale] 100p=${smallMs}ms(${smallQueries.length}q) 1kp=${bigMs}ms(${bigQueries.length}q)`,
    );
  });

  it('export query shapes are fact-count invariant across 1k / 10k facts (bounded)', async () => {
    const small = await setupScaleCase('f1k', 20, 1000);
    recordedQueries.length = 0;
    const t0 = Date.now();
    await request(app.getHttpServer())
      .get(EXPORT)
      .set('Authorization', `Bearer ${small.token}`)
      .expect(200);
    const smallQueries = [...recordedQueries];
    const smallMs = Date.now() - t0;

    await cleanDatabase();
    const big = await setupScaleCase('f10k', 20, 10000);
    recordedQueries.length = 0;
    const t1 = Date.now();
    await request(app.getHttpServer())
      .get(EXPORT)
      .set('Authorization', `Bearer ${big.token}`)
      .expect(200);
    const bigQueries = [...recordedQueries];
    const bigMs = Date.now() - t1;

    // The ledger read is a single bulk query regardless of fact count.
    expect(countBy(smallQueries).get('evidence')).toBe(3);
    expect(countBy(bigQueries).get('evidence')).toBe(3);
    // No per-fact (N+1) growth: a 9,000-fact increase must not grow the query
    // count proportionally. Allow a tiny constant slack for infra/planner reads.
    expect(Math.abs(bigQueries.length - smallQueries.length)).toBeLessThanOrEqual(3);
    expect(countBy(bigQueries).get('ledger')).toBe(countBy(smallQueries).get('ledger'));

    // eslint-disable-next-line no-console
    console.log(
      `[4I.6 export scale] 1kf=${smallMs}ms(${smallQueries.length}q) 10kf=${bigMs}ms(${bigQueries.length}q)`,
    );
  }, 60000);
});
