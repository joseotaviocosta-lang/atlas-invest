import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { Asset } from '@atlas/domain';

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

describe('API Integration: Annual IRPF Period & Year-End Positions E2E (Phase 4H.2)', () => {
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

  async function setupPortfolio(
    userId: string,
    ticker = 'PETR4',
    type: 'EQUITY' | 'FII' = 'EQUITY',
  ) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira IRPF', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const inst = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'XP Investimentos', type: 'BROKER', country: 'BR' })
      .expect(201);

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: inst.body.data.id, name: 'Custódia B3', currency: 'BRL' })
      .expect(201);
    const accountId = accountRes.body.data.id;

    const asset = Asset.create({ ticker, name: ticker, type, currency: 'BRL', exchange: 'B3' });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });

    return { token, portfolioId, accountId, assetId: asset.id };
  }

  it('Scenario 1: GET annual/:calendarYear/positions returns complete report derived from ledger replay at 31/12', async () => {
    const { token, portfolioId, accountId, assetId } = await setupPortfolio(
      '00000000-0000-4000-8000-000000000001',
      'VALE3',
    );

    // Record a BUY transaction in 2025
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2025-03-10',
        quantity: '100',
        unitPrice: '60.00',
      })
      .expect(201);

    // Record a transaction in 2026 that should NOT affect 2025 year-end
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-01-15',
        quantity: '50',
        unitPrice: '80.00',
      })
      .expect(201);

    // Request 2025 annual positions report
    const res2025 = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2025.body.data.period.calendarYear).toBe(2025);
    expect(res2025.body.data.period.declarationExercise).toBe(2026);
    expect(res2025.body.data.positions).toHaveLength(1);

    const pos = res2025.body.data.positions[0];
    expect(pos.assetId).toBe(assetId);
    expect(pos.ticker).toBe('VALE3');
    expect(pos.quantity).toBe('100');
    expect(pos.totalHistoricalCost).toBe('6000');
    expect(pos.averageHistoricalCost).toBe('60');
    expect(pos.completenessStatus).toBe('COMPLETE');
    expect(res2025.body.data.summary.totalAssetsCount).toBe(1);
    expect(res2025.body.data.summary.completePositionsCount).toBe(1);
    expect(res2025.body.data.summary.totalHistoricalCostKnown).toBe('6000');

    // Request 2026 annual positions report
    const res2026 = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2026/positions?portfolioId=${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2026.body.data.period.calendarYear).toBe(2026);
    expect(res2026.body.data.period.declarationExercise).toBe(2027);
    expect(res2026.body.data.positions[0].quantity).toBe('150');
    expect(res2026.body.data.positions[0].totalHistoricalCost).toBe('10000');
  });

  it('Scenario 2: Opening positions workflow (POST draft -> GET list -> POST confirm -> GET positions report)', async () => {
    const { token, portfolioId, accountId, assetId } = await setupPortfolio(
      '00000000-0000-4000-8000-000000000002',
      'ITUB4',
    );

    // 1. Post draft opening position
    const draftRes = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        portfolioId,
        accountId,
        assetId,
        effectiveDate: '2024-12-31',
        quantity: '200',
        totalHistoricalCost: '6000.00',
        currency: 'BRL',
        status: 'DRAFT',
        source: 'MANUAL_CONFIRMED',
        notes: 'Pre-Atlas holding',
      })
      .expect(201);

    const openingId = draftRes.body.data.id;
    expect(draftRes.body.data.status).toBe('DRAFT');
    expect(draftRes.body.data.revision).toBe(1);

    // 2. Report should show REQUIRES_CONFIRMATION while in DRAFT
    const repDraft = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(repDraft.body.data.summary.completenessStatus).toBe('REQUIRES_CONFIRMATION');

    // 3. Confirm opening position
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/annual/opening-positions/${openingId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmedAt: '2026-10-01T12:00:00.000Z' })
      .expect(200);

    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    // 4. Report now applies the opening position and becomes COMPLETE
    const repConfirmed = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(repConfirmed.body.data.summary.completenessStatus).toBe('COMPLETE');
    expect(repConfirmed.body.data.positions[0].quantity).toBe('200');
    expect(repConfirmed.body.data.positions[0].totalHistoricalCost).toBe('6000');
    expect(repConfirmed.body.data.positions[0].openingPositionApplied).toBe(true);

    // 5. List active opening positions
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/opening-positions?portfolioId=${portfolioId}&status=CONFIRMED`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(openingId);
  });

  it('Scenario 3: Anti-enumeration & cross-user isolation returns 404 for other user resources', async () => {
    const userA = await setupPortfolio('00000000-0000-4000-8000-00000000000a', 'BBDC4');
    const userB = await setupPortfolio('00000000-0000-4000-8000-00000000000b', 'BBAS3');

    // User B attempts to access User A's annual positions -> 404
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${userA.portfolioId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    // User A records an opening position
    const opRes = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        portfolioId: userA.portfolioId,
        accountId: userA.accountId,
        assetId: userA.assetId,
        effectiveDate: '2024-12-31',
        quantity: '100',
        totalHistoricalCost: '1500.00',
        currency: 'BRL',
        status: 'DRAFT',
        source: 'MANUAL_CONFIRMED',
      })
      .expect(201);

    // User B attempts to confirm User A's opening position -> 404
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/annual/opening-positions/${opRes.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ confirmedAt: '2026-10-01T12:00:00.000Z' })
      .expect(404);
  });

  it('Scenario 4: Idempotent submission and revision increment', async () => {
    const { token, portfolioId, accountId, assetId } = await setupPortfolio(
      '00000000-0000-4000-8000-000000000004',
      'WEGE3',
    );

    // First submission
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        portfolioId,
        accountId,
        assetId,
        effectiveDate: '2024-12-31',
        quantity: '100',
        totalHistoricalCost: '4000.00',
        currency: 'BRL',
        status: 'CONFIRMED',
        source: 'MANUAL_CONFIRMED',
      })
      .expect(201);

    expect(res1.body.data.revision).toBe(1);
    const id1 = res1.body.data.id;

    // Identical resubmission -> returns same record (idempotency)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        portfolioId,
        accountId,
        assetId,
        effectiveDate: '2024-12-31',
        quantity: '100',
        totalHistoricalCost: '4000.00',
        currency: 'BRL',
        status: 'CONFIRMED',
        source: 'MANUAL_CONFIRMED',
      })
      .expect(201);

    expect(res2.body.data.id).toBe(id1);
    expect(res2.body.data.revision).toBe(1);

    // Modified submission (new cost) -> increments revision to 2
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        portfolioId,
        accountId,
        assetId,
        effectiveDate: '2024-12-31',
        quantity: '100',
        totalHistoricalCost: '4500.00',
        currency: 'BRL',
        status: 'CONFIRMED',
        source: 'MANUAL_CONFIRMED',
      })
      .expect(201);

    expect(res3.body.data.id).not.toBe(id1);
    expect(res3.body.data.revision).toBe(2);

    // List active confirmed positions -> only revision 2 is returned
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/opening-positions?portfolioId=${portfolioId}&status=CONFIRMED`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].revision).toBe(2);
    expect(listRes.body.data[0].totalHistoricalCost).toBe('4500');
  });
});
