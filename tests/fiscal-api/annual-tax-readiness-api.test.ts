import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';

const prisma = getTestPrismaClient();

async function buildApp(today: string): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => today })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API Integration: Annual Tax Readiness & Confirmation E2E (Phase 4H.5)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2026-10-01');
  });
  afterAll(async () => {
    await app.close();
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
          name: 'Fiscal User',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/readiness').expect(401);
  });

  it('rejects invalid calendar years with 400', async () => {
    const token = await session(uuidFor('user-readiness-invalid'));
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid-year/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario A: Empty activity returns valid readiness structure with 9 canonical sections', async () => {
    const token = await session(uuidFor('user-readiness-empty'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2025);
    expect(res.body.data.declarationExercise).toBe(2026);
    expect(res.body.data.overallStatus).toBe('NO_ACTIVITY');
    expect(res.body.data.isReadyForDirpf).toBe(true);
    expect(res.body.data.sections).toHaveLength(9);
    expect(res.body.data.requirements).toHaveLength(0);
    expect(res.body.data.confirmations).toHaveLength(0);
    expect(res.body.data.fingerprint).toBeDefined();
  });

  it('Scenario B: Records formal taxpayer confirmation and reflects in readiness assessment', async () => {
    const userId = uuidFor('user-confirm-scenario');
    const token = await session(userId);

    // Record confirmation
    const confRes = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
        subjectReference: 'asset-petr4',
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'fp_petr4_sample',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        notes: 'Ata de assembleia arquivada',
      })
      .expect(200);

    expect(confRes.body.data).toBeDefined();
    expect(confRes.body.data.revision).toBe(1);
    expect(confRes.body.data.decision).toBe('CONFIRMED');
    expect(confRes.body.meta.outcome).toBe('CREATED');

    // Fetch readiness
    const readRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(readRes.body.data.confirmations).toHaveLength(1);
    expect(readRes.body.data.confirmations[0].subjectReference).toBe('asset-petr4');
  });

  it('Scenario C: User isolation prevents cross-user access to confirmations', async () => {
    const userA = uuidFor('user-a-readiness');
    const userB = uuidFor('user-b-readiness');
    const tokenA = await session(userA);
    const tokenB = await session(userB);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/confirmations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
        subjectReference: 'asset-knri11',
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'fp_knri_sample',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resB.body.data.confirmations).toHaveLength(0);
  });
});
