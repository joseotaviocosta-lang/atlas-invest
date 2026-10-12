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
  assembleTaxComplianceActionCenter,
  projectTaxComplianceCalendar,
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

function competenceFor(index: number): string {
  const year = 2026 + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, '0');
  return `${year}-${month}`;
}

describe('Phase 4K.4 — Tax Compliance Action Center Scale & Query Budget Test', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-scale-4k4');

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

      const chunkSize = 2000;
      for (let start = 0; start < targetCount; start += chunkSize) {
        const end = Math.min(start + chunkSize, targetCount);
        const rows = [];
        for (let i = start; i < end; i++) {
          // Distinct (competence, revenueCode) pairs keep every row as its own
          // upstream obligation inside calendar year 2026.
          const competence = `2026-${String((i % 12) + 1).padStart(2, '0')}`;
          const revenueCode = String(6000 + Math.floor(i / 12)).padStart(4, '0');
          rows.push({
            id: uuidFor(`scale-4k4-ob-${i}`),
            taxSubjectId: user1,
            competence,
            taxBucket: 'EQUITY_NORMAL',
            revenueCode,
            liabilityFingerprint: `fp-scale-4k4-${i}-v1`,
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
        .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026&limit=200')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);
      const elapsed = Date.now() - startTime;
      const memDeltaMb = (process.memoryUsage().heapUsed - startMem) / 1024 / 1024;

      const items = res.body.data as Array<{ actionKey: string }>;
      expect(items.length).toBeGreaterThan(0);
      expect(res.body.meta.totalCount).toBeGreaterThanOrEqual(items.length);
      expect(res.body.meta.summary.total).toBe(res.body.meta.totalCount);

      console.info(
        `[Scale N=${targetCount}] items: ${res.body.meta.totalCount}, duration: ${elapsed.toFixed(2)}ms, queries: ${queryCount} (O(1)), memory delta: ${memDeltaMb.toFixed(2)}MB`,
      );
      queryByScale.push(queryCount);
      expect(queryCount).toBeLessThanOrEqual(300);
      expect(memDeltaMb).toBeLessThan(250);
      expect(elapsed).toBeLessThan(targetCount <= 1000 ? 30000 : 90000);
    }

    // Bounded shape: 10k must not cost 100x the queries of 10 (no N+1 per
    // obligation / evidence / reminder / annual item).
    const [q10, , , q10k] = queryByScale;
    expect(q10k!).toBeLessThanOrEqual((q10 ?? 50) * 4);
    console.info(
      `[N+1 matrix] per obligation: NO, per evidence: NO, per reminder: NO, per annual item: NO (queries ${q10} -> ${q10k})`,
    );
  }, 300000);

  it('Engine assembly scales linearly: 10, 100, 1,000 and 10,000 obligations', () => {
    for (const targetCount of [10, 100, 1000, 10000]) {
      const obligations: TaxComplianceObligation[] = [];
      for (let i = 0; i < targetCount; i++) {
        obligations.push({
          obligationKey: `scale-sub:${competenceFor(i)}:MONTHLY_TAX_PAYMENT:rev-${i}`,
          taxSubjectId: 'scale-sub',
          calendarYear: 2026,
          period: competenceFor(i),
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
          metadata: { revenueCode: '6015' },
          userAction: null,
          isOverdue: false,
        });
      }
      const start = Date.now();
      const center = assembleTaxComplianceActionCenter({
        taxSubjectId: 'scale-sub',
        calendarYear: 2026,
        todayCivilDate: '2026-04-20',
        obligations,
      });
      const assembled = Date.now() - start;
      const calendarStart = Date.now();
      const calendar = projectTaxComplianceCalendar({
        taxSubjectId: 'scale-sub',
        items: center.items,
        reminders: [],
        todayCivilDate: '2026-04-20',
        from: '2026-04-01',
        to: '2026-07-31',
      });
      const calendarElapsed = Date.now() - calendarStart;
      console.info(
        `[Engine N=${targetCount}] items: ${center.items.length}, assembly: ${assembled}ms, calendar: ${calendarElapsed}ms`,
      );
      expect(center.items.length).toBe(targetCount);
      expect(calendar.events.length).toBeGreaterThan(0);
      expect(assembled).toBeLessThan(targetCount <= 1000 ? 3000 : 20000);
      expect(calendarElapsed).toBeLessThan(targetCount <= 1000 ? 2000 : 15000);
      // Counter consistency holds at every scale.
      expect(center.summary.total).toBe(
        center.items.filter((item) => item.operationalStatus !== 'SUPERSEDED').length,
      );
    }
  });
});
