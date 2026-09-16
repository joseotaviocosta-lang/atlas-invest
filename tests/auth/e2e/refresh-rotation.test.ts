import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp, cleanDatabase, getTestPrismaClient } from '../setup';

describe('Auth E2E: Refresh Token Rotation & Reuse Detection', () => {
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

  it('should rotate refresh token and detect token reuse (revoking entire session)', async () => {
    // 1. Register & Login
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'rotation-user@atlas.dev',
      password: 'RotationPassword123!',
      name: 'Rotation User',
    });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'rotation-user@atlas.dev',
      password: 'RotationPassword123!',
    });

    const tokenA = loginRes.body.data.refreshToken;
    expect(tokenA).toBeDefined();

    // 2. Rotate with Token A -> receives Token B
    const refreshRes1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenA });

    expect(refreshRes1.status).toBe(200);
    const tokenB = refreshRes1.body.data.refreshToken;
    const newAccessToken = refreshRes1.body.data.accessToken;
    expect(tokenB).toBeDefined();
    expect(tokenB).not.toBe(tokenA);
    expect(newAccessToken).toBeDefined();

    // Verify token B works on protected route
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);
    expect(meRes.status).toBe(200);

    // 3. REUSE Token A: Attempt to refresh using old rotated Token A
    const reuseRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenA });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('AUTH.INVALID_REFRESH_TOKEN');
    expect(reuseRes.body.message).toContain('reuse detected');

    // 4. Verify session was revoked in database
    const sessionInDb = await prisma.session.findFirst({
      where: { previousRefreshTokenHash: { not: null } },
    });
    expect(sessionInDb?.revokedAt).not.toBeNull();

    // 5. Subsequent attempts with Token B should now also be rejected because the session was revoked!
    const refreshRes2 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenB });

    expect(refreshRes2.status).toBe(401);
    expect(refreshRes2.body.code).toBe('AUTH.SESSION_REVOKED');
  });
});
