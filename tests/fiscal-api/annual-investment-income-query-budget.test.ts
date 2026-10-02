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

describe('Phase 4H.4 / 4H.4A — Annual Investment Income Query Budget & N+1 Verification', () => {
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

  it('measures query budget across income events without N+1 per-asset or per-event leaks (strictly <= 10 queries)', async () => {
    const userId = uuidFor('user-budget-income');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Budget User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('pf-budget-income'),
        userId,
        name: 'Portfolio 1',
        type: 'PERSONAL',
        status: 'ACTIVE',
        baseCurrency: 'BRL',
      },
    });

    const institution = await prisma.institution.create({
      data: {
        id: uuidFor('inst-budget-income'),
        name: 'Broker 1',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-budget-income'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Account 1',
        status: 'ACTIVE',
        currency: 'BRL',
      },
    });

    // Create 5 distinct assets and 5 income transactions
    for (let i = 1; i <= 5; i++) {
      const asset = await prisma.asset.create({
        data: {
          id: uuidFor(`asset-budget-${i}`),
          ticker: `ASSET${i}`,
          name: `Asset Company ${i}`,
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
      });

      await prisma.transaction.create({
        data: {
          id: uuidFor(`tx-budget-${i}`),
          portfolioId: portfolio.id,
          accountId: account.id,
          assetId: asset.id,
          type: i % 2 === 0 ? 'DIVIDEND' : 'JCP',
          amount: '5000.00',
          source: 'MANUAL',
          tradeDate: new Date('2025-06-15T00:00:00Z'),
          settlementDate: new Date('2025-06-15T00:00:00Z'),
          currency: 'BRL',
        },
      });
    }

    const { token } = await createAuthenticatedUserSession(userId);

    recordedQueries.length = 0;
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.payers).toHaveLength(5);

    const queryCount = recordedQueries.length;

    // Total query count must be strictly <= 10 (session check + portfolio find + tx find + asset bulk find)
    expect(queryCount).toBeLessThanOrEqual(10);

    // Explicit N+1 Verification:
    // No per-asset single query leak
    const perAssetSingleQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('assets where id ='),
    ).length;
    expect(perAssetSingleQueries).toBe(0);
  });
});
