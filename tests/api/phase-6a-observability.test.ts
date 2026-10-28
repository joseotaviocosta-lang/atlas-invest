import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './setup';
import { telemetry, sanitizeContext } from '@atlas/logger';

describe('Phase 6A: Production Reliability & Observability', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(() => {
    telemetry.reset();
  });

  // =========================================================================
  // 1. Health & Readiness Probes with Degraded State Handling
  // =========================================================================
  describe('1. Health & Readiness Probes', () => {
    it('GET /health: returns 200, liveness info, uptime and echoes x-request-id', async () => {
      const traceId = 'trace-obs-test-liveness-123';
      const res = await request(app.getHttpServer()).get('/health').set('x-request-id', traceId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('atlas-api');
      expect(res.body.version).toBeDefined();
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(res.headers['x-request-id']).toBe(traceId);
    });

    it('GET /ready: returns 200 with database connected and 44 migrations up_to_date', async () => {
      const res = await request(app.getHttpServer()).get('/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBe('connected');
      expect(res.body.checks.migrations.applied).toBeGreaterThanOrEqual(44);
      expect(res.body.checks.migrations.status).toBe('up_to_date');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('GET /ready: returns status degraded (200 OK) when an optional external provider fails', async () => {
      // Simulate external provider degradation
      telemetry.recordProviderCall('brapi', 'quote', 'degraded', 1200, 'RateLimitWarning');

      const res = await request(app.getHttpServer()).get('/ready');

      expect(res.status).toBe(200); // Does NOT fail liveness/readiness of the service
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('connected');
      expect(res.body.checks.migrations.status).toBe('up_to_date');
    });

    it('GET /ready?telemetry=true: returns readiness info enriched with telemetry snapshot', async () => {
      const res = await request(app.getHttpServer()).get('/ready?telemetry=true');

      expect(res.status).toBe(200);
      expect(res.body.telemetry).toBeDefined();
      expect(res.body.telemetry.requests).toBeDefined();
      expect(res.body.telemetry.database).toBeDefined();
      expect(res.body.telemetry.providers).toBeDefined();
    });

    it('GET /metrics: exposes vendor-neutral in-memory telemetry snapshot without third-party agent', async () => {
      const res = await request(app.getHttpServer()).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.body.requests).toBeDefined();
      expect(res.body.requests.statusBuckets).toBeDefined();
      expect(res.body.database).toBeDefined();
      expect(res.body.jobs).toBeDefined();
      expect(res.body.retries).toBeDefined();
      expect(res.body.notificationSources).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Telemetry Collector: In-Memory, Bounded, Zero DB Tables, Normalized Routes
  // =========================================================================
  describe('2. In-Memory Telemetry Collector', () => {
    it('normalizes high-cardinality route fragments (UUIDs and numeric IDs) preventing label explosion', () => {
      telemetry.recordRequest(
        'GET',
        '/api/v1/portfolios/c0a80123-4567-89ab-cdef-0123456789ab/transactions',
        200,
        15,
      );
      telemetry.recordRequest(
        'GET',
        '/api/v1/portfolios/a1b2c3d4-e5f6-7890-abcd-ef1234567890/transactions',
        200,
        25,
      );

      const snapshot = telemetry.getSnapshot();
      expect(snapshot.requests.total).toBe(2);
      expect(snapshot.requests.statusBuckets['2xx']).toBe(2);
      // Normalized route key: no raw UUIDs
      expect(snapshot.requests.routes['GET /api/v1/portfolios/:id/transactions']).toBe(2);
    });

    it('records database latency and computes p95 and average accurately', () => {
      telemetry.recordDbLatency(10, true);
      telemetry.recordDbLatency(20, true);
      telemetry.recordDbLatency(30, true);
      telemetry.recordDbLatency(100, false);

      const snapshot = telemetry.getSnapshot();
      expect(snapshot.database.totalQueries).toBe(4);
      expect(snapshot.database.successCount).toBe(3);
      expect(snapshot.database.failureCount).toBe(1);
      expect(snapshot.database.avgLatencyMs).toBe(40);
      expect(snapshot.database.p95LatencyMs).toBe(100);
    });

    it('records background jobs, retries, and notification sources', () => {
      telemetry.recordJob('portfolio_reconciliation', 'completed', 250);
      telemetry.recordRetry('b3_sync', 'success', 2);
      telemetry.recordRetry('b3_sync', 'exhausted', 3);
      telemetry.recordNotificationSource('fiscal_calendar', 'ok');

      const snapshot = telemetry.getSnapshot();
      expect(snapshot.jobs['portfolio_reconciliation'].completed).toBe(1);
      expect(snapshot.retries['b3_sync'].totalAttempts).toBe(5);
      expect(snapshot.retries['b3_sync'].successCount).toBe(1);
      expect(snapshot.retries['b3_sync'].exhaustedCount).toBe(1);
      expect(snapshot.notificationSources['fiscal_calendar'].status).toBe('ok');
    });

    it('safely isolates telemetry failures from bubbling into application logic', () => {
      expect(() => {
        // Even if bad types are passed, telemetry functions do not crash
        // @ts-expect-error Testing invalid runtime input
        telemetry.recordRequest(null, null, null, null);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 3. Log Redaction & Privacy Hardening
  // =========================================================================
  describe('3. Privacy Hardening & Redaction', () => {
    it('masks AI private contexts, grounding facts, prompts, and user queries', () => {
      const rawContext = {
        prompt: 'User prompt asking for tax advice',
        systemPrompt: 'System instructions for AI grounding',
        ai_context: { internalPortfolioHoldings: ['PETR4', 'VALE3'] },
        groundingContext: 'Facts extracted from verified transactions',
        grounding_facts: [{ asset: 'PETR4', qty: 100 }],
        private_context: 'Confidential investor metadata',
        user_query: 'How much tax do I owe on PETR4?',
        safeField: 'audit_event_logged',
      };

      const sanitized = sanitizeContext(rawContext);
      expect(sanitized).toBeDefined();
      expect(sanitized!.prompt).toBe('[REDACTED]');
      expect(sanitized!.systemPrompt).toBe('[REDACTED]');
      expect(sanitized!.ai_context).toBe('[REDACTED]');
      expect(sanitized!.groundingContext).toBe('[REDACTED]');
      expect(sanitized!.grounding_facts).toBe('[REDACTED]');
      expect(sanitized!.private_context).toBe('[REDACTED]');
      expect(sanitized!.user_query).toBe('[REDACTED]');
      expect(sanitized!.safeField).toBe('audit_event_logged');
    });

    it('masks file import contents and raw payloads', () => {
      const rawContext = {
        fileContent: 'CSV content with transactions line by line...',
        rawPayload: '{"transactions": [{"ticker": "PETR4", "qty": 100}]}',
        importPayload: { base64Data: 'iVBORw0KGgoAAAANSUhEUgAA...' },
        financialPayload: { totalAmount: '50000.00' },
        safeId: 'import-job-uuid-1234',
      };

      const sanitized = sanitizeContext(rawContext);
      expect(sanitized).toBeDefined();
      expect(sanitized!.fileContent).toBe('[REDACTED]');
      expect(sanitized!.rawPayload).toBe('[REDACTED]');
      expect(sanitized!.importPayload).toBe('[REDACTED]');
      expect(sanitized!.financialPayload).toBe('[REDACTED]');
      expect(sanitized!.safeId).toBe('import-job-uuid-1234');
    });

    it('masks financial totals, average cost, and realized gains', () => {
      const rawContext = {
        patrimonio_total: '1500000.00',
        total_cost: '1200000.00',
        average_cost: '34.50',
        realized_gain: '45000.00',
        unrealized_gain: '300000.00',
        rendimento: '25.00',
        operation: 'REPLAY_COMPLETE',
      };

      const sanitized = sanitizeContext(rawContext);
      expect(sanitized).toBeDefined();
      expect(sanitized!.patrimonio_total).toBe('[REDACTED]');
      expect(sanitized!.total_cost).toBe('[REDACTED]');
      expect(sanitized!.average_cost).toBe('[REDACTED]');
      expect(sanitized!.realized_gain).toBe('[REDACTED]');
      expect(sanitized!.unrealized_gain).toBe('[REDACTED]');
      expect(sanitized!.rendimento).toBe('[REDACTED]');
      expect(sanitized!.operation).toBe('REPLAY_COMPLETE');
    });

    it('recursively sanitizes nested objects and arrays with connection strings or secrets', () => {
      const rawContext = {
        meta: {
          config: {
            database_url: 'postgres://atlas:supersecret@127.0.0.1:5432/atlas_prod',
            safePort: 5432,
          },
        },
        connectionList: [
          'postgres://atlas:secret1@127.0.0.1:5432/db1',
          'safe-connection-alias',
          { nestedSecret: 'postgres://atlas:secret2@127.0.0.1:5432/db2' },
        ],
      };

      const sanitized = sanitizeContext(rawContext);
      expect(sanitized).toBeDefined();
      const meta = sanitized!.meta as Record<string, Record<string, unknown>>;
      expect(meta.config.database_url).toBe('[REDACTED]');
      expect(meta.config.safePort).toBe(5432);

      const connList = sanitized!.connectionList as unknown[];
      expect(connList[0]).toBe('[REDACTED]');
      expect(connList[1]).toBe('safe-connection-alias');
      expect((connList[2] as Record<string, unknown>).nestedSecret).toBe('[REDACTED]');
    });
  });
});

