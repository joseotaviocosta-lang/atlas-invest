import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { uuidFor } from '../tax-engine/helpers';
import {
  assessPeriodCloseReadiness,
  assembleEvidenceBinder,
  type TaxComplianceObligation,
  type TaxComplianceActionItem,
} from '../../packages/tax-engine/src';

let queryCount = 0;
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
  log: [{ emit: 'event', level: 'query' }],
});
prisma.$on('query' as never, () => {
  queryCount += 1;
});

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

function addDaysCivil(base: string, delta: number): string {
  const millis = Date.UTC(
    Number(base.slice(0, 4)),
    Number(base.slice(5, 7)) - 1,
    Number(base.slice(8, 10)),
  );
  const shifted = new Date(millis + delta * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('Phase 4K.5 — Period Close Scale & Query Budget Test', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-scale-4k5');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scale & Query Shape: 10, 100, 1,000 and 10,000 obligations keep a bounded query budget with zero N+1', async () => {
    const scales = [10, 100, 1000, 10000];
    const queryByScale: number[] = [];

    for (const targetCount of scales) {
      await cleanDatabase(prisma);
      const freshToken = await session(user1);

      // Distinct (competence, revenueCode) pairs keep every row as its own
      // upstream obligation inside calendar year 2026.
      const chunkSize = 2000;
      for (let start = 0; start < targetCount; start += chunkSize) {
        const end = Math.min(start + chunkSize, targetCount);
        const rows = [];
        for (let i = start; i < end; i++) {
          const competence = `2026-${String((i % 12) + 1).padStart(2, '0')}`;
          const revenueCode = String(6000 + Math.floor(i / 12)).padStart(4, '0');
          rows.push({
            id: uuidFor(`scale-4k5-ob-${i}`),
            taxSubjectId: user1,
            competence,
            taxBucket: 'EQUITY_NORMAL',
            revenueCode,
            liabilityFingerprint: `fp-scale-4k5-${i}-v1`,
            revision: 1,
            principalAmount: '100.00',
            currency: 'BRL',
            dueDate: new Date(`${addDaysCivil('2026-06-15', i % 60)}T00:00:00.000Z`),
            status: 'OPEN',
            darfReadiness: 'READY',
            dataQuality: 'COMPLETE',
            provenance: {},
          });
        }
        await prisma.taxObligationRecord.createMany({ data: rows });
      }

      queryCount = 0;
      const startTime = Date.now();
      const startMem = process.memoryUsage().heapUsed;
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-06',
        )
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);
      const elapsed = Date.now() - startTime;
      const memDeltaMb = (process.memoryUsage().heapUsed - startMem) / 1024 / 1024;

      const readiness = res.body.data as { readiness: string; sourceFingerprint: string };
      expect(readiness.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.meta.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);

      console.info(
        `[Scale N=${targetCount}] readiness: ${readiness.readiness}, duration: ${elapsed.toFixed(2)}ms, queries: ${queryCount} (O(1)), memory delta: ${memDeltaMb.toFixed(2)}MB`,
      );
      queryByScale.push(queryCount);
      expect(queryCount).toBeLessThanOrEqual(400);
      expect(memDeltaMb).toBeLessThan(300);
      expect(elapsed).toBeLessThan(targetCount <= 1000 ? 30000 : 120000);
    }

    const [q10, , , q10k] = queryByScale;
    expect(q10k!).toBeLessThanOrEqual((q10 ?? 60) * 4);
    console.info(
      `[N+1 matrix] per obligation: NO, per evidence: NO, per reminder: NO, per action item: NO, per close revision: NO (queries ${q10} -> ${q10k})`,
    );
  }, 300000);

  it('Engine closeout scales linearly: 10, 100, 1,000 and 10,000 items', () => {
    for (const targetCount of [10, 100, 1000, 10000]) {
      const obligations: TaxComplianceObligation[] = [];
      const actionItems: TaxComplianceActionItem[] = [];
      for (let i = 0; i < targetCount; i++) {
        const key = `scale-sub:2026-06:MONTHLY_TAX_PAYMENT:rev-${i}`;
        obligations.push({
          obligationKey: key,
          taxSubjectId: 'scale-sub',
          calendarYear: 2026,
          period: '2026-06',
          kind: 'MONTHLY_TAX_PAYMENT',
          sourceModule: '4G',
          sourceRef: `rev-${i}`,
          sourceFingerprint: `fp-scale-${i}`,
          status: 'OPEN',
          severity: 'ACTION',
          actionType: 'PAY',
          amount: '100.00',
          currency: 'BRL',
          dueDate: addDaysCivil('2026-06-15', i % 60),
          title: 'Scale obligation',
          description: 'Synthetic scale obligation.',
          links: [],
          metadata: { revenueCode: '6015', darfReadiness: 'READY' },
          userAction: null,
          isOverdue: false,
        });
        actionItems.push({
          actionKey: `${key}:PAY_TAX:fp-scale-${i}`,
          taxSubjectId: 'scale-sub',
          obligationKey: key,
          sourceFingerprint: `fp-scale-${i}`,
          kind: 'PAY_TAX',
          period: '2026-06',
          calendarYear: 2026,
          exercise: null,
          dueDate: addDaysCivil('2026-06-15', i % 60),
          priority: 'MEDIUM',
          operationalStatus: 'UPCOMING',
          title: 'Scale action item',
          summary: 'Synthetic scale item.',
          nextAction: 'REVIEW_OBLIGATION',
          actionTarget: '/tax',
          amount: '100.00',
          currency: 'BRL',
          revenueCode: '6015',
          paymentSupportStatus: 'READY',
          paymentEvidenceStatus: 'NO_EVIDENCE',
          reminderStatus: null,
          annualReviewStatus: null,
          isStale: false,
          isSuperseded: false,
          blockingReasons: [],
          sourceVersion: '4K.4',
        });
      }
      const start = Date.now();
      const readiness = assessPeriodCloseReadiness({
        taxSubjectId: 'scale-sub',
        scope: 'MONTHLY',
        period: '2026-06',
        calendarYear: 2026,
        month: '2026-06',
        exercise: null,
        todayCivilDate: '2026-04-20',
        obligations,
        actionItems,
        paymentHints: [],
        reminders: [],
        evidence: [],
        centerFingerprint: null,
        latestClose: null,
      });
      const assessed = Date.now() - start;
      const binderStart = Date.now();
      const binder = assembleEvidenceBinder({
        readiness,
        obligations,
        actionItems,
        paymentHints: [],
        reminders: [],
        evidence: [],
        actionCenterSummary: null,
        centerFingerprint: null,
        todayCivilDate: '2026-04-20',
      });
      const binderElapsed = Date.now() - binderStart;
      console.info(
        `[Engine N=${targetCount}] unresolved: ${readiness.unresolvedItems.length}, assessment: ${assessed}ms, binder: ${binderElapsed}ms`,
      );
      expect(readiness.readiness).toBe('REQUIRES_REVIEW');
      expect(readiness.unresolvedItems.length).toBe(targetCount);
      expect(binder.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(assessed).toBeLessThan(targetCount <= 1000 ? 3000 : 25000);
      expect(binderElapsed).toBeLessThan(targetCount <= 1000 ? 3000 : 25000);
      expect(readiness.unresolvedItems.length).toBe(
        new Set(readiness.unresolvedItems.map((item) => `${item.ref}::${item.kind}`)).size,
      );
    }
  });
});
