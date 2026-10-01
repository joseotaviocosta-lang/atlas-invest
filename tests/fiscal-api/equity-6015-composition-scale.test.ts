import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { GetTaxPaymentSummaryUseCase } from '../../apps/api/src/application/fiscal/get-tax-payment-summary.use-case';
import { cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { Asset } from '@atlas/domain';

/**
 * Phase 4G.2C — 6015 composition scale + query budget over the REAL application
 * path (`GetTaxPaymentSummaryUseCase` → obligation composition → minimum DARF /
 * carry → deadline). Real PostgreSQL ledger; no pure-engine shortcut.
 *
 * Axes: 1 / 12 / 60 / 120 months × category mixtures (normal, day trade, all
 * three). Reports duration, p50/p95 and query counts by class. Query counts must
 * stay structurally bounded (no per-trade, per-month or per-component query).
 */

const ROUNDS = 3;
const SCALES = [1, 12, 60, 120] as const;
const TARGET = '2026-09';

type QueryClass =
  | 'ledger'
  | 'assets'
  | 'accounts'
  | 'withholding'
  | 'elections'
  | 'obligations'
  | 'carry'
  | 'deadline'
  | 'aggregation'
  | 'other';
type Counters = Record<QueryClass, number>;

function emptyCounters(): Counters {
  return {
    ledger: 0,
    assets: 0,
    accounts: 0,
    withholding: 0,
    elections: 0,
    obligations: 0,
    carry: 0,
    deadline: 0,
    aggregation: 0,
    other: 0,
  };
}

function classify(sql: string): QueryClass {
  const s = sql.toLowerCase();
  if (s.includes('tax_compensation_elections')) return 'elections';
  if (s.includes('tax_withholding_input_records')) return 'withholding';
  if (s.includes('tax_carry_forward_entries')) return 'carry';
  if (s.includes('tax_payment_aggregations')) return 'aggregation';
  if (s.includes('tax_obligations')) return 'obligations';
  if (s.includes('federal_tax_deadline_entries')) return 'deadline';
  if (s.includes('"transactions"')) return 'ledger';
  if (s.includes('"assets"')) return 'assets';
  if (s.includes('"accounts"') || s.includes('"institutions"')) return 'accounts';
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

function shiftMonth(competence: string, delta: number): string {
  const [y, m] = competence.split('-').map(Number);
  const total = y! * 12 + (m! - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${month.toString().padStart(2, '0')}`;
}

type Mixture = 'normal' | 'dayTrade' | 'allThree';

describe('Phase 4G.2C — 6015 composition scale + query budget (real app path)', () => {
  let app: INestApplication;
  let useCase: GetTaxPaymentSummaryUseCase;
  let prisma: PrismaClient;
  let counters: Counters = emptyCounters();
  let uuidCounter = 0;

  function makeUuid(): string {
    uuidCounter += 1;
    const h = uuidCounter.toString(16).padStart(12, '0');
    return `a0000000-0000-4000-9000-${h}`;
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
    useCase = app.get(GetTaxPaymentSummaryUseCase);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function seed(months: number, mixture: Mixture): Promise<string> {
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
      data: { id: institutionId, name: `B${uuidCounter}`, type: 'BROKER', country: 'BR' },
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
    const stock = Asset.create({
      ticker: `SC${uuidCounter}S`,
      name: 'Stock',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const fii = Asset.create({
      ticker: `SC${uuidCounter}F`,
      name: 'FII',
      type: 'FII',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.createMany({
      data: [stock, fii].map((a) => ({
        id: a.id,
        ticker: a.ticker,
        name: a.name,
        type: a.type,
        currency: a.currency,
        exchange: a.exchange,
      })),
    });

    const rows: {
      id: string;
      portfolioId: string;
      accountId: string;
      assetId: string;
      type: string;
      tradeDate: Date;
      settlementDate: Date;
      source: string;
      quantity: string;
      unitPrice: string;
      currency: string;
      provider: string;
      externalId: string;
    }[] = [];
    const withholdings: {
      taxSubjectId: string;
      competence: string;
      economicDate: Date;
      category: string;
      amount: string;
      currency: string;
      status: string;
      sourceType: string;
      sourceReference: string;
      fingerprint: string;
      provenance: Record<string, unknown>;
      confirmedAt: Date;
    }[] = [];
    let txSeq = 0;
    const add = (assetId: string, type: string, date: string, price: string, qty: string) => {
      txSeq += 1;
      const id = makeUuid();
      rows.push({
        id,
        portfolioId,
        accountId,
        assetId,
        type,
        tradeDate: new Date(`${date}T00:00:00.000Z`),
        settlementDate: new Date(`${date}T00:00:00.000Z`),
        source: 'B3',
        quantity: qty,
        unitPrice: price,
        currency: 'BRL',
        provider: 'B3',
        externalId: `x-${txSeq}`,
      });
    };

    for (let i = 0; i < months; i += 1) {
      const m = shiftMonth(TARGET, -i);
      if (mixture === 'normal' || mixture === 'allThree') {
        add(stock.id, 'BUY', `${m}-05`, '100', '250');
        add(stock.id, 'SELL', `${m}-20`, '104', '250');
      }
      if (mixture === 'dayTrade' || mixture === 'allThree') {
        add(stock.id, 'BUY', `${m}-15`, '100', '100');
        add(stock.id, 'SELL', `${m}-15`, '110', '100');
      }
      if (mixture === 'allThree') {
        add(fii.id, 'BUY', `${m}-01`, '10', '100');
        add(fii.id, 'SELL', `${m}-10`, '10.6', '100');
        withholdings.push({
          taxSubjectId: userId,
          competence: m,
          economicDate: new Date(`${m}-10T00:00:00.000Z`),
          category: 'FII',
          amount: '0.1',
          currency: 'BRL',
          status: 'CONFIRMED',
          sourceType: 'MANUAL',
          sourceReference: `irrf-${m}`,
          fingerprint: `fp-${uuidCounter}-${m}`,
          provenance: {},
          confirmedAt: new Date(),
        });
      }
    }
    await prisma.transaction.createMany({ data: rows });
    if (withholdings.length > 0) {
      await prisma.taxWithholdingInputRecord.createMany({ data: withholdings });
    }
    return userId;
  }

  it('scales across month depth and mixtures with bounded queries', async () => {
    await cleanDatabase();
    const report: Record<string, unknown> = {};

    for (const mixture of ['normal', 'dayTrade', 'allThree'] as Mixture[]) {
      for (const months of SCALES) {
        const userId = await seed(months, mixture);
        const durations: number[] = [];
        let last = emptyCounters();
        let status = '';
        let total: string | null = null;
        for (let r = 0; r < ROUNDS; r += 1) {
          counters = emptyCounters();
          const t0 = performance.now();
          const data = await useCase.forCompetence({ userId, competence: TARGET });
          durations.push(performance.now() - t0);
          last = { ...counters };
          status = data.obligation?.composition?.status ?? '';
          total = data.obligation?.composition?.total?.amount ?? null;
        }
        expect(status).toBe('COMPLETE');
        // Composed total is deterministic and stable across replays.
        expect(total).not.toBeNull();
        expect(durations.every((d) => d < 60_000)).toBe(true);
        report[`${mixture}_${months}`] = {
          months,
          mixture,
          durationsMs: durations.map((d) => Number(d.toFixed(1))),
          ...percentiles(durations),
          queries: last,
          totalQueries: sumCounters(last),
          total,
        };
      }
    }

    // eslint-disable-next-line no-console
    console.log('EQUITY_6015_COMPOSITION_SCALE=' + JSON.stringify(report));

    const entries = Object.values(report) as { totalQueries: number; queries: Counters }[];
    const max = Math.max(...entries.map((e) => e.totalQueries));
    expect(max).toBeLessThan(40);
    for (const entry of entries) {
      // Structurally bounded range loads — never per-trade / per-month.
      expect(entry.queries.ledger).toBeLessThanOrEqual(2);
      expect(entry.queries.assets).toBeLessThanOrEqual(2);
      expect(entry.queries.withholding).toBeLessThanOrEqual(3);
      expect(entry.queries.elections).toBeLessThanOrEqual(2);
      expect(entry.queries.obligations).toBeLessThanOrEqual(6);
    }
  }, 600_000);
});
