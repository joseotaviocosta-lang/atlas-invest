import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  createAuthenticatedUserSession,
  getTestPrismaClient,
} from './setup';

describe('API Integration: APP-16T Contribution Allocation Simulator', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;
  });

  it('POST /decision-brief/simulate returns 200 with exact cents conservation and zero transactions or order side effects', async () => {
    const prisma = getTestPrismaClient();

    // Count transactions before simulation
    const initialTxCount = await prisma.transaction.count({ where: { portfolioId } });

    // Seed 2 active holdings
    const asset1 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const asset2 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'ITUB4',
        name: 'Itaú Unibanco PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: randomUUID(),
          portfolioId,
          accountId: '44444444-4444-4444-8444-444444444444',
          assetId: asset1.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '28.00',
          amount: '2800.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
        {
          id: randomUUID(),
          portfolioId,
          accountId: '44444444-4444-4444-8444-444444444444',
          assetId: asset2.id,
          type: 'BUY',
          tradeDate: new Date('2026-10-01T00:00:00.000Z'),
          quantity: '100',
          unitPrice: '32.00',
          amount: '3200.00',
          currency: 'BRL',
          source: 'MANUAL',
        },
      ],
    });

    const now = new Date();
    await prisma.marketQuoteRecord.createMany({
      data: [
        {
          id: randomUUID(),
          assetId: asset1.id,
          tradingDate: now,
          currency: 'BRL',
          close: '28.50',
          provider: 'BRAPI',
          providerSymbol: 'BBAS3',
          firstFetchedAt: now,
          lastFetchedAt: now,
        },
        {
          id: randomUUID(),
          assetId: asset2.id,
          tradingDate: now,
          currency: 'BRL',
          close: '35.00',
          provider: 'BRAPI',
          providerSymbol: 'ITUB4',
          firstFetchedAt: now,
          lastFetchedAt: now,
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '2000.00' })
      .expect(200);

    const data = res.body.data;
    expect(data.portfolioId).toBe(portfolioId);
    expect(data.contributionAmount).toBe('2000.00');
    expect(data.totalCents).toBe(200000);
    expect(data.allocatedCents + data.unallocatedCents).toBe(200000);
    expect(data.modelVersion).toBe('opportunity-v2.3.1');

    // Confirm ZERO transactions or side effects were created
    const postTxCount = await prisma.transaction.count({ where: { portfolioId } });
    expect(postTxCount).toBe(initialTxCount + 2); // only our seeded transactions
  });

  it('rejects invalid simulation amounts with 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '-100' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '0' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 'abc' })
      .expect(400);

    // Over maximum simulation limit (100M)
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '100000000.01' })
      .expect(400);
  });

  it('enforces 404 anti-enumeration for portfolios owned by another user', async () => {
    const prisma = getTestPrismaClient();
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-user-sim@example.com',
        passwordHash: 'test-hash',
        name: 'Other User',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUser.id);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${otherAuth.token}`)
      .send({ amount: '1000.00' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${randomUUID()}/decision-brief/simulate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '1000.00' })
      .expect(404);
  });
});
