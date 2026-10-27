import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { INestApplication } from '@nestjs/common';

describe('Built Runtime Rate Limit Complete Verification (Register & Refresh & Login)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('enforces 429 Too Many Requests on register after 3 requests', async () => {
    const runId = Date.now();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `rate-reg-${runId}-${i}@atlas.dev`,
          password: 'Password123!',
          name: `User ${i}`,
        });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);
  });

  it('enforces 429 Too Many Requests on refresh after exceeding limit', async () => {
    const statuses: number[] = [];
    // AuthController has @Throttle({ default: { limit: 30, ttl: 60000 } })
    for (let i = 0; i < 35; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({
        refreshToken: 'dummy-refresh-token-for-rate-limit-testing-1234567890',
      });
      statuses.push(res.status);
    }

    const count429 = statuses.filter((s) => s === 429).length;
    expect(count429).toBeGreaterThan(0);
    expect(statuses[34]).toBe(429);
  });

  it('reconfirms login enforces 429 after 5 requests', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'synthetic.owner@atlas.dev',
        password: 'wrong-password-for-throttle',
      });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });

  it('reconfirms forgot-password enforces 429 after 5 requests', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({
        email: 'synthetic.owner@atlas.dev',
      });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });
});
