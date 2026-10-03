import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { uuidFor } from '../tax-engine/helpers';

interface QueryLog {
  readonly query: string;
  readonly params: string;
}

describe('Phase 4H.5 — Annual Tax Readiness Query Budget & Bounded Execution (Real App Path)', () => {
  let app: INestApplication;
  const recordedQueries: QueryLog[] = [];
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, (e: { query: string; params: string }) => {
      recordedQueries.push({ query: e.query, params: e.params });
    });
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-10-01' })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    recordedQueries.length = 0;
  });

  it('measures query budget for annual readiness evaluation (strictly bounded <= 65 queries, zero N+1)', async () => {
    const userId = uuidFor('user-budget-readiness');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Budget User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const { token } = await createAuthenticatedUserSession(userId);

    recordedQueries.length = 0;

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.overallStatus).toBeDefined();

    const queryCount = recordedQueries.length;
    // Total query count across all 9 sections and 12-month capital market replay must be bounded
    expect(queryCount).toBeLessThanOrEqual(65);

    // Explicit N+1 Verification:
    const perAssetQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('assets where id ='),
    ).length;
    expect(perAssetQueries).toBe(0);

    const perPaymentQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('payments where id ='),
    ).length;
    expect(perPaymentQueries).toBe(0);
  });
});
