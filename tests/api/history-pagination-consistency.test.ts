import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: Portfolio History Pagination Consistency & Cursor Hardening', () => {
  let app: INestApplication;
  let user1Token: string;
  let user2Token: string;
  const prisma = getTestPrismaClient();

  const user1Id = '11111111-1111-4111-8111-111111111111';
  const user2Id = '22222222-2222-4222-8222-222222222222';
  let portfolio1Id: string;
  let portfolio2Id: string;
  let account1Id: string;
  let account2Id: string;
  let assetPetr4Id: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();

    await prisma.user.create({
      data: {
        id: user1Id,
        email: 'user1-pagination@atlas.dev',
        name: 'User 1 Pagination',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    await prisma.user.create({
      data: {
        id: user2Id,
        email: 'user2-pagination@atlas.dev',
        name: 'User 2 Pagination',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const s1 = await createAuthenticatedUserSession(user1Id);
    user1Token = s1.token;

    const s2 = await createAuthenticatedUserSession(user2Id);
    user2Token = s2.token;

    const p1 = await prisma.portfolio.create({
      data: {
        userId: user1Id,
        name: 'P1 Pagination',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolio1Id = p1.id;

    const p2 = await prisma.portfolio.create({
      data: {
        userId: user2Id,
        name: 'P2 Pagination',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolio2Id = p2.id;

    const institution = await prisma.institution.create({
      data: {
        name: 'Broker Test',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const acc1 = await prisma.account.create({
      data: {
        portfolioId: portfolio1Id,
        institutionId: institution.id,
        name: 'Acc 1',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account1Id = acc1.id;

    const acc2 = await prisma.account.create({
      data: {
        portfolioId: portfolio2Id,
        institutionId: institution.id,
        name: 'Acc 2',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account2Id = acc2.id;

    const petr4 = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetPetr4Id = petr4.id;

    // Seed 10 distinct transactions in Portfolio 1
    // Initial deposit: Jan 1
    await prisma.transaction.create({
      data: {
        portfolioId: portfolio1Id,
        accountId: account1Id,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-01T10:00:00Z'),
        amount: '100000.00',
        currency: 'BRL',
      },
    });

    // Buys on Jan 2..Jan 6
    for (let i = 2; i <= 6; i++) {
      const day = i.toString().padStart(2, '0');
      await prisma.transaction.create({
        data: {
          portfolioId: portfolio1Id,
          accountId: account1Id,
          assetId: assetPetr4Id,
          type: 'BUY',
          tradeDate: new Date(`2026-01-${day}T10:00:00Z`),
          quantity: '100',
          unitPrice: '20.00',
          amount: '2000.00',
          currency: 'BRL',
        },
      });
    }

    // Dividends on Jan 7..Jan 10
    for (let i = 7; i <= 10; i++) {
      const day = i.toString().padStart(2, '0');
      await prisma.transaction.create({
        data: {
          portfolioId: portfolio1Id,
          accountId: account1Id,
          assetId: assetPetr4Id,
          type: 'DIVIDEND',
          tradeDate: new Date(`2026-01-${day}T10:00:00Z`),
          amount: '50.00',
          currency: 'BRL',
        },
      });
    }

    // Seed 1 transaction in Portfolio 2
    await prisma.transaction.create({
      data: {
        portfolioId: portfolio2Id,
        accountId: account2Id,
        type: 'DEPOSIT',
        tradeDate: new Date('2026-01-01T10:00:00Z'),
        amount: '5000.00',
        currency: 'BRL',
      },
    });
  });

  it('1. Paged iteration matches unpaginated history completely without gaps or duplicates', async () => {
    // 1. Fetch unpaginated
    const fullRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?limit=100`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(fullRes.status).toBe(200);
    const fullItems = fullRes.body.data;
    expect(fullItems.length).toBeGreaterThan(0);

    // 2. Fetch page by page with limit=2
    const pagedItems: unknown[] = [];
    let cursor: string | null = null;
    let pagesFetched = 0;

    do {
      pagesFetched++;
      const url = cursor
        ? `/api/v1/portfolios/${portfolio1Id}/history?limit=2&cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/portfolios/${portfolio1Id}/history?limit=2`;

      const pageRes = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(pageRes.status).toBe(200);
      expect(pageRes.body.data.length).toBeLessThanOrEqual(2);
      pagedItems.push(...pageRes.body.data);

      cursor = pageRes.body.meta.nextCursor;
      if (!pageRes.body.meta.hasMore) {
        expect(cursor).toBeNull();
        break;
      }
      expect(typeof cursor).toBe('string');
    } while (cursor && pagesFetched < 20);

    // Verify exact sequence match
    expect(pagedItems.length).toBe(fullItems.length);
    for (let i = 0; i < fullItems.length; i++) {
      expect((pagedItems[i] as { id: string }).id).toBe(fullItems[i].id);
      expect((pagedItems[i] as { tradeDate: string }).tradeDate).toBe(fullItems[i].tradeDate);
    }
  });

  it('2. Invalid cursor throws 400 PORTFOLIO.INVALID_PAGINATION_CURSOR', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?cursor=non-existent-cursor-id`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PORTFOLIO.INVALID_PAGINATION_CURSOR');
  });

  it('3. Cross-portfolio cursor reuse (IDOR attempt) throws 400 PORTFOLIO.INVALID_PAGINATION_CURSOR', async () => {
    // Get cursor from Portfolio 1
    const p1Res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?limit=1`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(p1Res.status).toBe(200);
    const p1Cursor = p1Res.body.meta.nextCursor;
    expect(p1Cursor).toBeDefined();

    // User 2 tries to use User 1 cursor on Portfolio 2
    const p2Res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio2Id}/history?cursor=${encodeURIComponent(p1Cursor)}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(p2Res.status).toBe(400);
    expect(p2Res.body.code).toBe('PORTFOLIO.INVALID_PAGINATION_CURSOR');
  });

  it('4. Limit validation: rejects limit > 200 or <= 0 with 400 PORTFOLIO.INVALID_HISTORY_FILTER', async () => {
    const overLimitRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?limit=201`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(overLimitRes.status).toBe(400);
    expect(overLimitRes.body.code).toBe('PORTFOLIO.INVALID_HISTORY_FILTER');

    const zeroLimitRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?limit=0`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(zeroLimitRes.status).toBe(400);
    expect(zeroLimitRes.body.code).toBe('PORTFOLIO.INVALID_HISTORY_FILTER');

    const invalidLimitRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio1Id}/history?limit=abc`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(invalidLimitRes.status).toBe(400);
    expect(invalidLimitRes.body.code).toBe('PORTFOLIO.INVALID_HISTORY_FILTER');
  });
});
