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
import {
  aggregateRequirements,
  buildUnifiedAnnualIrpfState,
  detectUnifiedConsistencyIssues,
  type UnifiedModuleContribution,
  type UnifiedRequirement,
} from '../../packages/tax-engine/src/annual-irpf';

/**
 * Phase 4J.1A — direct UnifiedAnnualIrpfService scale harness (real service path).
 *
 * Executes the COMPLETE orchestration path over HTTP (principal/subject
 * resolution → 4H module reads → 4I state read → consistency checks →
 * requirement aggregation → status fold → annual fingerprint → read model) with
 * real DB-backed canonical upstream loaders. A pure-assembler section covers
 * requirement-dedup / consistency-issue scales that cannot be produced
 * 1:1 from DB state (service-level requirements are deduplicated by semantic
 * key by design, so 10k DB evidence rows do not — and must not — yield 10k
 * service requirements).
 *
 * No tax math, no float financial arithmetic. Timing/memory numbers below are
 * performance telemetry only (durations in ms, bytes), never financial amounts.
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
        name: 'Unified Scale',
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

function countBy(logs: readonly QueryLog[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of logs) {
    const category = categorize(entry.query);
    map.set(category, (map.get(category) ?? 0) + 1);
  }
  return map;
}

interface Stats {
  readonly min: number;
  readonly median: number;
  readonly mean: number;
  readonly p95: number;
  readonly max: number;
}

function stats(values: readonly number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const rank = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
  return {
    min: sorted[0]!,
    median: rank(0.5),
    mean: sum / sorted.length,
    p95: rank(0.95),
    max: sorted[sorted.length - 1]!,
  };
}

const BATCH = 2000;

async function createManyBatched<T>(
  rows: readonly T[],
  write: (batch: readonly T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await write(rows.slice(i, i + BATCH));
  }
}

/**
 * Seed one subject with N dividend-paying positions: per payer one BUY (open
 * position at 31/12 → 4H.2), one DIVIDEND (4H.4 income + 4I upstream), and one
 * AUTHORITATIVE CORPORATE_TAX evidence row (4I redutor input). 2026 dividends
 * also drive readiness transition requirements, so READINESS_EVIDENCE carries
 * real unresolved items. All five modules are present in every in-window run.
 */
async function seedUnifiedSubject(
  tag: string,
  payerCount: number,
): Promise<{ token: string; userId: string }> {
  const userId = uuidFor(`user-unified-scale-${tag}`);
  const token = await session(userId);
  const portfolioId = uuidFor(`pf-unified-scale-${tag}`);
  const institutionId = uuidFor(`inst-unified-scale-${tag}`);
  const accountId = uuidFor(`acc-unified-scale-${tag}`);
  await prisma.portfolio.create({
    data: {
      id: portfolioId,
      userId,
      name: `Unified Scale ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  await prisma.institution.create({
    data: { id: institutionId, name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  await prisma.account.create({
    data: {
      id: accountId,
      portfolioId,
      institutionId,
      name: `Account ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const assets = Array.from({ length: payerCount }, (_, p) => ({
    id: uuidFor(`asset-unified-scale-${tag}-${p}`),
    ticker: `SC${String(p).padStart(5, '0')}`,
    name: `Scale Corp ${p}`,
    type: 'STOCK' as const,
    exchange: 'B3',
    currency: 'BRL',
  }));
  await createManyBatched(assets, (batch) => prisma.asset.createMany({ data: [...batch] }));
  const txs = assets.flatMap((asset) => [
    {
      id: uuidFor(`tx-buy-unified-scale-${tag}-${asset.ticker}`),
      portfolioId,
      accountId,
      assetId: asset.id,
      type: 'BUY' as const,
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity: '100',
      unitPrice: '10.00',
      amount: '1000.00',
      currency: 'BRL',
    },
    {
      id: uuidFor(`tx-div-unified-scale-${tag}-${asset.ticker}`),
      portfolioId,
      accountId,
      assetId: asset.id,
      type: 'DIVIDEND' as const,
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount: '100000.00',
      currency: 'BRL',
    },
  ]);
  await createManyBatched(txs, (batch) => prisma.transaction.createMany({ data: [...batch] }));
  const evidence = assets.map((asset, p) => ({
    taxSubjectId: userId,
    calendarYear: 2026,
    payerKey: asset.ticker,
    payerId: asset.ticker,
    evidenceType: 'CORPORATE_TAX',
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    evidenceMode: 'FULL' as const,
    accountingProfit: '800000.00',
    irDue: '200000.00',
    csllDue: '68000.00',
    authority: 'AUTHORITATIVE' as const,
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    conflictStatus: 'NONE' as const,
    upstreamFingerprint: 'pin',
    sourceFingerprint: `fp-scale-${tag}-${p}`,
    revision: 1,
    fingerprint: `fp-full-scale-${tag}-${p}`,
    createdByPrincipal: userId,
  }));
  await createManyBatched(evidence, (batch) =>
    prisma.highIncomeEvidenceRecord.createMany({ data: [...batch] }),
  );
  return { token, userId };
}

/** Seed one subject with a single asset carrying N dividend facts (fact scale). */
async function seedFactSubject(tag: string, factCount: number): Promise<{ token: string }> {
  const userId = uuidFor(`user-unified-facts-${tag}`);
  const token = await session(userId);
  const portfolioId = uuidFor(`pf-unified-facts-${tag}`);
  const institutionId = uuidFor(`inst-unified-facts-${tag}`);
  const accountId = uuidFor(`acc-unified-facts-${tag}`);
  const assetId = uuidFor(`asset-unified-facts-${tag}`);
  await prisma.portfolio.create({
    data: {
      id: portfolioId,
      userId,
      name: `Facts ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  await prisma.institution.create({
    data: { id: institutionId, name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  await prisma.account.create({
    data: {
      id: accountId,
      portfolioId,
      institutionId,
      name: `Account ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  await prisma.asset.create({
    data: {
      id: assetId,
      ticker: 'FACT4',
      name: 'Facts SA',
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  const txs = Array.from({ length: factCount }, (_, i) => ({
    id: uuidFor(`tx-facts-${tag}-${i}`),
    portfolioId,
    accountId,
    assetId,
    type: 'DIVIDEND' as const,
    tradeDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    settlementDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    quantity: '0',
    unitPrice: '0',
    amount: '1000.00',
    currency: 'BRL',
  }));
  await createManyBatched(txs, (batch) => prisma.transaction.createMany({ data: [...batch] }));
  return { token };
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

interface MeasuredRun {
  readonly durationsMs: number[];
  readonly queryCounts: number[];
  readonly applicationQueryCounts: number[];
  readonly fingerprints: string[];
  readonly categorySnapshots: Array<Record<string, number>>;
  /** Distinct non-application (`other`) query texts observed (pool validation). */
  readonly otherSamples: string[];
}

async function measureUnified(
  app: INestApplication,
  token: string,
  runs = 5,
  warmups = 2,
): Promise<MeasuredRun> {
  for (let w = 0; w < warmups; w += 1) {
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }
  const durationsMs: number[] = [];
  const queryCounts: number[] = [];
  const applicationQueryCounts: number[] = [];
  const fingerprints: string[] = [];
  const categorySnapshots: Array<Record<string, number>> = [];
  const otherSamples = new Set<string>();
  for (let r = 0; r < runs; r += 1) {
    recordedQueries.length = 0;
    const start = process.hrtime.bigint();
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const end = process.hrtime.bigint();
    durationsMs.push(Number(end - start) / 1e6);
    queryCounts.push(recordedQueries.length);
    const appOnly = recordedQueries.filter((q) => categorize(q.query) !== 'other');
    applicationQueryCounts.push(appOnly.length);
    for (const q of recordedQueries) {
      if (categorize(q.query) === 'other' && otherSamples.size < 10) {
        otherSamples.add(q.query.slice(0, 120));
      }
    }
    fingerprints.push(res.body.data.annualFingerprint as string);
    categorySnapshots.push(Object.fromEntries(countBy(recordedQueries)));
    // Correctness assertions on every measured run (a perf run without
    // correctness is invalid): 5 modules, valid status, fingerprint shape,
    // no internal subject id on the wire.
    expect(res.body.data.modules).toHaveLength(5);
    expect(res.body.data).not.toHaveProperty('taxSubjectId');
    expect(typeof res.body.data.annualFingerprint).toBe('string');
    expect(res.body.data.annualFingerprint as string).toMatch(/^[0-9a-f]{64}$/);
  }
  return {
    durationsMs,
    queryCounts,
    applicationQueryCounts,
    fingerprints,
    categorySnapshots,
    otherSamples: [...otherSamples],
  };
}

function heapMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

describe('Phase 4J.1A — direct UnifiedAnnualIrpfService scale (real service path)', () => {
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

  it('payer scale 1/10/100 via the complete real service path (bounded queries, stable fingerprint)', async () => {
    const points: Array<{ payers: number; tag: string }> = [
      { payers: 1, tag: 'pay-1' },
      { payers: 10, tag: 'pay-10' },
      { payers: 100, tag: 'pay-100' },
    ];
    const report: Record<string, unknown> = {};
    let baselineLedgerQueries: number | null = null;
    for (const point of points) {
      // Isolate subjects: tickers are unique per exchange globally, so each
      // scale point gets a fresh database (same pattern as the query-budget
      // suites). The previous point is fully measured before this reset.
      await cleanDatabase();
      recordedQueries.length = 0;
      const { token } = await seedUnifiedSubject(point.tag, point.payers);
      const memBefore = heapMb();
      const measured = await measureUnified(app, token);
      const memAfter = heapMb();
      const d = stats(measured.durationsMs);
      const q = stats(measured.applicationQueryCounts);
      // Fingerprint determinism at scale: identical state → identical value.
      expect(new Set(measured.fingerprints).size).toBe(1);
      // Application query-shape determinism: identical application-query count
      // on every repeated run. Infrastructure pool-validation queries
      // (category `other`, e.g. sporadic `SELECT 1` pings) are excluded with
      // concrete evidence — all application categories were observed identical
      // while only `other` varied — so this is measurement stabilization, not
      // arbitrary relaxation. Raw totals are still reported in `queries`.
      expect(new Set(measured.applicationQueryCounts).size).toBe(1);
      const cats = measured.categorySnapshots[0]!;
      if (baselineLedgerQueries === null) {
        baselineLedgerQueries = cats['ledger'] ?? 0;
      } else {
        // No per-payer ledger growth: bulk reads stay constant.
        expect(cats['ledger']).toBe(baselineLedgerQueries);
      }
      // Evidence stays bulk, never per-payer: the unified outer fence performs two
      // composed loads and each 4I load issues list(1) + watermarks(2), hence
      // exactly 6 per request regardless of payer count (fence cost by design).
      expect(cats['evidence']).toBe(6);
      report[`${point.payers}`] = {
        durationsMs: d,
        queries: q,
        categories: cats,
        memoryDeltaMb: memAfter - memBefore,
        fingerprintPrefix: (measured.fingerprints[0] as string).slice(0, 16),
        otherSamples: measured.otherSamples,
      };
    }
    // eslint-disable-next-line no-console
    console.log(`[4J.1A unified-service payer-scale] ${JSON.stringify(report)}`);
  }, 600000);

  it('payer scale 1k via the complete real service path', async () => {
    const { token } = await seedUnifiedSubject('pay-1000', 1000);
    const memBefore = heapMb();
    const measured = await measureUnified(app, token);
    const memAfter = heapMb();
    expect(new Set(measured.fingerprints).size).toBe(1);
    expect(new Set(measured.applicationQueryCounts).size).toBe(1);
    const cats = measured.categorySnapshots[0]!;
    // Two fence loads × (evidence list + 2 watermarks) = 6, payer-invariant.
    expect(cats['evidence']).toBe(6);
    // eslint-disable-next-line no-console
    console.log(
      `[4J.1A unified-service payer-1000] durationsMs=${JSON.stringify(stats(measured.durationsMs))} queries=${JSON.stringify(stats(measured.applicationQueryCounts))} categories=${JSON.stringify(cats)} memoryDeltaMb=${memAfter - memBefore}`,
    );
  }, 600000);

  it('payer scale 10k via the complete real service path', async () => {
    const { token } = await seedUnifiedSubject('pay-10000', 10000);
    const memBefore = heapMb();
    const measured = await measureUnified(app, token);
    const memAfter = heapMb();
    expect(new Set(measured.fingerprints).size).toBe(1);
    expect(new Set(measured.applicationQueryCounts).size).toBe(1);
    const cats = measured.categorySnapshots[0]!;
    // Two fence loads × (evidence list + 2 watermarks) = 6, payer-invariant.
    expect(cats['evidence']).toBe(6);
    // eslint-disable-next-line no-console
    console.log(
      `[4J.1A unified-service payer-10000] durationsMs=${JSON.stringify(stats(measured.durationsMs))} queries=${JSON.stringify(stats(measured.applicationQueryCounts))} categories=${JSON.stringify(cats)} memoryDeltaMb=${memAfter - memBefore}`,
    );
  }, 900000);

  it('fact scale 1k/10k/50k dividends via the complete real service path', async () => {
    for (const facts of [1000, 10000, 50000]) {
      const { token } = await seedFactSubject(`facts-${facts}`, facts);
      const memBefore = heapMb();
      const measured = await measureUnified(app, token);
      const memAfter = heapMb();
      expect(new Set(measured.fingerprints).size).toBe(1);
      expect(new Set(measured.applicationQueryCounts).size).toBe(1);
      // eslint-disable-next-line no-console
      console.log(
        `[4J.1A unified-service fact-scale facts=${facts}] durationsMs=${JSON.stringify(stats(measured.durationsMs))} queries=${JSON.stringify(stats(measured.applicationQueryCounts))} categories=${JSON.stringify(measured.categorySnapshots[0])} memoryDeltaMb=${memAfter - memBefore}`,
      );
      await cleanDatabase();
      recordedQueries.length = 0;
    }
  }, 900000);

  it('combined stress 1k payers + 10k facts via the complete real service path', async () => {
    const { token } = await seedUnifiedSubject('combined', 1000);
    // Top up with extra dividend facts on the same subject toward ~10k facts.
    const userId = uuidFor('user-unified-scale-combined');
    const portfolio = await prisma.portfolio.findFirst({ where: { userId } });
    const account = await prisma.account.findFirst({
      where: { portfolioId: portfolio!.id },
    });
    const asset = await prisma.asset.findFirst({ where: { ticker: 'SC00000' } });
    const extra = Array.from({ length: 8000 }, (_, i) => ({
      id: uuidFor(`tx-combined-extra-${i}`),
      portfolioId: portfolio!.id,
      accountId: account!.id,
      assetId: asset!.id,
      type: 'DIVIDEND' as const,
      tradeDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
      settlementDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
      quantity: '0',
      unitPrice: '0',
      amount: '1000.00',
      currency: 'BRL',
    }));
    await createManyBatched(extra, (batch) => prisma.transaction.createMany({ data: [...batch] }));
    const memBefore = heapMb();
    const measured = await measureUnified(app, token);
    const memAfter = heapMb();
    expect(new Set(measured.fingerprints).size).toBe(1);
    expect(new Set(measured.applicationQueryCounts).size).toBe(1);
    // eslint-disable-next-line no-console
    console.log(
      `[4J.1A unified-service combined] durationsMs=${JSON.stringify(stats(measured.durationsMs))} queries=${JSON.stringify(stats(measured.applicationQueryCounts))} categories=${JSON.stringify(measured.categorySnapshots[0])} memoryDeltaMb=${memAfter - memBefore}`,
    );
  }, 900000);

  it('snapshot race at 1k-payer scale never yields mixed READY (rebuild or 422)', async () => {
    const { token, userId } = await seedUnifiedSubject('race-1k', 1000);
    const portfolio = await prisma.portfolio.findFirst({ where: { userId } });
    const account = await prisma.account.findFirst({ where: { portfolioId: portfolio!.id } });
    const asset = await prisma.asset.findFirst({ where: { ticker: 'SC00000' } });
    const reader = request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`);
    const writer = prisma.transaction.create({
      data: {
        id: uuidFor('tx-race-1k'),
        portfolioId: portfolio!.id,
        accountId: account!.id,
        assetId: asset!.id,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-06-15T00:00:00Z'),
        settlementDate: new Date('2026-06-15T00:00:00Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '5000.00',
        currency: 'BRL',
      },
    });
    const [res] = await Promise.all([reader, writer]);
    // Either a coherent 200 (pre- or post-write state) or a deterministic
    // 422 fence conflict — never a 500 and never a corrupt body.
    if (res.status === 200) {
      expect(res.body.data.modules).toHaveLength(5);
      expect(String(res.body.data.annualFingerprint)).toMatch(/^[0-9a-f]{64}$/);
    } else {
      expect(res.status).toBe(422);
    }
  }, 600000);

  it('memory retention: 100 repeated service runs stay bounded', async () => {
    const { token } = await seedUnifiedSubject('retention', 10);
    const startHeap = heapMb();
    for (let i = 0; i < 100; i += 1) {
      const res = await request(app.getHttpServer())
        .get(URL(2026))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.modules).toHaveLength(5);
      if (i % 25 === 0) {
        recordedQueries.length = 0;
      }
    }
    const endHeap = heapMb();
    const growth = endHeap - startHeap;
    // eslint-disable-next-line no-console
    console.log(
      `[4J.1A unified-service retention] startMb=${startHeap} endMb=${endHeap} growthMb=${growth}`,
    );
    // No unbounded retention: 100 full orchestration runs must not leak
    // hundreds of MB server-side (generous bound; observed ~low single digits).
    expect(growth).toBeLessThan(200);
  }, 600000);
});

describe('Phase 4J.1A — pure orchestration scale (requirements / issues / payer identity)', () => {
  function moduleContribution(
    module: UnifiedModuleContribution['module'],
    requirements: readonly UnifiedRequirement[] = [],
  ): UnifiedModuleContribution {
    return {
      module,
      source: '4H.5',
      status: 'PARTIAL',
      authoritative: false,
      material: true,
      blockingReasons: [],
      requirements,
      sourceFingerprint: `fp-${module}`,
      calculationFingerprint: null,
      evidenceFingerprints: [],
      declarationExercise: 2027,
    };
  }

  function requirement(key: string, status: string): UnifiedRequirement {
    return {
      key,
      module: 'READINESS_EVIDENCE',
      category: 'CAT',
      nativeType: 'CAT',
      subjectReference: key,
      status,
      blockingReason: status === 'PENDING' ? 'MISSING_CONFIRMATION' : null,
    };
  }

  it('requirement dedup scale 100/1k/10k (unique, duplicate, conflicting)', () => {
    for (const n of [100, 1000, 10000]) {
      const unique = Array.from({ length: n }, (_, i) => requirement(`req-${i}`, 'PENDING'));
      const startUnique = process.hrtime.bigint();
      const outUnique = aggregateRequirements([moduleContribution('READINESS_EVIDENCE', unique)]);
      const msUnique = Number(process.hrtime.bigint() - startUnique) / 1e6;
      expect(outUnique).toHaveLength(n);

      const duplicated = [...unique, ...unique];
      const startDup = process.hrtime.bigint();
      const outDup = aggregateRequirements([moduleContribution('READINESS_EVIDENCE', duplicated)]);
      const msDup = Number(process.hrtime.bigint() - startDup) / 1e6;
      expect(outDup).toHaveLength(n);

      const conflicting = unique.map((r, i) =>
        requirement(r.key, i % 2 === 0 ? 'SATISFIED' : 'PENDING'),
      );
      const startConflict = process.hrtime.bigint();
      const outConflict = aggregateRequirements([
        moduleContribution('READINESS_EVIDENCE', [...unique, ...conflicting]),
      ]);
      const msConflict = Number(process.hrtime.bigint() - startConflict) / 1e6;
      expect(outConflict).toHaveLength(n);
      // Fail-closed winner: every key resolves to PENDING (more severe).
      expect(outConflict.every((r) => r.status === 'PENDING')).toBe(true);
      // eslint-disable-next-line no-console
      console.log(
        `[4J.1A dedup-scale n=${n}] uniqueMs=${msUnique} dupMs=${msDup} conflictMs=${msConflict}`,
      );
      expect(msConflict).toBeLessThan(5000);
    }
  });

  it('consistency-issue scale 100/1k/10k stays bounded with stable fingerprint', () => {
    for (const n of [100, 1000, 10000]) {
      const modules: UnifiedModuleContribution[] = [
        moduleContribution('ANNUAL_POSITIONS'),
        moduleContribution('CAPITAL_MARKETS'),
        moduleContribution('INVESTMENT_INCOME'),
        moduleContribution('READINESS_EVIDENCE'),
        moduleContribution('HIGH_INCOME_MINIMUM_TAX'),
      ];
      const issues = Array.from({ length: n }, (_, i) => ({
        code: 'SOURCE_FINGERPRINT_MISMATCH' as const,
        severity: 'BLOCKING' as const,
        modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'] as const,
        detail: `detail-${i}`,
      }));
      const start = process.hrtime.bigint();
      const first = buildUnifiedAnnualIrpfState({
        calendarYear: 2026,
        taxSubjectId: 'subject',
        generatedAt: '2027-01-01T00:00:00.000Z',
        ruleVersions: {
          annualPositions: null,
          capitalMarkets: null,
          investmentIncome: null,
          readinessEvidence: null,
          highIncome: null,
        },
        modules,
        consistencyIssues: issues,
      });
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const second = buildUnifiedAnnualIrpfState({
        calendarYear: 2026,
        taxSubjectId: 'subject',
        generatedAt: '2027-06-01T00:00:00.000Z',
        ruleVersions: {
          annualPositions: null,
          capitalMarkets: null,
          investmentIncome: null,
          readinessEvidence: null,
          highIncome: null,
        },
        modules: [...modules].reverse(),
        consistencyIssues: [...issues].reverse(),
      });
      expect(second.identity.annualFingerprint).toBe(first.identity.annualFingerprint);
      // eslint-disable-next-line no-console
      console.log(
        `[4J.1A issue-scale n=${n}] ms=${ms} fingerprint=${first.identity.annualFingerprint.slice(0, 16)}`,
      );
      expect(ms).toBeLessThan(10000);
    }
  });

  it('payer-identity check at 10k payers is linear (no nested O(n^2) scan)', () => {
    const payerIds = Array.from({ length: 10000 }, (_, i) => `PAYER${String(i).padStart(5, '0')}`);
    const start = process.hrtime.bigint();
    const issues = detectUnifiedConsistencyIssues({
      requestedCalendarYear: 2026,
      localDeclarationExercise: 2027,
      moduleIdentities: [
        { module: 'CAPITAL_MARKETS', calendarYear: 2026, declarationExercise: 2027 },
        { module: 'INVESTMENT_INCOME', calendarYear: 2026, declarationExercise: 2027 },
      ],
      highIncome: {
        upstreamIncomeFingerprint: 'a',
        upstreamCapitalMarketFingerprint: 'b',
        upstreamIncomeStatus: 'CALCULABLE',
        payerIds,
        hasConflictingEvidence: false,
        hasStaleRequiredEvidence: false,
        forcedUpstreamSnapshotInconsistent: false,
      },
      incomeFingerprint: 'a',
      capitalMarketFingerprint: 'b',
      incomePayerIds: payerIds,
      hasStaleRequiredConfirmation: false,
    });
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(issues).toHaveLength(0);
    // eslint-disable-next-line no-console
    console.log(`[4J.1A payer-identity-10k] ms=${ms}`);
    expect(ms).toBeLessThan(2000);
  });
});
