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

describe('Phase 4H.6A — Annual Tax Reporting Query Budget & N+1 Absence Proof', () => {
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

  async function seedPortfolio(userId: string, assetCount: number): Promise<void> {
    const institution = await prisma.institution.create({
      data: {
        id: uuidFor(`inst-qb-${userId}`),
        name: 'XP INVESTIMENTOS',
        type: 'BROKER',
        country: 'BR',
      },
    });
    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor(`port-qb-${userId}`),
        userId,
        name: 'Main Port',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const account = await prisma.account.create({
      data: {
        id: uuidFor(`acc-qb-${userId}`),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Main Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    for (let i = 0; i < assetCount; i++) {
      const asset = await prisma.asset.create({
        data: {
          id: uuidFor(`asset-qb-${userId}-${i}`),
          ticker: `TICK${i}_${userId.slice(0, 6)}`,
          name: `Ticker ${i} ON`,
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
      });

      await prisma.transaction.create({
        data: {
          id: uuidFor(`tx-qb-${userId}-${i}`),
          accountId: account.id,
          portfolioId: portfolio.id,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2025-02-15T00:00:00.000Z'),
          settlementDate: new Date('2025-02-17T00:00:00.000Z'),
          quantity: '100.000000000000000000',
          unitPrice: '10.000000000000000000',
          currency: 'BRL',
          amount: '1000.000000000000000000',
        },
      });
    }
  }

  it('Verifies constant query budget and 0 N+1 across 1 vs 5 vs 10 assets', async () => {
    // 1 Asset
    const user1Id = uuidFor('user-qb-1');
    await prisma.user.create({
      data: {
        id: user1Id,
        email: `${user1Id}@atlas.dev`,
        name: 'User 1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token: token1 } = await createAuthenticatedUserSession(user1Id);
    await seedPortfolio(user1Id, 1);

    recordedQueries.length = 0;
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(res1.body.data).toBeDefined();
    const count1 = recordedQueries.length;

    // 5 Assets
    const user5Id = uuidFor('user-qb-5');
    await prisma.user.create({
      data: {
        id: user5Id,
        email: `${user5Id}@atlas.dev`,
        name: 'User 5',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token: token5 } = await createAuthenticatedUserSession(user5Id);
    await seedPortfolio(user5Id, 5);

    recordedQueries.length = 0;
    const res5 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token5}`)
      .expect(200);

    expect(res5.body.data).toBeDefined();
    const count5 = recordedQueries.length;

    // 10 Assets
    const user10Id = uuidFor('user-qb-10');
    await prisma.user.create({
      data: {
        id: user10Id,
        email: `${user10Id}@atlas.dev`,
        name: 'User 10',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token: token10 } = await createAuthenticatedUserSession(user10Id);
    await seedPortfolio(user10Id, 10);

    recordedQueries.length = 0;
    const res10 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token10}`)
      .expect(200);

    expect(res10.body.data).toBeDefined();
    const count10 = recordedQueries.length;

    // Prove 0 N+1: query count is strictly invariant of asset count
    expect(count5).toBe(count1);
    expect(count10).toBe(count1);
  });
});
