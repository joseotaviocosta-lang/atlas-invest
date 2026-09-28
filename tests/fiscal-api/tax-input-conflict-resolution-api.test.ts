import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';

describe('API Integration: tax input conflict resolution (Phase 4B.4)', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

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
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'T',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  const withhold = (token: string, amount: string) =>
    request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-09',
        economicDate: '2026-09-10',
        category: 'BRAZILIAN_EQUITY',
        amount,
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'w-1',
      });

  it('resolves a conflict explicitly and retains the original record', async () => {
    const token = await session('ee555555-5555-4555-8555-555555555555');
    await withhold(token, '10').expect(200);
    await withhold(token, '99').expect(409);

    const conflicted = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/withholdings?competence=2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(conflicted.body.data[0].conflictStatus).toBe('CONFLICT');
    expect(conflicted.body.data[0].amount).toBe('10');
    const id = conflicted.body.data[0].id;

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/inputs/withholding/${id}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'ACCEPT_NEW', resolutionSource: 'USER' })
      .expect(200);
    expect(resolved.body.data.conflictStatus).toBe('RESOLVED');

    const after = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/withholdings?competence=2026-09')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data[0].amount).toBe('99');
    expect(after.body.data[0].conflictStatus).toBe('RESOLVED');
  });

  it('blocks cross-user conflict resolution (404)', async () => {
    const tokenA = await session('ee666666-6666-4666-8666-666666666666');
    await withhold(tokenA, '10').expect(200);
    await withhold(tokenA, '99').expect(409);
    const id = (
      await request(app.getHttpServer())
        .get('/api/v1/fiscal/inputs/withholdings?competence=2026-09')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
    ).body.data[0].id;

    const tokenB = await session('ee777777-7777-4777-8777-777777777777');
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/inputs/withholding/${id}/resolve`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ action: 'KEEP_EXISTING' })
      .expect(404);
  });
});
