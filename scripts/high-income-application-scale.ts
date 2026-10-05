/* eslint-disable no-console */
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../apps/api/src/app.module';
import { configureApp } from '../apps/api/src/main';
import { PRISMA_CLIENT } from '../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession } from '../tests/api/setup';
import { TEST_DATABASE_URL } from '../tests/database/setup';
import { randomUUID } from 'node:crypto';

/**
 * Phase 4I.4A — high-income application scale benchmark (real PostgreSQL,
 * full HTTP path: auth -> 4H reads -> 4I snapshot -> 4I.2/4I.3 engines ->
 * evidence -> serialization).
 *
 * Usage:
 *   tsx --tsconfig tsconfig.smoke.json scripts/high-income-application-scale.ts [scenario]
 * Scenarios: payers | revisions | facts | combined | concurrency | retention | all
 *
 * Observed development/test evidence, not a production SLA.
 */

interface QueryLog {
  readonly query: string;
  readonly params: string;
}

const queryLog: QueryLog[] = [];

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / sorted.length;
  const quantile = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    min: sorted[0],
    median: quantile(0.5),
    mean: Math.round(mean * 100) / 100,
    p95: quantile(0.95),
    max: sorted[sorted.length - 1],
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
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

function countBy(logs: QueryLog[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const entry of logs) {
    const category = categorize(entry.query);
    map[category] = (map[category] ?? 0) + 1;
  }
  return map;
}

let prisma: PrismaClient;
let app: INestApplication;

async function boot(): Promise<void> {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
    log: [{ emit: 'event', level: 'query' }],
  });
  prisma.$on('query' as never, (e: { query: string; params: string }) => {
    queryLog.push({ query: e.query, params: e.params });
  });
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => '2027-03-15' })
    .compile();
  app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
}

async function cleanDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "annual_opening_position_inputs", "tax_withholding_input_records", "tax_trade_classification_records", "fii_tax_eligibility_fact_records", "tax_compensation_elections", "tax_carry_forward_entries", "tax_payment_aggregations", "tax_payment_evidence", "tax_obligations", "high_income_evidence_records", "ai_conversation_messages", "ai_conversations", "password_reset_tokens", "sessions", "transactions", "accounts", "portfolios", "assets", "institutions", "users" CASCADE;
  `);
}

async function makeUser(tag: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email: `${tag}-${userId}@atlas.dev`,
      name: `Scale ${tag}`,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
    },
  });
  const { token } = await createAuthenticatedUserSession(userId);
  return { userId, token };
}

function normalizeDecimal(value: string): string {
  if (!value.includes('.')) {
    return value.replace(/^(-?)0+(\d)/, '$1$2');
  }
  const [int, frac] = value.split('.') as [string, string];
  const trimmedFrac = frac.replace(/0+$/, '');
  const normInt = int.replace(/^(-?)0+(\d)/, '$1$2');
  return trimmedFrac === '' ? normInt : `${normInt}.${trimmedFrac}`;
}

function payerPin(ticker: string, dividendGross: string): string {
  // Amounts must match the read-model Money.amount normalization exactly.
  return createHash('sha256')
    .update(`${ticker}|${normalizeDecimal(dividendGross)}|0|0|0`, 'utf8')
    .digest('hex');
}

interface ScaleSetup {
  userId: string;
  token: string;
}

/** Deterministic mixed payer states: 0=complete+, 1=missing, 2=stale, 3=zero-redutor, else complete. */
async function setupPayers(
  tag: string,
  payerCount: number,
  dividendPerPayer: string,
): Promise<ScaleSetup> {
  const { userId, token } = await makeUser(tag);
  const portfolio = await prisma.portfolio.create({
    data: {
      id: randomUUID(),
      userId,
      name: `P ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: randomUUID(), name: `B ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: randomUUID(),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `A ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });

  const assets: Array<{ id: string; ticker: string }> = [];
  const txRows: Array<Record<string, unknown>> = [];
  const evRows: Array<Record<string, unknown>> = [];
  for (let p = 0; p < payerCount; p++) {
    // Canonical payer identity: domain tickers normalize to UPPERCASE, and the
    // evidence write path validates payerId against upstream payerIds, so seed
    // data must already use the canonical form.
    const ticker = `SCP${tag}${p}`.toUpperCase();
    const assetId = randomUUID();
    assets.push({ id: assetId, ticker });
    txRows.push({
      id: randomUUID(),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId,
      type: 'DIVIDEND',
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount: dividendPerPayer,
      currency: 'BRL',
    });
    const mode = p % 5;
    if (mode === 1) {
      continue; // missing evidence
    }
    const zeroRedutor = mode === 3;
    evRows.push({
      id: randomUUID(),
      taxSubjectId: userId,
      calendarYear: 2026,
      payerKey: ticker,
      payerId: ticker,
      evidenceType: 'CORPORATE_TAX',
      payerType: 'STANDARD_CORPORATE',
      profitPeriodExercise: 2026,
      evidenceMode: 'FULL',
      accountingProfit: '800000.00',
      irDue: zeroRedutor ? '100000.00' : '200000.00',
      csllDue: '68000.00',
      authority: 'AUTHORITATIVE',
      evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
      conflictStatus: 'NONE',
      upstreamFingerprint: mode === 2 ? 'stale-pin' : payerPin(ticker, dividendPerPayer),
      sourceFingerprint: createHash('sha256').update(`ev-${tag}-${p}`, 'utf8').digest('hex'),
      revision: 1,
      fingerprint: createHash('sha256').update(`fp-${tag}-${p}`, 'utf8').digest('hex'),
      createdByPrincipal: userId,
    });
  }
  await prisma.asset.createMany({
    data: assets.map((a) => ({
      ...a,
      name: a.ticker,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    })),
  });
  await prisma.transaction.createMany({ data: txRows as never });
  if (evRows.length > 0) {
    await prisma.highIncomeEvidenceRecord.createMany({ data: evRows as never });
  }
  await prisma.highIncomeEvidenceRecord.create({
    data: {
      taxSubjectId: userId,
      calendarYear: 2026,
      payerKey: '_ANNUAL_',
      payerId: null,
      evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
      authority: 'AUTHORITATIVE',
      evidenceSource: 'TAXPAYER_CONFIRMED',
      conflictStatus: 'NONE',
      upstreamFingerprint: null,
      sourceFingerprint: createHash('sha256').update(`adj-${tag}`, 'utf8').digest('hex'),
      revision: 1,
      fingerprint: createHash('sha256').update(`adjfp-${tag}`, 'utf8').digest('hex'),
      adjustmentAmount: '0.00',
      createdByPrincipal: userId,
    },
  });
  return { userId, token };
}

async function measuredGet(
  token: string,
  warmups: number,
  reps: number,
): Promise<{
  samples: number[];
  queryCounts: number[];
  categories: Record<string, number>;
  lastBody: Record<string, unknown>;
  payloadBytes: number;
  stringifyMs: number;
}> {
  const server = app.getHttpServer();
  for (let w = 0; w < warmups; w++) {
    await request(server)
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`);
  }
  const samples: number[] = [];
  const queryCounts: number[] = [];
  let categories: Record<string, number> = {};
  let lastBody: Record<string, unknown> = {};
  let payloadBytes = 0;
  let stringifyMs = 0;
  for (let r = 0; r < reps; r++) {
    queryLog.length = 0;
    const startedAt = Date.now();
    const res = await request(server)
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    samples.push(Date.now() - startedAt);
    queryCounts.push(queryLog.length);
    categories = countBy(queryLog);
    lastBody = res.body.data as Record<string, unknown>;
    if (r === reps - 1) {
      const stringifyStart = Date.now();
      payloadBytes = Buffer.byteLength(JSON.stringify(lastBody), 'utf8');
      stringifyMs = Date.now() - stringifyStart;
    }
  }
  return { samples, queryCounts, categories, lastBody, payloadBytes, stringifyMs };
}

async function scenarioPayers(): Promise<void> {
  console.log('--- payer scale matrix (mixed states, 2 warmups, 5 reps) ---');
  for (const n of [1, 10, 100, 1000, 10000]) {
    await cleanDatabase();
    const started = Date.now();
    const { token } = await setupPayers(`p${n}`, n, '10000.00');
    const setupMs = Date.now() - started;
    const memBefore = process.memoryUsage().heapUsed;
    const { samples, queryCounts, categories, lastBody, payloadBytes, stringifyMs } =
      await measuredGet(token, 2, 5);
    const memDeltaMb =
      Math.round(((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024) * 100) / 100;
    const s = stats(samples);
    const evidence = (lastBody['evidence'] as Array<{ stale?: boolean }>) ?? [];
    const redutor = lastBody['corporateRedutor'] as { payerCount?: number } | null;
    // Stale-subset check (§42): only the deterministic stale subset (p%5==2) may be stale.
    const expectedStale = n === 1 ? 0 : Math.floor(n / 5) + (n % 5 > 2 ? 1 : 0);
    const actualStale = evidence.filter((entry) => entry.stale === true).length;
    // Fingerprint stability (§44): identical setup re-read yields the identical fingerprint.
    const server = app.getHttpServer();
    const proof = await request(server)
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fpStable = proof.body.data?.calculationFingerprint === lastBody['calculationFingerprint'];
    console.log(
      `payers=${n} setupMs=${setupMs} min=${s.min} median=${s.median} mean=${s.mean} p95=${s.p95} max=${s.max} ` +
        `queries=${queryCounts.join('/')} categories=${JSON.stringify(categories)} memDeltaMb=${memDeltaMb} status=${lastBody['status']} ` +
        `redutorPayers=${redutor?.payerCount ?? 'null'} evidence=${evidence.length} fp=${String(lastBody['calculationFingerprint']).slice(0, 12)} ` +
        `payloadBytes=${payloadBytes} stringifyMs=${stringifyMs} stale=${actualStale}/${expectedStale} fpStable=${fpStable}`,
    );
    if (actualStale !== expectedStale || !fpStable) {
      throw new Error(`payer point ${n}: stale-subset or fingerprint-stability check failed`);
    }
  }
}

async function scenarioRevisions(): Promise<void> {
  console.log('--- evidence revision scale (single payer, repo-level writes) ---');
  await cleanDatabase();
  const { userId } = await makeUser('rev');
  const { HighIncomeEvidenceRepository } = await import('../packages/database/src/index');
  const repo = new HighIncomeEvidenceRepository(prisma);
  const base = {
    taxSubjectId: userId,
    calendarYear: 2026 as number,
    payerId: 'REVP',
    evidenceType: 'CORPORATE_TAX' as const,
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    evidenceMode: 'FULL',
    accountingProfit: '800000.00',
    irDue: '200000.00',
    csllDue: '68000.00',
    authority: 'AUTHORITATIVE' as const,
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS' as const,
    createdByPrincipal: userId,
  };
  for (const target of [100, 1000, 10000]) {
    const writeSamples: number[] = [];
    let current = await repo.findCurrent({
      taxSubjectId: userId,
      calendarYear: 2026,
      payerKey: 'REVP',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    const startRev = current ? current.revision : 0;
    for (let r = startRev + 1; r <= target; r++) {
      const t0 = Date.now();
      await repo.create({ ...base, irDue: `${200000 + r}.00` });
      if (r === target || r === 100 || r === 1000) {
        writeSamples.push(Date.now() - t0);
      }
    }
    const tLookup = Date.now();
    current = await repo.findCurrent({
      taxSubjectId: userId,
      calendarYear: 2026,
      payerKey: 'REVP',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    const lookupMs = Date.now() - tLookup;
    const history = await repo.listHistory({
      taxSubjectId: userId,
      calendarYear: 2026,
      payerKey: 'REVP',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    const revisions = history.map((row) => row.revision);
    const chainOk = revisions.length === target && revisions.every((rev, idx) => rev === idx + 1);
    const uniqueIds = new Set(history.map((row) => row.id)).size === target;
    console.log(
      `revisions=${target} writeAtTargetMs=${writeSamples[writeSamples.length - 1]} lookupMs=${lookupMs} ` +
        `chainOk=${chainOk} uniqueIds=${uniqueIds} currentRev=${current?.revision} fp=${current?.fingerprint.slice(0, 12)}`,
    );
  }
}

async function scenarioFacts(): Promise<void> {
  console.log('--- annual fact scale (dividend facts, 2 warmups, 5 reps) ---');
  for (const n of [1000, 10000, 50000]) {
    await cleanDatabase();
    const { token } = await setupPayers(`f${n}`, n, '1000.00');
    const memBefore = process.memoryUsage().heapUsed;
    const { samples, queryCounts, categories, lastBody, payloadBytes, stringifyMs } =
      await measuredGet(token, 2, 5);
    const memDeltaMb =
      Math.round(((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024) * 100) / 100;
    const s = stats(samples);
    console.log(
      `facts~${n} min=${s.min} median=${s.median} mean=${s.mean} p95=${s.p95} max=${s.max} ` +
        `queries=${queryCounts.join('/')} categories=${JSON.stringify(categories)} memDeltaMb=${memDeltaMb} status=${lastBody['status']} fp=${String(lastBody['calculationFingerprint']).slice(0, 12)} ` +
        `payloadBytes=${payloadBytes} stringifyMs=${stringifyMs}`,
    );
  }
}

async function scenarioCombined(): Promise<void> {
  console.log('--- combined stress (1000 payers + revisions + facts) ---');
  await cleanDatabase();
  const { token, userId } = await setupPayers('combo', 1000, '10000.00');
  // 10k revisions across 10 payers (1k each)
  const { HighIncomeEvidenceRepository } = await import('../packages/database/src/index');
  const repo = new HighIncomeEvidenceRepository(prisma);
  for (let p = 0; p < 10; p++) {
    for (let r = 0; r < 1000; r++) {
      await repo.create({
        taxSubjectId: userId,
        calendarYear: 2026,
        payerId: `COMBO${p}`,
        evidenceType: 'CORPORATE_TAX',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        evidenceMode: 'FULL',
        accountingProfit: '800000.00',
        irDue: `${200000 + r}.00`,
        csllDue: '68000.00',
        authority: 'AUTHORITATIVE',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        createdByPrincipal: userId,
      });
    }
  }
  const { samples, queryCounts, categories, lastBody } = await measuredGet(token, 2, 5);
  const s = stats(samples);
  const ok =
    typeof lastBody['status'] === 'string' &&
    typeof lastBody['calculationFingerprint'] === 'string' &&
    (lastBody['calculationFingerprint'] as string).length === 64;
  console.log(
    `combined min=${s.min} median=${s.median} mean=${s.mean} p95=${s.p95} max=${s.max} ` +
      `queries=${queryCounts.join('/')} categories=${JSON.stringify(categories)} correctness=${ok} status=${lastBody['status']}`,
  );
}

async function scenarioConcurrency(): Promise<void> {
  console.log('--- concurrent reads (100 payers, mixed users) ---');
  await cleanDatabase();
  const first = await setupPayers('cc1', 100, '10000.00');
  const second = await setupPayers('cc2', 100, '10000.00');
  for (const n of [1, 5, 10, 25]) {
    const server = app.getHttpServer();
    const startedAt = Date.now();
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        request(server)
          .get('/api/v1/fiscal/annual/2026/high-income')
          .set('Authorization', `Bearer ${(i % 2 === 0 ? first : second).token}`)
          .then((res) => ({
            status: res.status,
            fp: res.body.data?.calculationFingerprint,
            evidence: (res.body.data?.evidence as Array<{ id: string }>)?.length,
          })),
      ),
    );
    const elapsed = Date.now() - startedAt;
    const allOk = results.every((r) => r.status === 200 && typeof r.fp === 'string');
    const firstFps = new Set(results.filter((_, i) => i % 2 === 0).map((r) => r.fp));
    const secondFps = new Set(results.filter((_, i) => i % 2 === 1).map((r) => r.fp));
    console.log(
      `concurrent=${n} elapsedMs=${elapsed} allOk=${allOk} userA_fps=${firstFps.size} userB_fps=${secondFps.size}`,
    );
  }
  // pool health: trivial query still works, no hanging transaction
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('pool health: OK');
}

async function scenarioRetention(): Promise<void> {
  console.log('--- memory retention (100 repeated reads, 100 payers, paced under throttle) ---');
  await cleanDatabase();
  const { token } = await setupPayers('ret', 100, '10000.00');
  const server = app.getHttpServer();
  const means: number[] = [];
  const statuses = new Set<string>();
  for (let batch = 0; batch < 10; batch++) {
    const batchSamples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const memBefore = process.memoryUsage().heapUsed;
      const res = await request(server)
        .get('/api/v1/fiscal/annual/2026/high-income')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      statuses.add(String((res.body.data as Record<string, unknown>)['status']));
      batchSamples.push(process.memoryUsage().heapUsed - memBefore);
      // Paced below the global 100 req/60s throttle: ~1 read/s keeps every
      // response a genuine measurement instead of a 429 rejection.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const mean = batchSamples.reduce((a, b) => a + b, 0) / batchSamples.length;
    means.push(Math.round((mean / 1024 / 1024) * 100) / 100);
    if (global.gc) {
      global.gc();
    }
  }
  const firstHalf = means.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const secondHalf = means.slice(5).reduce((a, b) => a + b, 0) / 5;
  console.log(
    `retention batchMeansMb=[${means.join(',')}] statuses=${Array.from(statuses).join('/')} ` +
      `firstHalf=${Math.round(firstHalf * 100) / 100} secondHalf=${Math.round(secondHalf * 100) / 100} ` +
      `growth=${secondHalf - firstHalf < 5 ? 'BOUNDED' : 'CHECK'}`,
  );
}

async function main(): Promise<void> {
  const selected = process.argv
    .slice(2)
    .join(' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  const want = (name: string): boolean => selected.includes('all') || selected.includes(name);
  await boot();
  try {
    if (want('payers')) {
      await scenarioPayers();
    }
    if (want('revisions')) {
      await scenarioRevisions();
    }
    if (want('facts')) {
      await scenarioFacts();
    }
    if (want('combined')) {
      await scenarioCombined();
    }
    if (want('concurrency')) {
      await scenarioConcurrency();
    }
    if (want('retention')) {
      await scenarioRetention();
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
  console.log('done.');
}

main().catch((err) => {
  console.error('scale benchmark failed:', err);
  process.exit(1);
});
