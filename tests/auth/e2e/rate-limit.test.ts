import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp } from '../setup';

describe('Auth E2E: Rate Limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const res = await createAuthTestApp();
    app = res.app;
  });

  afterAll(async () => {
    await closeAuthTestApp();
  });

  it('should return 429 Too Many Requests when sensitive endpoint rate limit is exceeded', async () => {
    const email = 'ratelimit@atlas.dev';

    // Limit on forgot-password is 5 requests per 60 seconds
    const results = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      results.push(res.status);
    }

    // First 5 requests should be 200 OK
    for (let i = 0; i < 5; i++) {
      expect(results[i]).toBe(200);
    }

    // 6th request must be 429 Too Many Requests
    expect(results[5]).toBe(429);
  });
});
