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

describe('API Integration: Annual Investment Income E2E Scenarios (Phase 4H.4 / 4H.4A)', () => {
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
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/income').expect(401);
  });

  it('rejects invalid calendar years with 400', async () => {
    const token = await session(uuidFor('user-invalid-years'));
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/1800/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/invalid-year/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario A: Empty / Zero activity year produces valid empty structure', async () => {
    const token = await session(uuidFor('user-empty-activity'));

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2025);
    expect(res.body.data.declarationExercise).toBe(2026);
    expect(res.body.data.totalGrossIncome).toBe('0');
    expect(res.body.data.totalWithheldTax).toBe('0');
    expect(res.body.data.dividends.totalGrossAmount).toBe('0');
    expect(res.body.data.jcp.totalGrossAmount).toBe('0');
    expect(res.body.data.fiiIncome.totalGrossAmount).toBe('0');
    expect(res.body.data.payers).toHaveLength(0);
    expect(res.body.data.fingerprint).toBeDefined();
  });

  it('Scenario B: Real transactions in DB produce authoritative annual income summary', async () => {
    const userId = uuidFor('user-real-income');
    const token = await session(userId);

    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('pf-income-main'),
        userId,
        name: 'Main Portfolio',
        type: 'PERSONAL',
        status: 'ACTIVE',
        baseCurrency: 'BRL',
      },
    });

    const institution = await prisma.institution.create({
      data: {
        id: uuidFor('inst-broker-test'),
        name: 'Broker Test',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-income-main'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Account 1',
        status: 'ACTIVE',
        currency: 'BRL',
      },
    });

    const assetPetr4 = await prisma.asset.create({
      data: {
        id: uuidFor('asset-petr4-income'),
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const assetItub4 = await prisma.asset.create({
      data: {
        id: uuidFor('asset-itub4-income'),
        ticker: 'ITUB4',
        name: 'Itau Unibanco PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Create DIVIDEND transaction in 2025
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-div-2025'),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: assetPetr4.id,
        type: 'DIVIDEND',
        amount: '10000.00',
        source: 'MANUAL',
        tradeDate: new Date('2025-05-15T00:00:00Z'),
        settlementDate: new Date('2025-05-15T00:00:00Z'),
        currency: 'BRL',
      },
    });

    // Create JCP transaction in 2025 (15% statutory withholding)
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-jcp-2025'),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: assetItub4.id,
        type: 'JCP',
        amount: '5000.00',
        source: 'MANUAL',
        tradeDate: new Date('2025-06-20T00:00:00Z'),
        settlementDate: new Date('2025-06-20T00:00:00Z'),
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.calendarYear).toBe(2025);
    expect(res.body.data.declarationExercise).toBe(2026);
    expect(res.body.data.payers).toHaveLength(2);
    expect(res.body.data.isComplete).toBe(true);
    expect(res.body.data.totalGrossIncome).toBe('15000');
    expect(res.body.data.totalWithheldTax).toBe('750');
    expect(res.body.data.dividends.totalGrossAmount).toBe('10000');
    expect(res.body.data.jcp.totalGrossAmount).toBe('5000');
  });

  it('Scenario C: Cross-user isolation — User 2 cannot observe User 1 income data', async () => {
    const user1Id = uuidFor('user-iso-1');
    const user2Id = uuidFor('user-iso-2');
    await session(user1Id);
    const token2 = await session(user2Id);

    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('pf-iso-1'),
        userId: user1Id,
        name: 'User 1 Portfolio',
        type: 'PERSONAL',
        status: 'ACTIVE',
        baseCurrency: 'BRL',
      },
    });

    const institution = await prisma.institution.create({
      data: {
        id: uuidFor('inst-iso-1'),
        name: 'Broker 1',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-iso-1'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Account 1',
        status: 'ACTIVE',
        currency: 'BRL',
      },
    });

    const asset = await prisma.asset.create({
      data: {
        id: uuidFor('asset-iso-vale'),
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-iso-div'),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'DIVIDEND',
        amount: '20000.00',
        source: 'MANUAL',
        tradeDate: new Date('2025-07-15T00:00:00Z'),
        settlementDate: new Date('2025-07-15T00:00:00Z'),
        currency: 'BRL',
      },
    });

    // Query with User 2 token
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/income')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(res.body.data.totalGrossIncome).toBe('0');
    expect(res.body.data.totalWithheldTax).toBe('0');
    expect(res.body.data.payers).toHaveLength(0);
  });
});
