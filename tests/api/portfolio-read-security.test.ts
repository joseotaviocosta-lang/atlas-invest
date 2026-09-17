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

describe('API Security: Portfolio Read Endpoints Privacy & Authorization', () => {
  let app: INestApplication;
  let user1Token: string;
  let user2Token: string;
  const prisma = getTestPrismaClient();

  const user1Id = '11111111-1111-4111-8111-111111111111';
  const user2Id = '22222222-2222-4222-8222-222222222222';
  let portfolio1Id: string;
  let portfolio2Id: string;
  let account2Id: string;

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
        email: 'user1-sec@atlas.dev',
        name: 'User One',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    await prisma.user.create({
      data: {
        id: user2Id,
        email: 'user2-sec@atlas.dev',
        name: 'User Two',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session1 = await createAuthenticatedUserSession(user1Id);
    user1Token = session1.token;

    const session2 = await createAuthenticatedUserSession(user2Id);
    user2Token = session2.token;

    const p1 = await prisma.portfolio.create({
      data: {
        userId: user1Id,
        name: 'Portfolio User 1',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolio1Id = p1.id;

    const p2 = await prisma.portfolio.create({
      data: {
        userId: user2Id,
        name: 'Portfolio User 2',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolio2Id = p2.id;

    const inst = await prisma.institution.create({
      data: {
        name: 'XP Investimentos',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const acc2 = await prisma.account.create({
      data: {
        portfolioId: portfolio2Id,
        institutionId: inst.id,
        name: 'Account User 2',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    account2Id = acc2.id;
  });

  describe('401 Unauthorized for Unauthenticated Requests', () => {
    it('GET /state requires authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio1Id}/state`)
        .expect(401);
    });

    it('GET /positions requires authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio1Id}/positions`)
        .expect(401);
    });

    it('GET /history requires authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio1Id}/history`)
        .expect(401);
    });
  });

  describe('404 Not Found (Privacy Preserving) for Cross-User Access', () => {
    it('User 1 cannot access User 2 portfolio state (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio2Id}/state`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      expect(res.body.code).toBe('PORTFOLIO.NOT_FOUND');
    });

    it('User 1 cannot access User 2 portfolio positions (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio2Id}/positions`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      expect(res.body.code).toBe('PORTFOLIO.NOT_FOUND');
    });

    it('User 1 cannot access User 2 portfolio history (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio2Id}/history`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      expect(res.body.code).toBe('PORTFOLIO.NOT_FOUND');
    });

    it('User 2 can access their own portfolio state (returns 200)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio2Id}/state`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);
    });
  });

  describe('404 Not Found for Foreign Account Filter (Account Scoping)', () => {
    it('User 1 cannot filter positions by User 2 accountId (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio1Id}/positions?accountId=${account2Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      expect(res.body.code).toBe('PORTFOLIO.INVALID_ACCOUNT_SCOPE');
    });

    it('User 1 cannot filter history by User 2 accountId (returns 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio1Id}/history?accountId=${account2Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);

      expect(res.body.code).toBe('PORTFOLIO.INVALID_ACCOUNT_SCOPE');
    });
  });
});
