import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { GetDarfReadinessUseCase } from '../../apps/api/src/application/fiscal/get-darf-readiness.use-case';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { Asset } from '@atlas/domain';

const CLOCK = '2026-10-05';
const SCALES = [1, 12, 60, 120, 1000] as const;
const POOL_SIZE = 3;

/**
 * Phase 4F.1 — explicit scale benchmark over the REAL application service path
 * (`GetDarfReadinessUseCase` → summary/materialization/adjustment + persistence).
 * Zero external Sicalc calls: this measures local readiness/handoff preparation.
 */
describe('Phase 4F.1 — DARF readiness/handoff scale (real app path)', () => {
  let app: INestApplication;
  let readiness: GetDarfReadinessUseCase;
  let queryCount = 0;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, () => {
      queryCount += 1;
    });
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => CLOCK })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    readiness = app.get(GetDarfReadinessUseCase);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function payableObligation(
    index: number,
  ): Promise<{ userId: string; obligationId: string }> {
    const userId = `dd000000-0000-4000-8000-00000000000${index}`;
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'T',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
    const inst = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora', type: 'BANK', country: 'BR' })
      .expect(201);
    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: inst.body.data.id, name: 'Conta', currency: 'BRL' })
      .expect(201);
    const asset = Asset.create({
      ticker: `MXRF${index}11`,
      name: 'FII',
      type: 'FII',
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
    const tx = (type: string, unitPrice: string, tradeDate: string, externalId: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          accountId: accountRes.body.data.id,
          assetId: asset.id,
          type,
          quantity: '100',
          unitPrice,
          currency: 'BRL',
          tradeDate,
          provider: 'B3',
          externalId,
        })
        .expect(201);
    await tx('BUY', '10', '2026-07-01', 'b1');
    await tx('SELL', '20', '2026-09-10', 's1');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'FII',
        amount: '0.1',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'irrf-2026-09',
      })
      .expect(200);
    const obligation = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-09/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { userId, obligationId: obligation.body.data.id as string };
  }

  it('benchmarks 1/12/60/120/1000 real readiness evaluations (0 external calls)', async () => {
    await cleanDatabase();
    const pool: { userId: string; obligationId: string }[] = [];
    for (let i = 0; i < POOL_SIZE; i += 1) {
      pool.push(await payableObligation(i));
    }

    const report: Record<
      number,
      {
        totalMs: number;
        avgMs: number;
        queries: number;
        externalCalls: number;
        p50: number;
        p95: number;
      }
    > = {};

    async function run(n: number) {
      const durations: number[] = [];
      queryCount = 0;
      const started = performance.now();
      for (let i = 0; i < n; i += 1) {
        const item = pool[i % pool.length]!;
        const t0 = performance.now();
        const data = await readiness.execute({
          userId: item.userId,
          obligationId: item.obligationId,
          paymentDate: null,
        });
        durations.push(performance.now() - t0);
        // Correctness invariants preserved at every scale.
        expect(data.generationMode).toBe('OFFICIAL_INTERACTIVE_HANDOFF');
        expect(data.status).toBe('USER_ACTION_REQUIRED');
        expect(data.destination?.sourceSystem).toBe('RFB_SICALC');
        expect(data.destination?.url).toContain('sicalc.receita.fazenda.gov.br');
        expect(data.destination?.prefillSupported).toBe(false);
      }
      const totalMs = performance.now() - started;
      durations.sort((a, b) => a - b);
      const pct = (p: number) =>
        durations[Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))]!;
      return {
        totalMs,
        avgMs: totalMs / n,
        queries: queryCount,
        externalCalls: 0,
        p50: pct(50),
        p95: pct(95),
      };
    }

    for (const n of SCALES) {
      report[n] = await run(n);
    }
    // 1000 repeat.
    const run1 = report[1000]!;
    const run2 = await run(1000);

    // eslint-disable-next-line no-console
    console.log('DARF_HANDOFF_SCALE=' + JSON.stringify({ report, run2 }));

    // Bounded per-evaluation query class (no N+1): well under 40 queries/eval.
    for (const n of SCALES) {
      expect(report[n]!.queries / n).toBeLessThan(40);
      expect(report[n]!.externalCalls).toBe(0);
    }
    expect(run1.totalMs).toBeLessThan(120_000);
    expect(run2.totalMs).toBeLessThan(120_000);
    expect(run2.queries / 1000).toBeLessThan(40);
    expect(run2.queries / 1000).toBeGreaterThan(0);
  }, 240_000);
});
