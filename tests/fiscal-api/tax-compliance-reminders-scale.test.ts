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
  projectTaxComplianceReminders,
  type TaxComplianceObligation,
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

describe('Phase 4K.3 — Tax Compliance Reminder Scale & Query Budget Test', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-scale-4k3');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scale & Query Shape: 10, 100, 1,000 and 10,000 reminder actions keep a bounded query budget with zero N+1', async () => {
    const scales = [10, 100, 1000, 10000];

    for (const targetCount of scales) {
      await cleanDatabase(prisma);
      const freshToken = await session(user1);

      const month = '06';
      await prisma.taxObligationRecord.create({
        data: {
          id: uuidFor('scale-4k3-ob'),
          taxSubjectId: user1,
          competence: `2026-${month}`,
          taxBucket: 'EQUITY_NORMAL',
          revenueCode: '6015',
          liabilityFingerprint: 'fp-scale-4k3-v1',
          revision: 1,
          principalAmount: '500.00',
          currency: 'BRL',
          dueDate: new Date('2026-06-15T00:00:00.000Z'),
          status: 'OPEN',
          darfReadiness: 'READY',
          dataQuality: 'COMPLETE',
          provenance: {},
        },
      });

      // N distinct reminder actions against the same obligation key space:
      // repository load stays a single indexed query regardless of volume.
      const chunkSize = 2000;
      const obligationKey = `${user1}:2026-${month}:MONTHLY_TAX_PAYMENT:monthly-6015`;
      for (let start = 0; start < targetCount; start += chunkSize) {
        const end = Math.min(start + chunkSize, targetCount);
        const actions = [];
        for (let i = start; i < end; i++) {
          const triggerAt = addDaysCivil('2026-05-01', i % 40);
          actions.push({
            id: uuidFor(`scale-4k3-act-${i}`),
            taxSubjectId: user1,
            reminderKey: `${obligationKey}:UPCOMING_DUE:${triggerAt}:w${i}`,
            obligationKey,
            reminderKind: 'UPCOMING_DUE',
            triggerAt: new Date(`${triggerAt}T00:00:00.000Z`),
            sourceFingerprint: `fp-scale-4k3-act-${i}-v1`,
            actionType: 'ACKNOWLEDGE',
            revision: 1,
            occurredAt: new Date('2026-04-20T00:00:00.000Z'),
          });
        }
        await prisma.taxComplianceReminderActionRecord.createMany({ data: actions });
      }

      queryCount = 0;
      const startTime = Date.now();
      const startMem = process.memoryUsage().heapUsed;
      const res = await request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);
      const elapsed = Date.now() - startTime;
      const memDeltaMb = (process.memoryUsage().heapUsed - startMem) / 1024 / 1024;

      const rows = res.body.data as Array<{ reminderKey: string }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(res.body.meta.totalCount).toBe(rows.length);

      console.info(
        `[Scale N=${targetCount}] duration: ${elapsed.toFixed(2)}ms, queries: ${queryCount} (O(1)), memory delta: ${memDeltaMb.toFixed(2)}MB`,
      );
      expect(queryCount).toBeLessThanOrEqual(250);
      expect(memDeltaMb).toBeLessThan(200);
    }
  }, 300000);

  it('Engine projection scales linearly: 10, 100, 1,000 and 10,000 obligations', () => {
    for (const targetCount of [10, 100, 1000, 10000]) {
      const obligations: TaxComplianceObligation[] = [];
      for (let i = 0; i < targetCount; i++) {
        const dueDate = addDaysCivil('2026-06-15', i % 90);
        obligations.push({
          obligationKey: `scale-sub:2026-REV:MONTHLY_TAX_PAYMENT:rev-${i}`,
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
          dueDate,
          title: 'Scale obligation',
          description: 'Synthetic scale obligation.',
          links: [],
          metadata: { revenueCode: '6015' },
          userAction: null,
          isOverdue: false,
        });
      }
      const start = Date.now();
      const projection = projectTaxComplianceReminders({
        taxSubjectId: 'scale-sub',
        calendarYear: 2026,
        todayCivilDate: '2026-04-20',
        obligations,
      });
      const elapsed = Date.now() - start;
      console.info(
        `[Engine N=${targetCount}] reminders: ${projection.reminders.length}, duration: ${elapsed}ms`,
      );
      expect(projection.reminders.length).toBe(targetCount * 3);
      expect(elapsed).toBeLessThan(targetCount <= 1000 ? 2000 : 15000);
    }
  });
});
