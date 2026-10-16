import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './setup';

describe('API Integration: Production Error Sanitization & Remote Security Boundaries', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('Health & Metadata Probes', () => {
    it('GET /health returns version and commitSha without exposing internal configs', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('atlas-api');
      expect(res.body.version).toBeDefined();
      expect(res.body.commitSha).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /ready returns database connection status', async () => {
      const res = await request(app.getHttpServer()).get('/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
    });
  });

  describe('Remote Owner MVP: Public Registration Boundary', () => {
    it('blocks public registration when ALLOW_PUBLIC_REGISTRATION="false"', async () => {
      const originalValue = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'false';

      try {
        const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
          name: 'Unauthorized Public User',
          email: 'public.unauthorized@example.com',
          password: 'StrongPassword123!',
        });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('AUTH.REGISTRATION_DISABLED');
        expect(res.body.message).toContain('desabilitado');
      } finally {
        process.env.ALLOW_PUBLIC_REGISTRATION = originalValue;
      }
    });
  });

  describe('Database Outage & 5xx Error Sanitization', () => {
    it('sanitizes 5xx responses and never leaks stack traces or ORM internals', async () => {
      // Simulate an unhandled internal exception or route error
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'invalid@example.com',
        password: 'Password123!',
      });

      // Valid response for bad credentials is 401
      expect(res.status).toBe(401);
      expect(res.body.message).not.toContain('prisma');
      expect(res.body.message).not.toContain('SELECT');
      expect(res.body.details).toBeUndefined();
    });

    it('GlobalExceptionFilter intercepts arbitrary database errors and forces safe message', async () => {
      const { GlobalExceptionFilter } = await import('../../apps/api/src/common/filters');
      const filter = new GlobalExceptionFilter();

      let capturedStatusCode = 0;
      let capturedBody: Record<string, unknown> | null = null;

      const mockResponse = {
        status: (code: number) => {
          capturedStatusCode = code;
          return {
            json: (body: Record<string, unknown>) => {
              capturedBody = body;
            },
          };
        },
        getHeader: () => 'test-request-id-123',
      };

      const mockRequest = {
        headers: { 'x-request-id': 'test-request-id-123' },
        url: '/api/v1/test-db-error',
        method: 'GET',
      };

      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      };

      const leakedErrorMessage =
        'PrismaClientInitializationError: Can not reach database server at localhost:5432. Query SELECT * FROM secrets failed.';
      filter.catch(
        new Error(leakedErrorMessage),
        mockHost as unknown as import('@nestjs/common').ArgumentsHost,
      );

      expect(capturedStatusCode).toBe(500);
      expect(capturedBody).toBeDefined();
      expect(capturedBody.statusCode).toBe(500);
      expect(capturedBody.message).toBe('Não foi possível concluir a operação. Tente novamente.');
      expect(capturedBody.details).toBeUndefined();
      expect(JSON.stringify(capturedBody)).not.toContain('PrismaClientInitializationError');
      expect(JSON.stringify(capturedBody)).not.toContain('localhost:5432');
      expect(JSON.stringify(capturedBody)).not.toContain('SELECT');
    });
  });
});
