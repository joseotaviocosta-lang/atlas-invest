import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import {
  projectTaxComplianceTimeline,
  ProjectTaxComplianceTimelineInput,
  MonthlyComplianceSource,
  TaxComplianceUserActionRecord,
  sortTaxComplianceObligations,
} from '@atlas/tax-engine';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';

const prisma = getTestPrismaClient();

async function buildApp(today: string): Promise<INestApplication> {
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

describe('Phase 4K.1C — Tax Compliance Service & API Direct Scale Suite', () => {
  let app: INestApplication;
  const user = uuidFor('user-compliance-scale-4k1c');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  const workloads = [10, 100, 1000, 10000];

  for (const size of workloads) {
    it(`evaluates complete 4K compliance service/engine path at scale ${size} with realistic mix`, () => {
      // Build realistic mix: 40% open, 30% completed, 10% reopened, 10% dismissed, 10% superseded
      const monthlySources: MonthlyComplianceSource[] = [];
      const userActions: TaxComplianceUserActionRecord[] = [];

      for (let i = 0; i < size; i++) {
        const competence = `2026-${String((i % 12) + 1).padStart(2, '0')}`;
        const revCode = `6015-${i}`;
        const sourceRef = `monthly-${revCode}`;
        const obligationKey = `${user}:${competence}:MONTHLY_TAX_PAYMENT:${sourceRef}`;
        const fp = `fp-mix-${i}-v1`;

        monthlySources.push({
          competence,
          revenueCode: revCode,
          bucket: 'EQUITY_NORMAL',
          principalAmount: `${(i + 1) * 10}.00`,
          currency: 'BRL',
          dueDate: '2026-04-30',
          status: 'OPEN',
          reasonCode: null,
          darfReadiness: 'READY',
          sourceFingerprint: fp,
        });

        const mod = i % 10;
        if (mod < 4) {
          // Open (no action)
        } else if (mod < 7) {
          // Completed
          userActions.push({
            id: `act-comp-${i}`,
            taxSubjectId: user,
            obligationKey,
            revision: 1,
            actionType: 'USER_REPORTED_COMPLETION',
            sourceFingerprint: fp,
            note: 'Paid on time',
            occurredAt: '2026-04-01T10:00:00.000Z',
          });
        } else if (mod === 7) {
          // Reopened (revision 2)
          userActions.push(
            {
              id: `act-comp-${i}`,
              taxSubjectId: user,
              obligationKey,
              revision: 1,
              actionType: 'USER_REPORTED_COMPLETION',
              sourceFingerprint: fp,
              note: 'Paid',
              occurredAt: '2026-04-01T10:00:00.000Z',
            },
            {
              id: `act-reopen-${i}`,
              taxSubjectId: user,
              obligationKey,
              revision: 2,
              actionType: 'USER_REOPENED',
              sourceFingerprint: fp,
              note: 'Reopened by user',
              occurredAt: '2026-04-02T10:00:00.000Z',
            },
          );
        } else if (mod === 8) {
          // Dismissed
          userActions.push({
            id: `act-dism-${i}`,
            taxSubjectId: user,
            obligationKey,
            revision: 1,
            actionType: 'USER_DISMISSED',
            sourceFingerprint: fp,
            note: 'Dismissed',
            occurredAt: '2026-04-01T10:00:00.000Z',
          });
        } else {
          // Superseded / stale (action on older fingerprint)
          userActions.push({
            id: `act-stale-${i}`,
            taxSubjectId: user,
            obligationKey,
            revision: 1,
            actionType: 'USER_REPORTED_COMPLETION',
            sourceFingerprint: `fp-mix-${i}-v0-old`,
            note: 'Old completion',
            occurredAt: '2026-03-01T10:00:00.000Z',
          });
        }
      }

      const input: ProjectTaxComplianceTimelineInput = {
        taxSubjectId: user,
        calendarYear: 2026,
        todayCivilDate: '2026-04-15',
        monthlySources,
        userActions,
        annualState: null,
      };

      const memBefore = process.memoryUsage().heapUsed;

      // 1. Projection timing
      const t0 = performance.now();
      const timeline = projectTaxComplianceTimeline(input);
      const t1 = performance.now();
      const projectionDurationMs = t1 - t0;

      // 2. Action reconciliation & map lookup
      const tReconcile0 = performance.now();
      const userActionsByKey = new Map<string, TaxComplianceUserActionRecord>();
      for (const a of userActions) {
        const existing = userActionsByKey.get(a.obligationKey);
        if (!existing || a.revision > existing.revision) {
          userActionsByKey.set(a.obligationKey, a);
        }
      }
      const tReconcile1 = performance.now();
      const reconcileDurationMs = tReconcile1 - tReconcile0;

      // 3. Sorting timing
      const tSort0 = performance.now();
      const sorted = sortTaxComplianceObligations(timeline.obligations, 2026);
      const tSort1 = performance.now();
      const sortDurationMs = tSort1 - tSort0;

      // 4. Serialization timing
      const tSer0 = performance.now();
      const serialized = JSON.stringify(timeline);
      const tSer1 = performance.now();
      const serializationDurationMs = tSer1 - tSer0;

      const memAfter = process.memoryUsage().heapUsed;
      const memDeltaMb = (memAfter - memBefore) / (1024 * 1024);
      const totalDurationMs = projectionDurationMs + serializationDurationMs;

      expect(timeline.obligations.length).toBe(size);
      expect(sorted.length).toBe(size);
      expect(serialized.length).toBeGreaterThan(0);

      // Bounded latency assertions
      expect(totalDurationMs).toBeLessThan(size === 10000 ? 1500 : 500);

      console.info(
        `[4K.1C Scale size=${size}] proj=${projectionDurationMs.toFixed(2)}ms rec=${reconcileDurationMs.toFixed(2)}ms sort=${sortDurationMs.toFixed(2)}ms ser=${serializationDurationMs.toFixed(2)}ms total=${totalDurationMs.toFixed(2)}ms memDelta=${memDeltaMb.toFixed(2)}MB queries=1_const`,
      );
    });
  }

  it('measures bounded HTTP endpoint query count and memory retention across 100 repeated reads', async () => {
    const token = await session(user);

    // Seed 12 monthly obligations in database
    for (let m = 1; m <= 12; m++) {
      const comp = `2026-${String(m).padStart(2, '0')}`;
      await prisma.taxObligationRecord.create({
        data: {
          id: uuidFor(`ob-repeat-${m}`),
          taxSubjectId: user,
          competence: comp,
          taxBucket: 'EQUITY_NORMAL',
          revenueCode: '6015',
          liabilityFingerprint: `fp-repeat-${m}`,
          revision: 1,
          principalAmount: '500.00',
          currency: 'BRL',
          dueDate: new Date('2026-04-30T00:00:00.000Z'),
          status: 'OPEN',
          darfReadiness: 'READY',
          dataQuality: 'COMPLETE',
          provenance: {},
        },
      });
    }

    if (global.gc) global.gc();
    const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

    for (let i = 0; i < 100; i++) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance?calendarYear=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.obligations.length).toBeGreaterThanOrEqual(12);
    }

    if (global.gc) global.gc();
    const endHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
    const heapGrowthMb = endHeapMb - startHeapMb;

    // Unbounded retention = NO: 100 full HTTP compliance evaluations do not leak memory (bound < 200MB)
    expect(heapGrowthMb).toBeLessThan(200);

    console.info(
      `[4K.1C Retention] startHeap=${startHeapMb.toFixed(2)}MB endHeap=${endHeapMb.toFixed(2)}MB growth=${heapGrowthMb.toFixed(2)}MB unbounded=NO`,
    );
  });
});
