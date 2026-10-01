import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { GetMonthlyTaxLiabilityUseCase } from '../../apps/api/src/application/fiscal/get-monthly-tax-liability.use-case';
import { cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { Asset } from '@atlas/domain';

/**
 * Phase 4G.2B.1b — equity tax-rules scale + query budget over the REAL
 * application/replay path (`GetMonthlyTaxLiabilityUseCase` →
 * `computeEquityMonthlyFiscalRead` → `@atlas/tax-engine` over a real PostgreSQL
 * ledger). Not a pure-engine micro-benchmark.
 *
 * Axes:
 *  - event volume:  1 / 12 / 60 / 120 / 1000 ledger events (single month)
 *  - replay depth:  1 / 12 / 60 / 120 months (one round per month)
 *
 * Reports duration, p50/p95, query counts by class and the scaling trend.
 * Query counts must stay structurally bounded (no per-trade, per-leg,
 * per-asset or per-month queries).
 */

const ROUNDS = 3;

type Class =
  | 'ledger'
  | 'assets'
  | 'accountsInstitutions'
  | 'costBasis'
  | 'elections'
  | 'withholding'
  | 'other';
type Counters = Record<Class, number>;

function emptyCounters(): Counters {
  return {
    ledger: 0,
    assets: 0,
    accountsInstitutions: 0,
    costBasis: 0,
    elections: 0,
    withholding: 0,
    other: 0,
  };
}

function classify(sql: string): Class {
  const s = sql.toLowerCase();
  if (s.includes('tax_compensation_elections')) return 'elections';
  if (s.includes('tax_withholding_input_records')) return 'withholding';
  if (s.includes('"transactions"')) return 'ledger';
  if (s.includes('"assets"')) return 'assets';
  if (s.includes('"accounts"') || s.includes('"institutions"')) return 'accountsInstitutions';
  return 'other';
}

function sumCounters(c: Counters): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

function percentiles(durations: number[]): { p50: number; p95: number } {
  const sorted = [...durations].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
  return { p50: at(50), p95: at(95) };
}

interface ScenarioInput {
  readonly label: string;
  readonly month: string;
  readonly buyPrice: string;
  readonly sellPrice: string;
  readonly expectedBase: string;
  readonly expectedTax: string;
  readonly transactions: ReadonlyArray<{
    readonly type: 'BUY' | 'SELL';
    readonly tradeDate: string;
  }>;
}

function monthOf(index: number): string {
  const year = 2020 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${month.toString().padStart(2, '0')}`;
}

function taxFor(base: number): { base: string; tax: string } {
  const rounded = base;
  return { base: String(rounded), tax: String((rounded * 15) / 100) };
}

/** Single-month volume scenarios with exactly N ledger events. */
function volumeScenarios(): ScenarioInput[] {
  const result: ScenarioInput[] = [];
  for (const n of [1, 12, 60, 120, 1000]) {
    const transactions: { type: 'BUY' | 'SELL'; tradeDate: string }[] = [];
    for (let i = 0; i < n; i += 1) {
      transactions.push(
        i % 2 === 0
          ? { type: 'BUY', tradeDate: '2026-08-05' }
          : { type: 'SELL', tradeDate: '2026-08-20' },
      );
    }
    const sellCount = Math.floor(n / 2);
    const proceeds = sellCount * 100 * 100;
    const gain = sellCount * 1000;
    const taxable = proceeds > 20000;
    const { base, tax } = taxFor(taxable ? gain : 0);
    result.push({
      label: `${n} events`,
      month: '2026-08',
      buyPrice: '90',
      sellPrice: '100',
      expectedBase: base,
      expectedTax: tax,
      transactions,
    });
  }
  return result;
}

/** Replay-depth scenarios: one buy/sell round per month. */
function depthScenarios(): ScenarioInput[] {
  const result: ScenarioInput[] = [];
  for (const months of [1, 12, 60, 120]) {
    const transactions: { type: 'BUY' | 'SELL'; tradeDate: string }[] = [];
    for (let m = 0; m < months; m += 1) {
      const competence = monthOf(m);
      transactions.push({ type: 'BUY', tradeDate: `${competence}-05` });
      transactions.push({ type: 'SELL', tradeDate: `${competence}-20` });
    }
    // buy 90 → sell 300: proceeds 30000 > 20000, gain 21000 per month.
    const { base, tax } = taxFor(21000);
    result.push({
      label: `${months} months`,
      month: monthOf(months - 1),
      buyPrice: '90',
      sellPrice: '300',
      expectedBase: base,
      expectedTax: tax,
      transactions,
    });
  }
  return result;
}

describe('Phase 4G.2B.1b — equity tax-rules scale + query budget (real app path)', () => {
  let app: INestApplication;
  let useCase: GetMonthlyTaxLiabilityUseCase;
  let prisma: PrismaClient;
  let counters: Counters = emptyCounters();
  let uuidCounter = 0;

  function makeUuid(): string {
    uuidCounter += 1;
    const h = uuidCounter.toString(16).padStart(12, '0');
    return `f0000000-0000-4000-8000-${h}`;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, (event: { query: string }) => {
      counters[classify(event.query)] += 1;
    });
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    useCase = app.get(GetMonthlyTaxLiabilityUseCase);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function seedScenario(scenario: ScenarioInput): Promise<{ userId: string }> {
    const userId = makeUuid();
    const portfolioId = makeUuid();
    const institutionId = makeUuid();
    const accountId = makeUuid();

    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Scale',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    await prisma.institution.create({
      data: { id: institutionId, name: `Broker ${uuidCounter}`, type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'P',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = Asset.create({
      ticker: `SC${uuidCounter}`,
      name: 'Scale Asset',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });

    const rows = scenario.transactions.map((tx, index) => ({
      id: makeUuid(),
      portfolioId,
      accountId,
      assetId: asset.id,
      type: tx.type,
      tradeDate: new Date(`${tx.tradeDate}T00:00:00.000Z`),
      settlementDate: new Date(`${tx.tradeDate}T00:00:00.000Z`),
      source: 'B3',
      quantity: '100',
      unitPrice: tx.type === 'BUY' ? scenario.buyPrice : scenario.sellPrice,
      currency: 'BRL',
      provider: 'B3',
      externalId: `x-${index}`,
      createdAt: new Date(`${tx.tradeDate}T12:00:${(index % 60).toString().padStart(2, '0')}.000Z`),
    }));
    await prisma.transaction.createMany({ data: rows });

    return { userId };
  }

  interface RunReport {
    label: string;
    events: number;
    months: number;
    durations: number[];
    counters: Counters;
    total: number;
    status: string;
    grossTax: string;
  }

  async function runScenario(scenario: ScenarioInput, months: number): Promise<RunReport> {
    const { userId } = await seedScenario(scenario);
    const durations: number[] = [];
    let lastCounters = emptyCounters();
    let status = '';
    let grossTax = '';
    for (let r = 0; r < ROUNDS; r += 1) {
      counters = emptyCounters();
      const t0 = performance.now();
      const result = await useCase.execute({ userId, competence: scenario.month });
      durations.push(performance.now() - t0);
      lastCounters = { ...counters };
      status = result.equity.status;
      grossTax = result.equity.normal.grossTax;
    }
    // Correctness invariant at every scale: the deterministic tax engine keeps
    // producing the exact expected base and tax over the real ledger.
    expect(status).toBe('COMPLETE');
    expect(grossTax).toBe(scenario.expectedTax);
    return {
      label: scenario.label,
      events: scenario.transactions.length,
      months,
      durations,
      counters: lastCounters,
      total: sumCounters(lastCounters),
      status,
      grossTax,
    };
  }

  it('benchmarks volume and depth with bounded query counts (no N+1)', async () => {
    await cleanDatabase();
    const report: Record<string, unknown> = {};

    const volume: Record<number, RunReport> = {};
    for (const scenario of volumeScenarios()) {
      const r = await runScenario(scenario, 1);
      volume[r.events] = r;
      report[`volume_${r.events}`] = {
        events: r.events,
        months: r.months,
        durationsMs: r.durations.map((d) => Number(d.toFixed(1))),
        ...percentiles(r.durations),
        queries: r.counters,
        totalQueries: r.total,
        status: r.status,
      };
    }

    const depth: Record<number, RunReport> = {};
    for (const scenario of depthScenarios()) {
      const r = await runScenario(scenario, parseInt(scenario.label, 10));
      depth[r.months] = r;
      report[`depth_${r.months}`] = {
        events: r.events,
        months: r.months,
        durationsMs: r.durations.map((d) => Number(d.toFixed(1))),
        ...percentiles(r.durations),
        queries: r.counters,
        totalQueries: r.total,
        status: r.status,
      };
    }

    // eslint-disable-next-line no-console
    console.log('EQUITY_TAX_RULES_SCALE=' + JSON.stringify(report));

    const maxTotal = Math.max(
      ...Object.values(volume).map((r) => r.total),
      ...Object.values(depth).map((r) => r.total),
    );
    // --- Query budget: structurally bounded, not proportional to events/months.
    expect(maxTotal).toBeLessThan(20);
    for (const r of [...Object.values(volume), ...Object.values(depth)]) {
      expect(r.counters.ledger).toBeLessThanOrEqual(2); // single range load per portfolio
      expect(r.counters.assets).toBeLessThanOrEqual(2); // single batched metadata query
      expect(r.counters.withholding).toBeLessThanOrEqual(2); // bounded range load
      expect(r.counters.elections).toBeLessThanOrEqual(2);
      expect(r.counters.costBasis).toBe(0); // cost basis is in-memory replay
      // Explicitly: not per-trade, per-leg, per-asset or per-month.
      expect(r.counters.withholding).toBeLessThan(3);
      expect(r.counters.ledger).toBeLessThan(3);
    }

    // No linear explosion: 1000 events and 120 months cost the same query class.
    expect(volume[1000]!.total - volume[1]!.total).toBeLessThanOrEqual(3);
    expect(depth[120]!.total - depth[1]!.total).toBeLessThanOrEqual(3);

    // Duration sanity (observed, not an SLA): no timeout / no runaway.
    expect(depth[120]!.durations.every((d) => d < 60_000)).toBe(true);
    expect(volume[1000]!.durations.every((d) => d < 60_000)).toBe(true);
  }, 300_000);
});
