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

describe('API Integration: Annual Tax Reporting Real E2E Suite (Phase 4H.6)', () => {
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
          name: 'Reporting User',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  // Security / Baseline
  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/reporting').expect(401);
  });

  it('rejects invalid calendar years with 400', async () => {
    const token = await session(uuidFor('user-reporting-invalid'));
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid-year/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Empty year returns 200 with NO_ACTIVITY and disclaimer', async () => {
    const token = await session(uuidFor('user-reporting-empty'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2025);
    expect(res.body.data.declarationExercise).toBe(2026);
    expect(res.body.data.overallStatus).toBe('NO_ACTIVITY');
    expect(res.body.data.isReadyForReporting).toBe(true);
    expect(res.body.data.disclaimer).toContain('Não substitui o Programa Gerador da Declaração (PGD)');
    expect(res.body.data.sections).toHaveLength(6);
    expect(res.body.data.packageFingerprint).toBeDefined();
  });

  it('Active equity portfolio returns 200 with mapped Bens e Direitos items', async () => {
    const userId = uuidFor('user-reporting-equity');
    const token = await session(userId);

    const institution = await prisma.institution.create({
      data: {
        id: uuidFor('inst-rep'),
        name: 'XP INVESTIMENTOS',
        type: 'BROKER',
        country: 'BR',
      },
    });
    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('port-rep'),
        userId,
        name: 'Main Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-rep'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'XP Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: uuidFor('asset-petr4-rep'),
        ticker: 'PETR4',
        name: 'PETROBRAS PN',
        type: 'BRAZILIAN_EQUITY',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Buy 100 shares in 2025
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-buy-petr4-rep'),
        accountId: account.id,
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2025-03-10T00:00:00.000Z'),
        settlementDate: new Date('2025-03-12T00:00:00.000Z'),
        quantity: '100.000000000000000000',
        unitPrice: '30.000000000000000000',
        currency: 'BRL',
        amount: '3000.000000000000000000',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.overallStatus).toBe('READY');
    const bdSection = res.body.data.sections.find(
      (s: { section: string }) => s.section === 'BENS_E_DIREITOS',
    );
    expect(bdSection).toBeDefined();
    expect(bdSection.itemCount).toBe(1);
    expect(bdSection.items[0].officialMappingCode).toBe('03-01');
    expect(bdSection.items[0].description).toContain('PETR4');
    expect(bdSection.items[0].costBasis).toBe('3000');
  });

  it('Isolates users strictly without cross-user data leakage', async () => {
    const user1Id = uuidFor('user-rep-iso-1');
    const user2Id = uuidFor('user-rep-iso-2');
    const token1 = await session(user1Id);
    const token2 = await session(user2Id);

    const inst = await prisma.institution.create({
      data: {
        id: uuidFor('inst-iso'),
        name: 'BTG PACTUAL',
        type: 'BROKER',
        country: 'BR',
      },
    });
    const port1 = await prisma.portfolio.create({
      data: {
        id: uuidFor('port-iso-1'),
        userId: user1Id,
        name: 'User1 Port',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const acc1 = await prisma.account.create({
      data: {
        id: uuidFor('acc-iso-1'),
        portfolioId: port1.id,
        institutionId: inst.id,
        name: 'BTG Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: uuidFor('asset-vale3-iso'),
        ticker: 'VALE3',
        name: 'VALE ON',
        type: 'BRAZILIAN_EQUITY',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-buy-vale3-iso'),
        accountId: acc1.id,
        portfolioId: port1.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2025-04-10T00:00:00.000Z'),
        settlementDate: new Date('2025-04-12T00:00:00.000Z'),
        quantity: '50.000000000000000000',
        unitPrice: '60.000000000000000000',
        currency: 'BRL',
        amount: '3000.000000000000000000',
      },
    });

    // User 1 sees 1 item in BENS_E_DIREITOS
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    const bd1 = res1.body.data.sections.find(
      (s: { section: string }) => s.section === 'BENS_E_DIREITOS',
    );
    expect(bd1.itemCount).toBe(1);

    // User 2 sees 0 items (NO_ACTIVITY)
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    const bd2 = res2.body.data.sections.find(
      (s: { section: string }) => s.section === 'BENS_E_DIREITOS',
    );
    expect(bd2.itemCount).toBe(0);
    expect(res2.body.data.overallStatus).toBe('NO_ACTIVITY');
  });
});
