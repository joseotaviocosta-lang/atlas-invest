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

describe('API Integration: APP-16S Daily Portfolio Decision Brief', () => {
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

  it('returns 200 with PortfolioDailyDecisionBrief envelope and supports optional contributionAmount simulation', async () => {
    const res1 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res1.body.data).toBeDefined();
    expect(res1.body.data.portfolioId).toBe(portfolioId);
    expect(res1.body.data.modelVersion).toBe('opportunity-v2.3.1');
    expect(Array.isArray(res1.body.data.topPriorities)).toBe(true);
    expect(res1.body.data.dataQuality).toBeDefined();
    expect(res1.body.data.contributionContext.source).toBe('NONE');

    const res2 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=1250.50`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res2.body.data.contributionContext.source).toBe('USER_SIMULATION');
    expect(res2.body.data.contributionContext.plannedAmount).toBe('1250.50');
  });

  it('rejects invalid contributionAmount with 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=-50`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=0`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=abc`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);
  });

  it('enforces 404 anti-enumeration for portfolios owned by another user', async () => {
    const prisma = getTestPrismaClient();
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-decision-brief@example.com',
        passwordHash: 'test-hash',
        name: 'Other User',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUser.id);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief`)
      .set('Authorization', `Bearer ${otherAuth.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${randomUUID()}/decision-brief`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);
  });
});
