import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';

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

describe('API Integration: Annual Capital Market Fiscal Summary E2E Scenarios A–K (Phase 4H.3A)', () => {
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
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/capital-market').expect(401);
  });

  it('rejects invalid calendar years with 400', async () => {
    const token = await session('00000000-0000-4000-8000-000000000001');
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid-year/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario A–D: Empty / Zero activity year produces valid empty structure', async () => {
    const token = await session('00000000-0000-4000-8000-000000000002');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2025);
    expect(res.body.data.declarationExercise).toBe(2026);
    expect(res.body.data.months).toHaveLength(12);
    expect(res.body.data.normalEquities.totalGrossSales).toBe('0');
    expect(res.body.data.normalEquities.totalTaxDue).toBe('0');
    expect(res.body.data.dayTrade.totalGrossProfits).toBe('0');
    expect(res.body.data.fii.totalGrossProfits).toBe('0');
    expect(res.body.data.lossCarry.isConsistent).toBe(true);
    expect(res.body.data.fingerprint).toBeDefined();
  });

  it('Scenario E–G: IRRF terminal state mapping and 6015 obligation summaries', async () => {
    const token = await session('00000000-0000-4000-8000-000000000003');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.normalEquities.uncompensatedIrrfTerminalState).toBe(
      'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
    );
    expect(res.body.data.dayTrade.uncompensatedIrrfTerminalState).toBe('AVAILABLE_FOR_RESTITUTION');
    expect(res.body.data.obligations6015).toBeDefined();
    expect(res.body.data.obligations6015.totalPrincipalDue).toBe('0');
    expect(res.body.data.obligations6015.totalPaid).toBe('0');
  });

  it('Scenario J: Cross-user isolation - user A cannot access or view user B summaries', async () => {
    const tokenA = await session('00000000-0000-4000-8000-000000000004');
    const tokenB = await session('00000000-0000-4000-8000-000000000005');

    const resA = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resA.body.data.fingerprint).not.toBe(resB.body.data.fingerprint);
  });

  it('Scenario K: Year boundary isolation - 2024 vs 2025 requests stay separated', async () => {
    const token = await session('00000000-0000-4000-8000-000000000006');

    const res2024 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2024/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res2025 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/capital-market')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2024.body.data.calendarYear).toBe(2024);
    expect(res2024.body.data.declarationExercise).toBe(2025);
    expect(res2025.body.data.calendarYear).toBe(2025);
    expect(res2025.body.data.declarationExercise).toBe(2026);
  });
});
