import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp, cleanDatabase } from '../setup';
import { InMemoryPasswordResetNotifier } from '../../../apps/api/src/auth/services/password-reset-notifier.interface';

describe('Auth E2E: Password Reset Foundation', () => {
  let app: INestApplication;
  let notifier: InMemoryPasswordResetNotifier;

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

  it('should reset password, enforce single-use tokens, and revoke all existing sessions', async () => {
    const email = 'reset-user@atlas.dev';
    const oldPassword = 'OldStrongPassword123!';
    const newPassword = 'NewStrongPassword456!';

    // 1. Register and establish two concurrent device sessions (Device A and Device B)
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email,
      password: oldPassword,
      name: 'Reset Test User',
    });

    const loginDeviceA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword });
    const tokenA = loginDeviceA.body.data.accessToken;

    const loginDeviceB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword });
    const tokenB = loginDeviceB.body.data.accessToken;

    // Verify both tokens work
    const checkA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(checkA.status).toBe(200);

    const checkB = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(checkB.status).toBe(200);

    // 2. Forgot Password for existing email
    const forgotRes = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.data.accepted).toBe(true);

    // 3. Forgot Password for non-existing email returns identical response (enumeration protection)
    const forgotUnknownRes = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@atlas.dev' });

    expect(forgotUnknownRes.status).toBe(200);
    expect(forgotUnknownRes.body.data.accepted).toBe(true);

    // 4. Retrieve reset token from test notifier
    const resetToken = notifier.getLastToken(email);
    expect(resetToken).toBeDefined();

    // 5. Reset password with valid token
    const resetRes = await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({
      token: resetToken,
      newPassword,
    });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.success).toBe(true);

    // 6. Login with OLD password must fail
    const oldLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword });
    expect(oldLoginRes.status).toBe(401);
    expect(oldLoginRes.body.code).toBe('AUTH.INVALID_CREDENTIALS');

    // 7. Login with NEW password must succeed
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.data.accessToken).toBeDefined();

    // 8. Single-use invariant: Reusing the same reset token must fail
    const reuseResetRes = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: 'AnotherPassword789!',
      });
    expect(reuseResetRes.status).toBe(400);
    expect(reuseResetRes.body.code).toBe('AUTH.INVALID_RESET_TOKEN');

    // 9. Mandatory invariant: All pre-existing sessions (Device A and Device B) must be revoked!
    const checkAAfter = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(checkAAfter.status).toBe(401);
    expect(checkAAfter.body.code).toBe('AUTH.SESSION_REVOKED');

    const checkBAfter = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(checkBAfter.status).toBe(401);
    expect(checkBAfter.body.code).toBe('AUTH.SESSION_REVOKED');
  });
});
