import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';

describe('API Integration: Portfolio Performance Endpoint (GET /api/v1/portfolios/:id/performance)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Perf Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  it('requires authentication (401)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portfolios/11111111-1111-4111-8111-111111111111/performance')
      .expect(401);
    expect(res.body.code).toBe('AUTH.UNAUTHORIZED');
  });

  it('returns 404 for cross-user', async () => {
    const user1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const user2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await ensureUser(user1);
    await ensureUser(user2);
    const { token: t1 } = await createAuthenticatedUserSession(user1);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${t1}`)
      .send({ name: 'Perf Port', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const { token: t2 } = await createAuthenticatedUserSession(user2);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioRes.body.data.id}/performance`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('returns UNAVAILABLE when no historical data (foundation)', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Perf Port', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/performance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.portfolioId).toBe(portfolioId);
    expect(res.body.data.dataAvailability).toBe('UNAVAILABLE');
    expect(res.body.data.status).toBe('INSUFFICIENT_DATA');
    // Decimal strings not needed when unavailable, but structure should exist
    expect(res.body.data.period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No provider internals
    expect(JSON.stringify(res.body)).not.toContain('StooqCsvRow');
  });

  it('validates period start > end → 400', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Perf Port', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance?startDate=2026-02-01&endDate=2026-01-01`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('accepts valid period and returns decimal period strings', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Perf Port', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioRes.body.data.id}/performance?startDate=2026-01-01&endDate=2026-01-31`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.period.startDate).toBe('2026-01-01');
    expect(res.body.data.period.endDate).toBe('2026-01-31');
  });
});
