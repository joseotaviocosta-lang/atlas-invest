/**
 * Phase 5E (R3-C) - Privileged ingestion admin API security matrix (atlas_test).
 *
 * Covers 401/403/2xx authorization, strict input allowlisting and SSRF
 * impossibility (no provider/URL/SGS/range field is accepted).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { cleanDatabase, getTestPrismaClient } from '../database/setup';

const OPERATOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDINARY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let app: INestApplication;
let operatorToken: string;
let ordinaryToken: string;
const originalAllowlist = process.env.INGESTION_OPERATOR_USER_IDS;

async function ensureUser(userId: string): Promise<void> {
  const prisma = getTestPrismaClient();
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@atlas.dev`,
      name: 'Ingestion Tester',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
    },
  });
}

beforeAll(async () => {
  process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
  app = await createTestApp();
});

afterAll(async () => {
  if (originalAllowlist === undefined) {
    delete process.env.INGESTION_OPERATOR_USER_IDS;
  } else {
    process.env.INGESTION_OPERATOR_USER_IDS = originalAllowlist;
  }
  await closeTestApp();
});

beforeEach(async () => {
  process.env.INGESTION_OPERATOR_USER_IDS = OPERATOR_ID;
  await cleanDatabase();
  await getTestPrismaClient().$executeRawUnsafe('TRUNCATE TABLE "ingestion_job_runs"');
  await ensureUser(OPERATOR_ID);
  await ensureUser(ORDINARY_ID);
  operatorToken = (await createAuthenticatedUserSession(OPERATOR_ID)).token;
  ordinaryToken = (await createAuthenticatedUserSession(ORDINARY_ID)).token;
});

describe('Phase 5E R3-C - ingestion admin authorization matrix', () => {
  it('rejects unauthenticated POST/GET/GET-by-id with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .send({ scheduledFor: '2026-10-18' })
      .expect(401);

    await request(app.getHttpServer()).get('/api/v1/admin/ingestion/jobs').expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/ingestion/jobs/${randomUUID()}`)
      .expect(401);
  });

  it('rejects ordinary authenticated users with 403 (never 200)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .send({ scheduledFor: '2026-10-18' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs')
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/ingestion/jobs/${randomUUID()}`)
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .expect(403);
  });

  it('allows the operator to trigger a job and read history', async () => {
    const run = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ scheduledFor: '2026-10-18' })
      .expect(200);

    expect(run.body.data.status).toBe('SKIPPED_BANKING_CLOSED');
    expect(run.body.data.logicalJobKey).toBe('FX_USD_BRL_DAILY:2026-10-18');
    expect(run.headers['cache-control']).toContain('no-store');

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?jobType=FX_USD_BRL_DAILY&limit=10')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.meta.limit).toBe(10);
    expect(list.body.meta.hasMore).toBe(false);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/ingestion/jobs/${run.body.data.jobRunId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(detail.body.data.jobRunId).toBe(run.body.data.jobRunId);
  });

  it('denies every operator when the allowlist is empty or unset', async () => {
    process.env.INGESTION_OPERATOR_USER_IDS = '';
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ scheduledFor: '2026-10-18' })
      .expect(403);

    delete process.env.INGESTION_OPERATOR_USER_IDS;
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403);
  });

  it('cannot be escalated by client-supplied headers or body identity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${ordinaryToken}`)
      .set('x-atlas-operator', 'true')
      .send({ scheduledFor: '2026-10-18', userId: OPERATOR_ID })
      .expect(403);
  });
});

describe('Phase 5E R3-C - strict manual-trigger input', () => {
  it('rejects unknown job types', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/CUSTOM_PROVIDER_RUN/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ scheduledFor: '2026-10-18' })
      .expect(400);
    expect(res.body.code).toBe('INGESTION.INVALID_JOB_TYPE');
  });

  it('rejects impossible civil dates and future dates', async () => {
    const impossible = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ scheduledFor: '2026-02-30' })
      .expect(400);
    expect(impossible.body.code).toBe('INGESTION.INVALID_SCHEDULED_FOR');

    const future = await request(app.getHttpServer())
      .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ scheduledFor: '2099-01-01' })
      .expect(400);
    expect(future.body.code).toBe('INGESTION.FUTURE_SCHEDULED_FOR');
  });

  it('rejects custom provider, URL, SGS and range fields (SSRF impossible)', async () => {
    for (const payload of [
      { scheduledFor: '2026-10-18', provider: 'CUSTOM' },
      { scheduledFor: '2026-10-18', url: 'http://169.254.169.254/latest/meta-data' },
      { scheduledFor: '2026-10-18', sgsId: '1178' },
      { scheduledFor: '2026-10-18', from: '2020-01-01', to: '2026-10-18' },
    ]) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/ingestion/jobs/FX_USD_BRL_DAILY/run')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    }
  });

  it('rejects invalid list query bounds and unknown query fields', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?limit=0')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?limit=201')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/jobs?provider=CUSTOM')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);
  });

  it('returns 404 for an unknown job run id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/ingestion/jobs/${randomUUID()}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(404);
    expect(res.body.code).toBe('INGESTION.JOB_NOT_FOUND');
  });
});
