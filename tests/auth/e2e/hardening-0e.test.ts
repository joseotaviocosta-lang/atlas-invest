import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createAuthTestApp,
  closeAuthTestApp,
  cleanDatabase,
  getTestPrismaClient,
  registerAndLoginUser,
} from '../setup';
import { InMemoryPasswordResetNotifier } from '../../../apps/api/src/auth/services/password-reset-notifier.interface';

describe('Auth E2E: Phase 0E Security Hardening Suite', () => {
  let app: INestApplication;
  let notifier: InMemoryPasswordResetNotifier;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    const res = await createAuthTestApp();
    app = res.app;
    notifier = res.notifier;
  });

  afterAll(async () => {
    await closeAuthTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    notifier.clear();
  });

  it('1. Token Family History: should detect reuse of any ancestor token (A -> B -> C, reuse A revokes session)', async () => {
    const session = await registerAndLoginUser(
      app,
      'family-history@atlas.dev',
      'FamilyPass123!',
      'Family User',
    );

    const tokenA = session.refreshToken;

    // Step 1: Rotate A -> B
    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenA });
    expect(resB.status).toBe(200);
    const tokenB = resB.body.data.refreshToken;
    expect(tokenB).not.toBe(tokenA);

    // Step 2: Rotate B -> C
    const resC = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenB });
    expect(resC.status).toBe(200);
    const tokenC = resC.body.data.refreshToken;
    expect(tokenC).not.toBe(tokenB);

    // Step 3: Reuse ancestor token A (not just the immediate parent B!)
    const reuseA = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenA });

    expect(reuseA.status).toBe(401);
    expect(reuseA.body.code).toBe('AUTH.INVALID_REFRESH_TOKEN');
    expect(reuseA.body.message).toContain('reuse detected');

    // Step 4: Token C should now also be rejected because the whole session/family was revoked
    const resSubsequentC = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokenC });

    expect(resSubsequentC.status).toBe(401);
    expect(resSubsequentC.body.code).toBe('AUTH.SESSION_REVOKED');
  });

  it('2. Refresh Concurrency Winner: should safely serialize concurrent refresh requests, preserving the winner session', async () => {
    const session = await registerAndLoginUser(
      app,
      'concurrent-refresh@atlas.dev',
      'ConcurrentPass123!',
      'Concurrent User',
    );

    const token = session.refreshToken;

    // Fire 2 concurrent refresh requests simultaneously
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: token }),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: token }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One must succeed (200), the other must fail (401)
    expect(statuses).toEqual([200, 401]);

    // Identify the winning response
    const winnerRes = res1.status === 200 ? res1 : res2;
    const loserRes = res1.status === 401 ? res1 : res2;

    expect(winnerRes.body.data.refreshToken).toBeDefined();
    expect(loserRes.body.code).toBe('AUTH.INVALID_REFRESH_TOKEN');

    // Invariant: The winning session MUST NOT have been revoked by the loser request in the race!
    const winningAccessToken = winnerRes.body.data.accessToken;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${winningAccessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('concurrent-refresh@atlas.dev');

    // And the new rotated refresh token B continues valid for future refresh
    const nextRefreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: winnerRes.body.data.refreshToken });

    expect(nextRefreshRes.status).toBe(200);
  });

  it('3. Password Reset Concurrency: should prevent race conditions on single-use reset token', async () => {
    await registerAndLoginUser(app, 'reset-concurrency@atlas.dev', 'ResetPass123!', 'Reset User');

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset-concurrency@atlas.dev' });

    const resetToken = notifier.getLastToken('reset-concurrency@atlas.dev');
    expect(resetToken).toBeDefined();

    // Fire 2 concurrent password resets with the same token
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'BrandNewPass123!' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherBrandNewPass123!' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (200) and the other must be rejected (400)
    expect(statuses).toEqual([200, 400]);
  });

  it('4. IP Pseudonymization: should store HMAC-SHA256 hashed IP and not plaintext IP', async () => {
    const session = await registerAndLoginUser(
      app,
      'pseudonym@atlas.dev',
      'PseudonymPass123!',
      'Pseudo User',
    );

    const dbSession = await prisma.session.findFirst({
      where: { userId: session.user.id },
    });

    expect(dbSession).toBeDefined();
    expect(dbSession?.ipHash).toBeDefined();
    // ipHash should be a 64-char hex string (SHA-256 HMAC)
    expect(dbSession?.ipHash).toMatch(/^[a-f0-9]{64}$/);
    // Never store plaintext IP addresses like 127.0.0.1 or ::1
    expect(dbSession?.ipHash).not.toContain('127.0.0.1');
    expect(dbSession?.ipHash).not.toContain('::1');
  });

  it('5. Catalog Mutations Guard: should forbid catalog creation when ENABLE_CATALOG_MUTATIONS=false', async () => {
    const session = await registerAndLoginUser(
      app,
      'catalog-guard@atlas.dev',
      'CatalogPass123!',
      'Catalog User',
    );

    const prevEnv = process.env.ENABLE_CATALOG_MUTATIONS;
    try {
      process.env.ENABLE_CATALOG_MUTATIONS = 'false';

      const res = await request(app.getHttpServer())
        .post('/api/v1/institutions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          name: 'Banco Proibido',
          type: 'BANK',
          country: 'BR',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('COMMON.FORBIDDEN');
    } finally {
      if (prevEnv !== undefined) {
        process.env.ENABLE_CATALOG_MUTATIONS = prevEnv;
      } else {
        delete process.env.ENABLE_CATALOG_MUTATIONS;
      }
    }
  });
});
