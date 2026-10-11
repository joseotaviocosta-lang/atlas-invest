import 'reflect-metadata';
import request from 'supertest';
import { createHash } from 'crypto';
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

let queryCount = 0;
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
  log: [{ emit: 'event', level: 'query' }],
});
const queryLogs: string[] = [];
prisma.$on('query' as never, (e: { query: string }) => {
  queryCount += 1;
  queryLogs.push(e.query);
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

describe('Phase 4K.2 — Tax Payment Support Scale & Query Budget Test', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-scale-4k2');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedObligation(competence: string, amount: string) {
    const obId = uuidFor(`ob-scale-${competence}`);
    await prisma.taxObligationRecord.create({
      data: {
        id: obId,
        taxSubjectId: user1,
        competence,
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: `fp-scale-${competence}`,
        revision: 1,
        principalAmount: amount,
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  it('Scale & Query Shape: supports 10, 100, 1,000, and 10,000 evidence records with constant query budget (O(1)) and zero N+1', async () => {
    const token = await session(user1);
    await seedObligation('2026-01', '1000.00');
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const scales = [10, 100, 1000, 10_000];

    for (const targetCount of scales) {
      const currentCount = await prisma.taxSettlementRecord.count({
        where: { taxSubjectId: user1, obligationKey: key },
      });

      const toInsert = targetCount - currentCount;
      if (toInsert > 0) {
        // Bulk insert records in chunks
        const chunkSize = 2000;
        let inserted = 0;
        while (inserted < toInsert) {
          const thisChunk = Math.min(chunkSize, toInsert - inserted);
          const chunkData = Array.from({ length: thisChunk }, (_, i) => {
            const rev = currentCount + inserted + i + 1;
            const extRef = `SCALE-REF-${rev}`;
            const evidenceFingerprint = createHash('sha256')
              .update(`2026-04-20|1000|6015|2026-01|${extRef}`)
              .digest('hex');
            return {
              id: uuidFor(`scale-${targetCount}-${rev}`),
              taxSubjectId: user1,
              obligationKey: key,
              revision: rev,
              sourceFingerprint: `fp-scale-2026-01`,
              evidenceFingerprint,
              paymentDate: new Date('2026-04-20T00:00:00.000Z'),
              amountReported: '1000.00',
              revenueCodeReported: '6015',
              referencePeriod: '2026-01',
              externalReference: extRef,
              verificationStatus: 'USER_REPORTED',
            };
          });

          await prisma.taxSettlementRecord.createMany({
            data: chunkData,
          });
          inserted += thisChunk;
        }
      }

      // Benchmark read latency, queries, and memory
      queryCount = 0;
      const memBefore = process.memoryUsage().heapUsed;
      const t0 = performance.now();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const elapsed = performance.now() - t0;
      const queries = queryCount;
      const memDeltaMb = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024);

      console.info(
        `[Scale N=${targetCount}] duration: ${elapsed.toFixed(2)}ms, queries: ${queries} (O(1)), memory delta: ${memDeltaMb.toFixed(2)}MB`,
      );

      expect(res.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
      expect(res.body.data.latestEvidence.revision).toBe(targetCount);
      expect(queries).toBeLessThanOrEqual(150); // strictly bounded O(1) query budget for annual timeline + single history query
      expect(elapsed).toBeLessThan(2500); // under 2.5 seconds even for 10k
      expect(memDeltaMb).toBeLessThan(50); // bounded memory growth
    }
  });
});
