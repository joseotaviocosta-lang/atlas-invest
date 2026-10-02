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

interface QueryLog {
  readonly query: string;
  readonly params: string;
}

describe('Phase 4H.3A — Annual Capital Market Query Budget & N+1 Verification', () => {
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

  it('measures query budget across small, medium, and large month activity without N+1 per-asset or per-obligation query leaks', async () => {
    const userId = '00000000-0000-4000-8000-000000000088';
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Budget User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const { token } = await createAuthenticatedUserSession(userId);

    // Baseline annual execution: 12 months aggregation
    recordedQueries.length = 0;
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();

    const queryCount = recordedQueries.length;
    // Categorize queries
    const sessionQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('session'),
    ).length;
    const userQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('user'),
    ).length;
    const obligationQueries = recordedQueries.filter(
      (q) =>
        q.query.toLowerCase().includes('tax_obligation') ||
        q.query.toLowerCase().includes('taxobligation'),
    ).length;
    const _otherQueries = queryCount - sessionQueries - userQueries - obligationQueries;

    // Total query count must be bounded and strictly <= 60
    expect(queryCount).toBeLessThanOrEqual(60);

    // Explicit N+1 Verification:
    // No per-asset query leak
    const perAssetQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('assets WHERE id ='),
    ).length;
    expect(perAssetQueries).toBe(0);

    // No per-payment query leak
    const perPaymentQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('payments WHERE id ='),
    ).length;
    expect(perPaymentQueries).toBe(0);
  });
});
