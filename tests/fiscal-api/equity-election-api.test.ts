import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';

describe('API Integration: equity exempt-loss compensation election (Phase 4G.2A.1b)', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  const USER_A = 'a1111111-1111-4111-8111-111111111111';
  const USER_B = 'b2222222-2222-4222-8222-222222222222';
  const BASE = '/api/v1/fiscal/monthly/2026-08/elections/equity-exempt-loss';

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function session(userId: string): Promise<string> {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Election Tester',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  it('A. read with no persisted election returns MISSING', async () => {
    const token = await session(USER_A);
    const res = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('MISSING');
    expect(res.body.data.current).toBeNull();
    expect(res.body.data.electionType).toBe('EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION');
  });

  it('B. PUT DECLARE creates v1 and GET reflects DECLARED', async () => {
    const token = await session(USER_A);
    const put = await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);
    expect(put.body.data.created).toBe(true);
    expect(put.body.data.status).toBe('DECLARED');
    expect(put.body.data.current.version).toBe(1);

    const get = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(get.body.data.status).toBe('DECLARED');
    expect(get.body.data.current.value).toBe('DECLARE_FOR_CARRYFORWARD');
  });

  it('C. PUT same value is idempotent (created false, same version)', async () => {
    const token = await session(USER_A);
    await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);
    expect(second.body.data.created).toBe(false);
    expect(second.body.data.current.version).toBe(1);

    const rows = await prisma.taxCompensationElectionRecord.count();
    expect(rows).toBe(1);
  });

  it('D. PUT different value creates a new revision', async () => {
    const token = await session(USER_A);
    await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DO_NOT_DECLARE' })
      .expect(200);
    expect(second.body.data.created).toBe(true);
    expect(second.body.data.current.version).toBe(2);
    expect(second.body.data.status).toBe('NOT_DECLARED');

    const history = await prisma.taxCompensationElectionRecord.findMany({
      where: { taxSubjectId: USER_A },
      orderBy: { version: 'asc' },
    });
    expect(history.map((r) => r.version)).toEqual([1, 2]);
  });

  it('E. cross-user isolation: B cannot observe or mutate A election', async () => {
    const tokenA = await session(USER_A);
    const tokenB = await session(USER_B);
    await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);

    const readB = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(readB.body.data.status).toBe('MISSING');

    await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ value: 'DO_NOT_DECLARE' })
      .expect(200);

    const readA = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(readA.body.data.status).toBe('DECLARED');
    expect(readA.body.data.current.version).toBe(1);
  });

  it('F. invalid competence returns 400', async () => {
    const token = await session(USER_A);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-13/elections/equity-exempt-loss')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('G. invalid election value returns 400', async () => {
    const token = await session(USER_A);
    await request(app.getHttpServer())
      .put(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'MAYBE' })
      .expect(400);
  });

  it('H. unauthenticated returns 401', async () => {
    await request(app.getHttpServer()).get(BASE).expect(401);
    await request(app.getHttpServer())
      .put(BASE)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(401);
  });
});
