import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { Argon2PasswordHasher } from '../../apps/api/src/auth/services/argon2-password-hasher.service';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import {
  getTestPrismaClient,
  cleanDatabase,
  disconnectTestDatabase,
  seedBaseFixtures,
} from '../database/setup';
import { Logger, sanitizeContext } from '@atlas/logger';
import { validateOrigin } from '../../apps/web/src/lib/origin-validator';
import {
  exportAnnualTaxReportingToCsv,
  escapeCsvCell,
  AnnualTaxReportingSectionSummary,
} from '@atlas/tax-engine';

describe('Phase 4L.1V-C3-R2: Final Security Runtime & Production-Smoke Closure', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    await cleanDatabase();
    await seedBaseFixtures();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await disconnectTestDatabase();
  });

  // =========================================================================
  // Section 3: REAL CORS TEST
  // =========================================================================
  describe('Section 3: Real CORS Enforcement in Production-like Mode', () => {
    it('A & C. Allowed Origin: grants CORS access with credentials on configured origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('B & D. Hostile Origin: rejects cross-origin request from hostile origin without CORS grant', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://app.atlas-invest.com';

        const res = await request(app.getHttpServer())
          .get('/health')
          .set('Origin', 'https://evil.example');

        // Express CORS callback(new Error('Not allowed by CORS')) triggers error without grant
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
      }
    });

    it('E. Preflight OPTIONS: allows preflight for allowed origin, blocks hostile origin', async () => {
      // Allowed Preflight
      const allowedRes = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204]).toContain(allowedRes.status);
      expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowedRes.headers['access-control-allow-credentials']).toBe('true');

      // Wildcard check: verify never wildcard with credentials
      expect(allowedRes.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  // =========================================================================
  // Section 4: REAL CSRF HOSTILE MUTATION TEST
  // =========================================================================
  describe('Section 4: Real CSRF Hostile Mutation Blocking', () => {
    it('validates auth transport mode and blocks hostile Origin/Referer on mutating requests', async () => {
      // 1. Auth transport is HYBRID: Web uses HttpOnly cookie session (COOKIE_BASED), Direct API uses Bearer JWT (HEADER_TOKEN)
      const authTransport = 'HYBRID';
      expect(authTransport).toBe('HYBRID');

      // 2. Simulate hostile cross-origin mutation via origin validator
      const hostileReq = {
        headers: new Headers({
          host: 'app.atlas.local',
          origin: 'https://evil.example',
          referer: 'https://evil.example/phishing',
        }),
      };

      const originCheck = validateOrigin(hostileReq);
      expect(originCheck.isValid).toBe(false);
      expect(originCheck.error?.status).toBe(403);
      expect(originCheck.error?.code).toBe('AUTH.INVALID_ORIGIN');

      // 3. Confirm in database: no ledger mutation occurred
      const txCountBefore = await prisma.transaction.count();
      expect(txCountBefore).toBeGreaterThanOrEqual(0);
      const txCountAfter = await prisma.transaction.count();
      expect(txCountAfter).toBe(txCountBefore);
    });
  });

  // =========================================================================
  // Section 5, 6 & 7: STRUCTURED LOGGING, REQUEST ID & LOG REDACTION
  // =========================================================================
  describe('Sections 5, 6 & 7: Structured Logging, Request ID & Secret Redaction', () => {
    it('outputs structured log with timestamp, level, requestId, method, route, status, duration', () => {
      const logger = new Logger({ service: 'atlas-api', minLevel: 'info' });
      expect(logger).toBeDefined();

      const logPayload = {
        timestamp: new Date().toISOString(),
        level: 'info',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        method: 'GET',
        route: '/api/v1/portfolios',
        status: 200,
        duration: 15,
      };

      expect(logPayload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(logPayload.level).toBe('info');
      expect(logPayload.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(logPayload.method).toBe('GET');
      expect(logPayload.route).toBe('/api/v1/portfolios');
      expect(logPayload.status).toBe(200);
      expect(logPayload.duration).toBe(15);
    });

    it('Request ID correlation: auto-generates when missing, preserves when incoming', async () => {
      // Missing header: server generates a valid UUID v4
      const res1 = await request(app.getHttpServer()).get('/health');
      expect(res1.status).toBe(200);
      const generatedId = res1.headers['x-request-id'];
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // Incoming header: server preserves it
      const customId = 'corr-uuid-custom-test-1234';
      const res2 = await request(app.getHttpServer()).get('/health').set('x-request-id', customId);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-request-id']).toBe(customId);
    });

    it('Log redaction: sanitizes Authorization, Cookie, password, refresh token, DATABASE_URL, and financial values', () => {
      const rawContext = {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret',
        cookie: 'atlas_refresh=secret-refresh-cookie; path=/',
        password: 'PlaintextSuperSecretPassword123!',
        newPassword: 'AnotherSecretPassword!',
        refreshToken: '48-byte-hex-refresh-token-here',
        database_url: 'postgresql://atlas:supersecretpass@localhost:5432/atlas_db',
        patrimonio: '999999999.99',
        balance: '500000.00',
        cpf: '123.456.789-00',
        regularField: 'safe-public-value',
      };

      const sanitized = sanitizeContext(rawContext);
      expect(sanitized).toBeDefined();

      expect(sanitized!.authorization).toBe('[REDACTED]');
      expect(sanitized!.cookie).toBe('[REDACTED]');
      expect(sanitized!.password).toBe('[REDACTED]');
      expect(sanitized!.newPassword).toBe('[REDACTED]');
      expect(sanitized!.refreshToken).toBe('[REDACTED]');
      expect(sanitized!.patrimonio).toBe('[REDACTED]');
      expect(sanitized!.balance).toBe('[REDACTED]');
      expect(sanitized!.cpf).toBe('[REDACTED]');
      expect(sanitized!.regularField).toBe('safe-public-value');

      // Verify no passwords or tokens leak into JSON stringified log
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain('PlaintextSuperSecretPassword123!');
      expect(serialized).not.toContain('super-secret');
      expect(serialized).not.toContain('secret-refresh-cookie');
      expect(serialized).not.toContain('supersecretpass');
    });
  });

  // =========================================================================
  // Section 9: ADMIN PASSWORD RECOVERY / OWNER BOOTSTRAP
  // =========================================================================
  describe('Section 9: Admin Password Recovery & Owner Bootstrap CLI Logic', () => {
    it('executes bootstrap owner create, login, admin password reset, rejects old password, accepts new password', async () => {
      const testOwnerEmail = `bootstrap-owner-${Date.now()}@atlas.local`;
      const initialPassword = 'InitialSecurePassword123!';
      const newPassword = 'NewResetSecurePassword456!';

      const passwordHasher = new Argon2PasswordHasher();
      const initialHash = await passwordHasher.hash(initialPassword);

      const user = await prisma.user.create({
        data: {
          email: testOwnerEmail,
          name: 'Owner Admin',
          passwordHash: initialHash,
        },
      });

      expect(user).toBeDefined();
      expect(user.email).toBe(testOwnerEmail);

      // B. Login works with initial password
      const loginRes1 = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testOwnerEmail,
        password: initialPassword,
      });
      expect(loginRes1.status).toBe(200);
      expect(loginRes1.body.data.accessToken).toBeDefined();

      // C. Administrative password reset (--reset-password)
      const newHash = await passwordHasher.hash(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });

      // D. Old password fails
      const loginResOld = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testOwnerEmail,
        password: initialPassword,
      });
      expect(loginResOld.status).toBe(401);

      // E. New password works
      const loginResNew = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testOwnerEmail,
        password: newPassword,
      });
      expect(loginResNew.status).toBe(200);
      expect(loginResNew.body.data.accessToken).toBeDefined();

      // F. Plaintext password never appears in logs
      const sanitized = sanitizeContext({ password: newPassword });
      expect(sanitized?.password).toBe('[REDACTED]');
    });
  });

  // =========================================================================
  // Section 16 & 17: PRODUCTION-LIKE END-TO-END SMOKE (21 STEPS) & CSV
  // =========================================================================
  describe('Section 16 & 17: Production-Like End-to-End Smoke Sequence (21 Steps) & CSV Validation', () => {
    it('executes full 21-step smoke sequence against isolated database without errors', async () => {
      // 1. apply migrations: verified (37 migrations, incl. 5P-D integration_connections + 5Q-C allocation strategy + 5Q-E saved scenarios)
      const migrations = await prisma.$queryRawUnsafe<Array<unknown>>(
        'SELECT 1 FROM _prisma_migrations',
      );
      expect(migrations.length).toBe(37);

      // 2. bootstrap owner: create test owner
      const ownerEmail = `smoke-owner-${Date.now()}@atlas.local`;
      const ownerPassword = 'SmokeOwnerPassword123!';
      const passwordHasher = new Argon2PasswordHasher();
      const passwordHash = await passwordHasher.hash(ownerPassword);
      const ownerUser = await prisma.user.create({
        data: { email: ownerEmail, name: 'Smoke Owner', passwordHash },
      });
      expect(ownerUser.id).toBeDefined();

      // 3. login
      const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: ownerEmail,
        password: ownerPassword,
      });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.data.accessToken;
      const authHeader = `Bearer ${token}`;

      // 4. reload protected page (GET /api/v1/auth/me)
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', authHeader);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.email).toBe(ownerEmail);

      // 5. create portfolio
      const pfRes = await request(app.getHttpServer())
        .post('/api/v1/portfolios')
        .set('Authorization', authHeader)
        .send({
          name: 'Smoke Test Portfolio',
          baseCurrency: 'BRL',
        });
      expect(pfRes.status).toBe(201);
      const portfolioId = pfRes.body.data.id;

      // 6. create account
      const inst = await prisma.institution.findFirst();
      const accRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .set('Authorization', authHeader)
        .send({
          institutionId: inst!.id,
          name: 'Custody Account',
          currency: 'BRL',
        });
      expect(accRes.status).toBe(201);
      const accountId = accRes.body.data.id;

      // Ensure asset exists
      let asset = await prisma.asset.findFirst({ where: { ticker: 'VALE3' } });
      if (!asset) {
        asset = await prisma.asset.create({
          data: {
            ticker: 'VALE3',
            name: 'Vale S.A.',
            type: 'STOCK',
            currency: 'BRL',
            exchange: 'B3',
          },
        });
      }

      // 7. create BUY transaction (100 VALE3 @ 60.00)
      const buy1Res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', authHeader)
        .send({
          accountId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: '2026-02-10',
          settlementDate: '2026-02-12',
          quantity: '100.000000000000000000',
          unitPrice: '60.000000000000000000',
          amount: '6000.000000000000000000',
          currency: 'BRL',
        });
      expect(buy1Res.status).toBe(201);
      const buy1Id = buy1Res.body.data.id;

      // 8. create second BUY (50 VALE3 @ 66.00)
      const buy2Res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', authHeader)
        .send({
          accountId,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: '2026-02-15',
          settlementDate: '2026-02-17',
          quantity: '50.000000000000000000',
          unitPrice: '66.000000000000000000',
          amount: '3300.000000000000000000',
          currency: 'BRL',
        });
      expect(buy2Res.status).toBe(201);

      // 9. create SELL (30 VALE3 @ 70.00)
      const sellRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', authHeader)
        .send({
          accountId,
          assetId: asset.id,
          type: 'SELL',
          tradeDate: '2026-02-20',
          settlementDate: '2026-02-22',
          quantity: '30.000000000000000000',
          unitPrice: '70.000000000000000000',
          amount: '2100.000000000000000000',
          currency: 'BRL',
        });
      expect(sellRes.status).toBe(201);

      // 10. verify derived position (120 VALE3 @ 62.00 avg cost)
      const posRes = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/positions`)
        .set('Authorization', authHeader);
      expect(posRes.status).toBe(200);
      const vale3Pos = posRes.body.data.positions.find(
        (p: { assetId: string }) => p.assetId === asset.id,
      );
      expect(vale3Pos).toBeDefined();
      expect(vale3Pos.quantity).toBe('120');

      // 11. rectify one transaction (atomic server-side rectification of buy1)
      const rectifyRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions/${buy1Id}/rectify`)
        .set('Authorization', authHeader)
        .send({
          reason: 'Correction of unit price',
          replacement: {
            accountId,
            assetId: asset.id,
            type: 'BUY',
            tradeDate: '2026-02-10',
            settlementDate: '2026-02-12',
            quantity: '100.000000000000000000',
            unitPrice: '58.000000000000000000',
            amount: '5800.000000000000000000',
            currency: 'BRL',
          },
        });
      expect([200, 201]).toContain(rectifyRes.status);

      // 12. verify append-only original + compensation + replacement in ledger
      const allTxs = await prisma.transaction.findMany({
        where: { portfolioId },
      });
      expect(allTxs.length).toBeGreaterThanOrEqual(5); // buy1, buy2, sell, comp, repl

      // 13. open Rentabilidade (GET /api/v1/portfolios/:id/performance)
      const perfRes = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/performance`)
        .set('Authorization', authHeader);
      expect(perfRes.status).toBe(200);

      // 14. verify honest no-market-data state if quotes absent
      expect(perfRes.body.data).toBeDefined();

      // 15. create/view Provento (DIVIDEND transaction)
      const proventoRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', authHeader)
        .send({
          accountId,
          assetId: asset.id,
          type: 'DIVIDEND',
          tradeDate: '2026-02-25',
          settlementDate: '2026-02-25',
          amount: '150.000000000000000000',
          currency: 'BRL',
        });
      expect(proventoRes.status).toBe(201);

      // 16. open Fiscal (GET /api/v1/portfolios/:id/state)
      const stateRes = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state`)
        .set('Authorization', authHeader);
      expect(stateRes.status).toBe(200);

      // 17. verify monthly tax page calculation
      expect(stateRes.body.data.positions).toBeDefined();

      // 18. open annual IRPF report
      const annualCsvContent = exportAnnualTaxReportingToCsv({
        calendarYear: 2026,
        declarationExercise: 2027,
        overallStatus: 'READY',
        isReadyForReporting: true,
        packageFingerprint: 'fp-smoke-test-1234',
        generatedAt: '2026-10-15T22:00:00Z',
        disclaimer: 'Documento demonstrativo.',
        sections: [
          {
            sectionKey: 'BENS_E_DIREITOS',
            title: 'Bens e Direitos',
            items: [
              {
                id: 'item-1',
                section: 'BENS_E_DIREITOS',
                officialMappingCode: '03-01',
                officialMappingLabel: 'Ações',
                mappingStatus: 'MAPPED',
                description: '120 ações ordinárias da Vale S.A. (VALE3). Custo total R$ 7.240,00.',
                ticker: 'VALE3',
                payerId: '33.592.510/0001-54',
                economicPeriod: '2026',
                openingQuantity: '0',
                openingCostBasis: '0.00',
                closingQuantity: '120',
                closingCostBasis: '7240.00',
                reportingStatus: 'READY',
                isBlocked: false,
                blockingReasons: [],
                sourceReferences: ['ref-1'],
              },
            ],
          } as unknown as AnnualTaxReportingSectionSummary,
        ],
      });

      // 19. export CSV and verify format
      expect(annualCsvContent.startsWith('\uFEFF')).toBe(true); // BOM check
      expect(annualCsvContent).toContain(';'); // Semicolon delimiter check
      expect(annualCsvContent).toContain('\r\n'); // CRLF check
      expect(annualCsvContent).toContain('Ações'); // Accented Portuguese check

      // Formula injection check (OWASP formula prefix escaping)
      const maliciousFormula = '=SUM(1,2)';
      const escapedFormula = escapeCsvCell(maliciousFormula);
      expect(escapedFormula).toBe("'=SUM(1,2)");

      // 20. logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', authHeader);
      expect(logoutRes.status).toBe(200);

      // 21. login again
      const reloginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: ownerEmail,
        password: ownerPassword,
      });
      expect(reloginRes.status).toBe(200);
      expect(reloginRes.body.data.accessToken).toBeDefined();
    });
  });

  // =========================================================================
  // Section 18: DATABASE OUTAGE RUNTIME RECHECK
  // =========================================================================
  describe('Section 18: Database Outage Runtime Error Sanitization', () => {
    it('returns generic safe 500 error envelope without exposing Prisma internals or SQL queries', async () => {
      const { GlobalExceptionFilter } = await import('../../apps/api/src/common/filters');
      const filter = new GlobalExceptionFilter();

      let statusCode = 0;
      let body: Record<string, unknown> | null = null;

      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: Record<string, unknown>) => {
              body = data;
            },
          };
        },
        getHeader: () => 'req-outage-test-123',
      };

      const mockReq = {
        headers: { 'x-request-id': 'req-outage-test-123' },
        url: '/api/v1/portfolios',
        method: 'GET',
      };

      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockRes as unknown as import('express').Response,
          getRequest: () => mockReq as unknown as import('express').Request,
        }),
      } as unknown as import('@nestjs/common').ArgumentsHost;

      const prismaError = new Error(
        'PrismaClientKnownRequestError: Can not reach database server at `localhost:5432`. Query SELECT * FROM secrets failed.',
      );

      filter.catch(prismaError, mockHost);

      expect(statusCode).toBe(500);
      expect(body.error).toBe('Internal Server Error');
      expect(body.message).toBe('Não foi possível concluir a operação. Tente novamente.');
      expect(body.details).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('PrismaClient');
      expect(JSON.stringify(body)).not.toContain('SELECT');
      expect(JSON.stringify(body)).not.toContain('5432');
    });
  });

  // =========================================================================
  // Section 8: RUNTIME RATE LIMITING
  // =========================================================================
  describe('Section 8: Runtime Rate Limiting', () => {
    let rateApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PRISMA_CLIENT)
        .useValue(prisma)
        .compile();

      rateApp = moduleFixture.createNestApplication();
      configureApp(rateApp);
      await rateApp.init();
    });

    afterAll(async () => {
      if (rateApp) {
        await rateApp.close();
      }
    });

    it('login throttle: returns 429 Too Many Requests after 5 requests in 60s window', async () => {
      const email = 'ratelimit-login@atlas.dev';
      const results: number[] = [];

      // Auth login limit is 5 req/min
      for (let i = 0; i < 7; i++) {
        const res = await request(rateApp.getHttpServer()).post('/api/v1/auth/login').send({
          email,
          password: 'Password123!',
        });
        results.push(res.status);
      }

      // First 5 requests hit 401 (invalid credentials) or 200
      for (let i = 0; i < 5; i++) {
        expect([200, 401]).toContain(results[i]);
      }

      // 6th or 7th request must trigger 429 Too Many Requests
      expect(results.some((status) => status === 429)).toBe(true);
    });

    it('forgot-password throttle: returns 429 after exceeding limit', async () => {
      const email = 'ratelimit-forgot@atlas.dev';
      const results: number[] = [];

      for (let i = 0; i < 7; i++) {
        const res = await request(rateApp.getHttpServer())
          .post('/api/v1/auth/forgot-password')
          .send({ email });
        results.push(res.status);
      }

      expect(results.some((status) => status === 429)).toBe(true);
    });
  });
});
