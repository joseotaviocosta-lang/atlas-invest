import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';

describe('API Integration: equity withholding classification (Phase 4G.2B.0)', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();
  const USER = 'cc111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function session(): Promise<string> {
    await prisma.user.create({
      data: {
        id: USER,
        email: `${USER}@atlas.dev`,
        name: 'Withholding Tester',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(USER);
    return token;
  }

  function body(overrides: Record<string, unknown> = {}) {
    return {
      competence: '2026-08',
      economicDate: '2026-08-15',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '3',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'note-1',
      ...overrides,
    };
  }

  function post(token: string, payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  it('A/B. accepts EQUITY_NORMAL and EQUITY_DAY_TRADE and roundtrips', async () => {
    const token = await session();
    await post(token, body({ withholdingCategory: 'EQUITY_NORMAL' })).expect(200);
    await post(
      token,
      body({ withholdingCategory: 'EQUITY_DAY_TRADE', sourceReference: 'note-2' }),
    ).expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/fiscal/inputs/withholdings?competence=2026-08')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = list.body.data as Array<{ sourceReference: string; withholdingCategory: string }>;
    expect(rows.find((r) => r.sourceReference === 'note-1')?.withholdingCategory).toBe(
      'EQUITY_NORMAL',
    );
    expect(rows.find((r) => r.sourceReference === 'note-2')?.withholdingCategory).toBe(
      'EQUITY_DAY_TRADE',
    );
  });

  it('C. rejects BRAZILIAN_EQUITY without a discriminator', async () => {
    const token = await session();
    const res = await post(token, body({ withholdingCategory: undefined }));
    expect(res.status).toBe(400);
  });

  it('D. rejects an invalid discriminator', async () => {
    const token = await session();
    await post(token, body({ withholdingCategory: 'SOMETHING_ELSE' })).expect(400);
  });

  it('F. FII behavior is unchanged (no equity discriminator)', async () => {
    const token = await session();
    await post(
      token,
      body({ category: 'FII', withholdingCategory: undefined, sourceReference: 'fii-1' }),
    ).expect(200);
  });

  it('unauthenticated returns 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .send(body())
      .expect(401);
  });
});
