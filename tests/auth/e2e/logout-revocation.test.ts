import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp, cleanDatabase, getTestPrismaClient } from '../setup';

describe('Auth E2E: Logout & Session Revocation', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    const res = await createAuthTestApp();
    app = res.app;
  });

  afterAll(async () => {
    await closeAuthTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should logout and reject unexpired access token once session is revoked', async () => {
    // 1. Register and Login
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'logout-user@atlas.dev',
      password: 'LogoutPassword123!',
      name: 'Logout User',
    });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'logout-user@atlas.dev',
      password: 'LogoutPassword123!',
    });

    const token = loginRes.body.data.accessToken;

    // Verify token works
    const meBefore = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meBefore.status).toBe(200);

    // 2. Logout
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.success).toBe(true);

    // 3. Verify session was revoked in database
    const sessions = await prisma.session.findMany({
      where: { userId: loginRes.body.data.user.id },
    });
    expect(sessions[0].revokedAt).not.toBeNull();

    // 4. Accessing protected route with the same JWT token MUST now fail with 401
    const meAfter = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meAfter.status).toBe(401);
    expect(meAfter.body.code).toBe('AUTH.SESSION_REVOKED');
  });
});
