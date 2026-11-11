import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './setup';

describe('API Integration: Health & Readiness Probes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /health should return 200 with service info and echo request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'custom-health-trace-id');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('atlas-api');
    expect(res.body.version).toBe('0.1.0');
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBe('custom-health-trace-id');
  });

  it('GET /ready should return 200 with database connection status and 50 migrations baseline', async () => {
    const res = await request(app.getHttpServer()).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.checks.migrations.expected).toBe(50);
    expect(res.body.checks.migrations.applied).toBeGreaterThanOrEqual(50);
    expect(res.body.checks.migrations.status).toBe('up_to_date');
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
