import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { GetTaxPaymentAdjustmentUseCase } from '../../apps/api/src/application/fiscal/get-tax-payment-adjustment.use-case';
import { TEST_DATABASE_URL, cleanDatabase } from '../database/setup';

/**
 * Phase 4D.2A — performance & query-budget closure.
 *
 * Runs the REAL application path (GetTaxPaymentAdjustmentUseCase) against
 * persisted official snapshots at scales 1/12/60/120/1000. No live network.
 * Reports elapsed time and actual DB query counts; asserts exact correctness
 * (199.90 + 0.66 + 2.00 = 202.56).
 */
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
  log: [{ emit: 'event', level: 'query' }],
});
let queryCount = 0;
prisma.$on('query', () => {
  queryCount += 1;
});

const SUBJECT = 'cc111111-1111-4111-8111-111111111111';
const DUE = new Date('2026-09-30T00:00:00.000Z');
const PAYMENT_DATE = '2026-10-01';

async function seedUser(): Promise<void> {
  await prisma.user.create({
    data: { id: SUBJECT, email: `${SUBJECT}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

async function seedObligations(count: number, principal = '199.90'): Promise<void> {
  await prisma.taxObligationRecord.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      taxSubjectId: SUBJECT,
      competence: '2026-08',
      taxBucket: 'FII_SALE',
      revenueCode: '6015',
      liabilityFingerprint: `FP-${String(i).padStart(10, '0')}`.padEnd(64, '-').slice(0, 64),
      revision: 1,
      principalAmount: new Prisma.Decimal(principal),
      currency: 'BRL',
      dueDate: DUE,
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      darfReadinessReason: null,
      dataQuality: 'COMPLETE',
      provenance: {},
    })),
  });
}

describe('Phase 4D.2A — adjustment performance & query budget', () => {
  let app: INestApplication;
  let useCase: GetTaxPaymentAdjustmentUseCase;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-10-05' })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    useCase = app.get(GetTaxPaymentAdjustmentUseCase);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await cleanDatabase();
    await seedUser();
  });

  async function runScale(count: number) {
    await prisma.taxObligationRecord.deleteMany({ where: { taxSubjectId: SUBJECT } });
    await seedObligations(count);
    const ids = await prisma.taxObligationRecord.findMany({
      where: { taxSubjectId: SUBJECT },
      select: { id: true },
    });
    queryCount = 0;
    const started = Date.now();
    for (const { id } of ids) {
      const adjustment = await useCase.execute({
        userId: SUBJECT,
        obligationId: id,
        paymentDate: PAYMENT_DATE,
      });
      expect(adjustment.status).toBe('READY');
      expect(adjustment.updatedAmount?.amount).toBe('202.56');
      expect(adjustment.lateFeeAmount?.amount).toBe('0.66');
      expect(adjustment.interestAmount?.amount).toBe('2.00');
    }
    const elapsed = Date.now() - started;
    return { elapsed, queries: queryCount };
  }

  it('scale 1', async () => {
    const r = await runScale(1);
    console.info(
      `[4D.2A] 1 adjustment: ${r.elapsed}ms total, ${r.elapsed}ms avg, ${r.queries} queries`,
    );
    expect(r.elapsed).toBeLessThan(5000);
  });

  it('scale 12', async () => {
    const r = await runScale(12);
    console.info(
      `[4D.2A] 12 adjustments: ${r.elapsed}ms total, ${(r.elapsed / 12).toFixed(1)}ms avg, ${r.queries} queries`,
    );
    expect(r.elapsed).toBeLessThan(10000);
  });

  it('scale 60', async () => {
    const r = await runScale(60);
    console.info(
      `[4D.2A] 60 adjustments: ${r.elapsed}ms total, ${(r.elapsed / 60).toFixed(1)}ms avg, ${r.queries} queries`,
    );
    expect(r.elapsed).toBeLessThan(15000);
  });

  it('scale 120', async () => {
    const r = await runScale(120);
    console.info(
      `[4D.2A] 120 adjustments: ${r.elapsed}ms total, ${(r.elapsed / 120).toFixed(1)}ms avg, ${r.queries} queries`,
    );
    expect(r.elapsed).toBeLessThan(20000);
  });

  it('scale 1000 (determinism: run twice)', async () => {
    const first = await runScale(1000);
    console.info(
      `[4D.2A] 1000 adjustments (run 1): ${first.elapsed}ms total, ${(first.elapsed / 1000).toFixed(2)}ms avg, ${first.queries} queries`,
    );
    const second = await runScale(1000);
    console.info(
      `[4D.2A] 1000 adjustments (run 2): ${second.elapsed}ms total, ${(second.elapsed / 1000).toFixed(2)}ms avg, ${second.queries} queries`,
    );
    expect(first.elapsed).toBeLessThan(60000);
    expect(second.elapsed).toBeLessThan(60000);
    // Bounded, non-N+1: query count grows with count, at a small constant per row.
    expect(first.queries).toBeLessThanOrEqual(1000 * 5);
    expect(second.queries).toBeLessThanOrEqual(1000 * 5);
  }, 180000);

  it('query budget: single preview is bounded', async () => {
    await seedObligations(1);
    const [row] = await prisma.taxObligationRecord.findMany({ where: { taxSubjectId: SUBJECT } });
    queryCount = 0;
    await useCase.execute({ userId: SUBJECT, obligationId: row!.id, paymentDate: PAYMENT_DATE });
    console.info(`[4D.2A] single preview queries: ${queryCount}`);
    expect(queryCount).toBeLessThanOrEqual(3);
  });

  it('blocked authority case is fail-closed and bounded', async () => {
    await seedObligations(1, '399.90'); // no official snapshot for this principal
    const [row] = await prisma.taxObligationRecord.findMany({ where: { taxSubjectId: SUBJECT } });
    queryCount = 0;
    const adjustment = await useCase.execute({
      userId: SUBJECT,
      obligationId: row!.id,
      paymentDate: PAYMENT_DATE,
    });
    expect(adjustment.status).toBe('BLOCKED');
    expect(adjustment.reasonCode).toBe('MISSING_LATE_FEE_AUTHORITY');
    expect(queryCount).toBeLessThanOrEqual(3);
  });
});
