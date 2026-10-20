/**
 * Phase 5F (I2-I4) - Backfill orchestration integration (atlas_test only).
 *
 * Offline-safe: calendar backfill uses the deterministic official generator
 * (no provider); gating skips need no provider; admin auth/validation paths
 * never reach providers. No live market-data dependency.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  createAuthenticatedUserSession,
  getTestPrismaClient,
} from './setup';

const OPERATOR_ID = 'd0000000-0000-4000-8000-000000000001';
const ORDINARY_ID = 'd0000000-0000-4000-8000-000000000002';

describe('5F backfill admin auth + dry-run zero-live-read', () => {
  let app: INestApplication;
  let operatorToken = '';
  let ordinaryToken = '';
  const originalAllowlist = process.env.INGESTION_OPERATOR_USER_IDS;

  beforeAll(async () => {
    process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
    const prisma = getTestPrismaClient();
    for (const [id, email] of [
      [OPERATOR_ID, 'bf.operator@atlas.test'],
      [ORDINARY_ID, 'bf.ordinary@atlas.test'],
    ] as const) {
      await prisma.user.upsert({
        where: { id },
        update: { email },
        create: {
          id,
          email,
          name: 'BF',
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

  it('rejects unauthenticated plan/run with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09' })
      .expect(401);
  });

  it('rejects ordinary authenticated users with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09' })
      .expect(403);
  });

  it('rejects invalid domain, bad dates, from>to and oversized ranges with 400', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'NOPE', from: '2026-01-05', to: '2026-01-09' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-02-30', to: '2026-03-01' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-02-01', to: '2026-01-01' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'MARKET_QUOTES', from: '2026-01-01', to: '2026-12-31' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09', provider: 'EVIL' })
      .expect(400);
  });

  it('dry-run plan performs zero provider calls (fetch spy)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ domain: 'BENCHMARK_CDI', from: '2026-01-05', to: '2026-01-09' })
      .expect(200);
    expect(res.body.data.domain).toBe('BENCHMARK_CDI');
    expect(Array.isArray(res.body.data.eligiblePeriods)).toBe(true);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('large plans require explicit confirmation on run', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ domain: 'BENCHMARK_IBOV', from: '2026-01-05', to: '2026-06-05' })
      .expect(200);
    expect(plan.body.data.requiresConfirmation).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ domain: 'BENCHMARK_IBOV', from: '2026-01-05', to: '2026-06-05' })
      .expect(400);
  });
});

describe('5F calendar backfill end-to-end + resume + concurrency', () => {
  let app: INestApplication;
  let operatorToken = '';
  const originalAllowlist = process.env.INGESTION_OPERATOR_USER_IDS;
  const YEAR = '2030';

  beforeAll(async () => {
    process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
    const prisma = getTestPrismaClient();
    await prisma.user.upsert({
      where: { id: OPERATOR_ID },
      update: {},
      create: {
        id: OPERATOR_ID,
        email: 'bf.operator@atlas.test',
        name: 'BF',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    await prisma.session.deleteMany({ where: { userId: OPERATOR_ID } });
    await prisma.$executeRawUnsafe(
      `DELETE FROM calendar_days WHERE date >= '2030-01-01' AND date < '2032-01-01' AND calendar_type IN ('B3_TRADING','BANKING')`,
    );
    app = await createTestApp();
    operatorToken = (await createAuthenticatedUserSession(OPERATOR_ID)).token;
  });

  afterAll(async () => {
    if (originalAllowlist === undefined) delete process.env.INGESTION_OPERATOR_USER_IDS;
    else process.env.INGESTION_OPERATOR_USER_IDS = originalAllowlist;
    await closeTestApp();
  });

  it('plans a missing calendar year as eligible, executes it, then replans empty (resume)', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const plan = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'CALENDAR_B3', from: `${YEAR}-03-01`, to: `${YEAR}-03-31` })
      .expect(200);
    expect(plan.body.data.eligiblePeriods).toEqual([YEAR]);

    const run = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .set(auth)
      .send({ domain: 'CALENDAR_B3', from: `${YEAR}-03-01`, to: `${YEAR}-03-31` })
      .expect(200);
    expect(run.body.data.status).toBe('SUCCESS');
    expect(run.body.data.triggerType).toBe('BACKFILL');
    expect(run.body.data.periodsSucceeded).toBe(1);
    expect(run.body.data.childRunIds).toHaveLength(1);

    const prisma = getTestPrismaClient();
    const count = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM calendar_days WHERE calendar_type='B3_TRADING' AND date >= '${YEAR}-01-01' AND date < '${Number(YEAR) + 1}-01-01'`,
    );
    expect(count[0].c).toBeGreaterThan(360);

    const replan = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/plan')
      .set(auth)
      .send({ domain: 'CALENDAR_B3', from: `${YEAR}-03-01`, to: `${YEAR}-03-31` })
      .expect(200);
    expect(replan.body.data.eligiblePeriods).toEqual([]);

    await prisma.$executeRawUnsafe(
      `DELETE FROM calendar_days WHERE date >= '${YEAR}-01-01' AND date < '${Number(YEAR) + 1}-01-01' AND calendar_type='B3_TRADING'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM ingestion_job_runs WHERE logical_job_key = 'CALENDAR_B3_REFRESH:${YEAR}'`,
    );
  });

  it('concurrent same-window backfills: one executes, one SKIPPED_LOCKED', async () => {
    const auth = { Authorization: `Bearer ${operatorToken}` };
    const prisma = getTestPrismaClient();
    await prisma.$executeRawUnsafe(
      `DELETE FROM calendar_days WHERE date >= '2031-01-01' AND date < '2032-01-01' AND calendar_type='BANKING'`,
    );
    const a = request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .set(auth)
      .send({ domain: 'CALENDAR_BANKING', from: '2031-03-01', to: '2031-03-31' });
    const b = request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/backfill/run')
      .set(auth)
      .send({ domain: 'CALENDAR_BANKING', from: '2031-03-01', to: '2031-03-31' });
    const [rA, rB] = await Promise.all([a, b]);
    expect(rA.status).toBe(200);
    expect(rB.status).toBe(200);
    const statuses = [rA.body.data.status, rB.body.data.status].sort();
    expect(statuses).toContain('SKIPPED_LOCKED');
    expect(rA.body.data.childRunIds[0]).not.toBe(rB.body.data.childRunIds[0]);
    await prisma.$executeRawUnsafe(
      `DELETE FROM calendar_days WHERE date >= '2031-01-01' AND date < '2032-01-01' AND calendar_type='BANKING'`,
    );
    const key = 'CALENDAR_BANKING_REFRESH:2031';
    await prisma.$executeRawUnsafe(
      `DELETE FROM ingestion_job_runs WHERE logical_job_key = '${key}'`,
    );
  });
});
