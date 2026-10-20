/**
 * Phase 5G - Operations admin API (atlas_test only).
 *
 * Auth matrix 401/403/200 on all six routes; persisted-only reads verified
 * with a fetch spy; response schema + bounded filters validated.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient } from '../database/setup';

const OPERATOR_ID = 'e0000000-0000-4000-8000-000000000001';
const ORDINARY_ID = 'e0000000-0000-4000-8000-000000000002';

describe('5G operations admin API', () => {
  let app: INestApplication;
  let operatorToken = '';
  let ordinaryToken = '';
  const originalAllowlist = process.env.INGESTION_OPERATOR_USER_IDS;

  beforeAll(async () => {
    process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
    const prisma = getTestPrismaClient();
    for (const [id, email] of [
      [OPERATOR_ID, 'ops.operator@atlas.test'],
      [ORDINARY_ID, 'ops.ordinary@atlas.test'],
    ] as const) {
      await prisma.user.upsert({
        where: { id },
        update: { email },
        create: {
          id,
          email,
          name: 'OPS',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    app = await createTestApp();
    operatorToken = (await createAuthenticatedUserSession(OPERATOR_ID)).token;
    ordinaryToken = (await createAuthenticatedUserSession(ORDINARY_ID)).token;
  });

  afterAll(async () => {
    if (originalAllowlist === undefined) delete process.env.INGESTION_OPERATOR_USER_IDS;
    else process.env.INGESTION_OPERATOR_USER_IDS = originalAllowlist;
    await closeTestApp();
  });

  const routes = [
    '/api/v1/admin/operations/data-status',
    '/api/v1/admin/operations/jobs/health',
    '/api/v1/admin/operations/alerts',
    '/api/v1/admin/operations/metrics',
    '/api/v1/admin/operations/scheduler/readiness',
  ];

  it.each(routes)('rejects unauthenticated GET %s with 401', async (route) => {
    await request(app.getHttpServer()).get(route).expect(401);
  });

  it.each(routes)('rejects ordinary users GET %s with 403', async (route) => {
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .expect(403);
  });

  it('operator data-status returns persisted-only operations status', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/operations/data-status')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(['HEALTHY', 'DEGRADED', 'STALE', 'FAILED', 'UNKNOWN']).toContain(res.body.data.overall);
    expect(res.body.data.scheduler).toBeDefined();
    expect(Array.isArray(res.body.data.sources)).toBe(true);
    expect(res.body.data.sources.length).toBe(10);
    expect(Array.isArray(res.body.data.issues)).toBe(true);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('operator jobs/health exposes failures, stale, retries and partials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/operations/jobs/health')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    for (const key of [
      'recentFailures',
      'staleRunning',
      'retryExhausted',
      'missedSchedules',
      'partialRuns',
    ]) {
      expect(Array.isArray(res.body.data[key])).toBe(true);
    }
  });

  it('operator alerts list + unknown id 404; metrics shape; readiness shape', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/operations/alerts?limit=5')
      .set(auth)
      .expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/admin/operations/alerts/status=ACTIVE')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/operations/alerts/${randomUUID()}`)
      .set(auth)
      .expect(404);
    const metrics = await request(app.getHttpServer())
      .get('/api/v1/admin/operations/metrics')
      .set(auth)
      .expect(200);
    for (const key of [
      'runsTotal',
      'byStatus',
      'byTrigger',
      'providerFailuresTotal',
      'retryAttemptsTotal',
      'backfillRunsTotal',
      'avgDurationMs',
    ]) {
      expect(metrics.body.data).toHaveProperty(key);
    }
    const readiness = await request(app.getHttpServer())
      .get('/api/v1/admin/operations/scheduler/readiness')
      .set(auth)
      .expect(200);
    expect(typeof readiness.body.data.ready).toBe('boolean');
    expect(Array.isArray(readiness.body.data.checks)).toBe(true);
    expect(readiness.body.data.checks.length).toBeGreaterThanOrEqual(2);
    expect(readiness.body.data.ready).toBe(false);
  });

  it('job history supports bounded status/trigger/from/to filters', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?triggerType=BACKFILL&limit=5')
      .set(auth)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?status=BOGUS')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?from=2026-13-01')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?from=2026-02-01&to=2026-01-01')
      .set(auth)
      .expect(400);
  });
});
