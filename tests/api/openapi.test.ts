import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './setup';

describe('API Integration: OpenAPI Documentation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /docs should serve Swagger UI documentation HTML', async () => {
    const res = await request(app.getHttpServer()).get('/docs');

    // Swagger UI either returns 200 or 301/302 redirect to /docs/
    expect([200, 301, 302]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('swagger');
    }
  });

  it('GET /docs-json should serve complete OpenAPI JSON schema with all domain resources', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.info.title).toBe('Project Atlas API');
    expect(res.body.info.version).toBe('0.1.0');

    // Verify presence of all key domain resource paths
    const paths = Object.keys(res.body.paths);
    expect(paths).toContain('/api/v1/portfolios');
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}');
    expect(paths).toContain('/api/v1/institutions');
    expect(paths).toContain('/api/v1/institutions/{institutionId}');
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}/accounts');
    expect(paths).toContain('/api/v1/accounts/{accountId}');
    expect(paths).toContain('/api/v1/assets');
    expect(paths).toContain('/api/v1/assets/{assetId}');
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}/transactions');
    expect(paths).toContain('/api/v1/transactions/{transactionId}');

    // Verify NO mutation routes exist for transactions (append-only)
    const transactionPath = res.body.paths['/api/v1/transactions/{transactionId}'];
    expect(transactionPath).toBeDefined();
    expect(transactionPath.get).toBeDefined();
    expect(transactionPath.put).toBeUndefined();
    expect(transactionPath.patch).toBeUndefined();
    expect(transactionPath.delete).toBeUndefined();
  });
});
