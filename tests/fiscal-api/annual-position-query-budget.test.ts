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
import { Asset } from '@atlas/domain';

describe('Phase 4H.2 — Annual Positions Query Budget & Batching (Real App Path)', () => {
  let app: INestApplication;
  let queryCount = 0;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, () => {
      queryCount += 1;
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
    queryCount = 0;
  });

  it('Verifies batch retrieval: Generating annual position report executes constant/bounded number of queries', async () => {
    const userId = '00000000-0000-4000-8000-000000000099';
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Budget User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Budget Portfolio', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const inst = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XP', type: 'BROKER', country: 'BR' })
      .expect(201);

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: inst.body.data.id, name: 'XP Custody', currency: 'BRL' })
      .expect(201);
    const accountId = accountRes.body.data.id;

    // Create 10 assets and transactions
    for (let i = 1; i <= 10; i++) {
      const asset = Asset.create({
        ticker: `ASSET${i}`,
        name: `Asset ${i}`,
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'B3',
      });
      await prisma.asset.create({
        data: {
          id: asset.id,
          ticker: asset.ticker,
          name: asset.name,
          type: asset.type,
          currency: asset.currency,
          exchange: asset.exchange,
        },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          accountId,
          assetId: asset.id,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2025-02-15',
          quantity: '100',
          unitPrice: '10.00',
        })
        .expect(201);
    }

    // Reset query count to measure only the report query budget
    queryCount = 0;

    const reportRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(reportRes.body.data.positions).toHaveLength(10);
    // The query budget should be small and bounded (session check, portfolio check, transactions fetch, opening positions fetch, asset metadata fetch)
    // and definitely not 1 query per transaction (no N+1)
    expect(queryCount).toBeLessThanOrEqual(10);
  });
});
