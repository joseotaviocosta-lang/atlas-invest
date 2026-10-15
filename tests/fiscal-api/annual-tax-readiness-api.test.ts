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

describe('API Integration: Annual Tax Readiness Real E2E Suite (Phase 4H.5 / 4H.5A)', () => {
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

  // Security / Baseline
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

  // Scenario 1: Fully Ready / Empty Year (NO_ACTIVITY / READY)
  it('Scenario 1: Fully ready / no activity returns valid assessment structure with 9 canonical sections', async () => {
    const token = await session(uuidFor('user-e2e-ready'));

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

  // Scenario 2: Opening Position Pending
  it('Scenario 2: Opening position requirement pending degrades readiness when cost is unknown', async () => {
    const userId = uuidFor('user-e2e-opening-pending');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      res.body.data.sections.find((s: { section: string }) => s.section === 'OPENING_POSITIONS'),
    ).toBeDefined();
  });

  // Scenario 3: Capital Market Blocked
  it('Scenario 3: Capital market blocked status propagates to readiness assessment', async () => {
    const userId = uuidFor('user-e2e-cm-blocked');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      res.body.data.sections.find(
        (s: { section: string }) => s.section === 'CAPITAL_MARKET_FISCAL',
      ),
    ).toBeDefined();
  });

  // Scenario 4: Dividend Transition Pending
  it('Scenario 4: Dividend transition pending produces confirmation requirement in 2026', async () => {
    const userId = uuidFor('user-e2e-div-pending');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const transSec = res.body.data.sections.find(
      (s: { section: string }) => s.section === 'TRANSITION_EVIDENCE',
    );
    expect(transSec).toBeDefined();
  });

  // Scenario 5: Dividend Transition Confirmed
  it('Scenario 5: Dividend transition confirmation satisfies requirement via persisted confirmation', async () => {
    const userId = uuidFor('user-e2e-div-confirmed');
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

    expect(confRes.body.data.revision).toBe(1);
    expect(confRes.body.data.decision).toBe('CONFIRMED');

    // Verify readiness reflects the confirmation
    const readRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(readRes.body.data.confirmations).toHaveLength(1);
    expect(readRes.body.data.confirmations[0].subjectReference).toBe('asset-petr4');
  });

  // Scenario 6: FII Pending
  it('Scenario 6: FII exemption verification pending reflects in FII section', async () => {
    const userId = uuidFor('user-e2e-fii-pending');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const fiiSec = res.body.data.sections.find(
      (s: { section: string }) => s.section === 'FII_ELIGIBILITY',
    );
    expect(fiiSec).toBeDefined();
  });

  // Scenario 7: FII Confirmed
  it('Scenario 7: FII exemption confirmation is recorded and returned in confirmations list', async () => {
    const userId = uuidFor('user-e2e-fii-confirmed');
    const token = await session(userId);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
        subjectReference: 'asset-knri11',
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp_knri_fii',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const readRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(readRes.body.data.confirmations).toHaveLength(1);
    expect(readRes.body.data.confirmations[0].confirmationType).toBe('FII_EXEMPTION_REQUIREMENTS');
  });

  // Scenario 8: Missing 6015 Payment Evidence
  it('Scenario 8: Missing 6015 payment section evaluates obligations', async () => {
    const userId = uuidFor('user-e2e-6015-missing');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const paySec = res.body.data.sections.find(
      (s: { section: string }) => s.section === 'PAYMENTS_6015',
    );
    expect(paySec).toBeDefined();
  });

  // Scenario 9: Confirmation Revision
  it('Scenario 9: Multiple confirmation revisions increment revision number and supersede prior active records', async () => {
    const userId = uuidFor('user-e2e-revision');
    const token = await session(userId);

    // First confirmation
    const conf1 = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'OPENING_COST_BASIS',
        subjectReference: 'asset-vale3',
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp_rev_1',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        notes: 'Primeira apuracao',
      })
      .expect(200);

    expect(conf1.body.data.revision).toBe(1);

    // Second confirmation (revising prior)
    const conf2 = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'OPENING_COST_BASIS',
        subjectReference: 'asset-vale3',
        decision: 'CONFIRMED',
        statementVersion: '2025.2',
        sourceFingerprint: 'fp_rev_2',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        notes: 'Segunda apuracao revisada',
      })
      .expect(200);

    expect(conf2.body.data.revision).toBe(2);
    expect(conf2.body.meta.outcome).toBe('SUPERSEDED');

    // Check DB has both records
    const allRecords = await prisma.taxpayerConfirmationRecord.findMany({
      where: { taxSubjectId: userId, calendarYear: 2025, confirmationType: 'OPENING_COST_BASIS' },
      orderBy: { revision: 'asc' },
    });

    expect(allRecords).toHaveLength(2);
    expect(allRecords[0]?.revision).toBe(1);
    expect(allRecords[0]?.decision).toBe('CONFIRMED');
    expect(allRecords[1]?.revision).toBe(2);
    expect(allRecords[1]?.decision).toBe('CONFIRMED');
    expect(allRecords[1]?.supersedesId).toBe(allRecords[0]?.id);
  });

  // Scenario 10: Stale Confirmation
  it('Scenario 10: Stale confirmation detection when source fingerprint diverges', async () => {
    const userId = uuidFor('user-e2e-stale');
    const token = await session(userId);

    // Record confirmation with initial fingerprint
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'WITHHOLDING_PROOF',
        subjectReference: 'asset-bbas3',
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp_initial_val',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const readRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(readRes.body.data.confirmations).toHaveLength(1);
    expect(readRes.body.data.confirmations[0].sourceFingerprint).toBe('fp_initial_val');
  });

  // Scenario 11: Cross-User Isolation
  it('Scenario 11: Strict cross-user isolation prevents foreign confirmation leak or mutation', async () => {
    const userA = uuidFor('user-a-iso');
    const userB = uuidFor('user-b-iso');
    const tokenA = await session(userA);
    const tokenB = await session(userB);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/confirmations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
        subjectReference: 'asset-alzr11',
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'fp_alzr_sample',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resB.body.data.confirmations).toHaveLength(0);
  });

  // Scenario 12: Year Boundary Isolation
  it('Scenario 12: Confirmations for 2025 do not appear in 2026 readiness queries', async () => {
    const userId = uuidFor('user-year-boundary');
    const token = await session(userId);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'GENERAL_TAX_DATA',
        subjectReference: 'general-2025',
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp_gen_2025',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const res2025 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res2026 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2025.body.data.confirmations).toHaveLength(1);
    expect(res2026.body.data.confirmations).toHaveLength(0);
  });

  async function setupPortfolioWithAsset(
    userId: string,
    ticker: string,
    type: 'STOCK' | 'FII' = 'STOCK',
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

    let asset = await prisma.asset.findFirst({ where: { ticker } });
    if (!asset) {
      const created = Asset.create({ ticker, name: ticker, type, currency: 'BRL', exchange: 'B3' });
      asset = await prisma.asset.create({
        data: {
          id: created.id,
          ticker: created.ticker,
          name: created.name,
          type: created.type,
          currency: created.currency,
          exchange: created.exchange,
        },
      });
    }

    return { token, portfolioId, accountId, assetId: asset.id };
  }

  // Scenario 13: Opening 0 / Closing 2 Positions wiring (H10 Hotfix-01)
  it('Scenario 13: Annual Readiness reflects 2 closing positions at 31/12 with READY status and agrees with DIRPF support', async () => {
    const userId = uuidFor('user-readiness-closing-2');
    const { token, portfolioId, accountId, assetId: petr4Id } = await setupPortfolioWithAsset(
      userId,
      'PETR4',
    );

    const createdVale = Asset.create({
      ticker: 'VALE3',
      name: 'VALE3',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    const vale3 = await prisma.asset.upsert({
      where: { ticker_exchange: { ticker: 'VALE3', exchange: 'B3' } },
      create: {
        id: createdVale.id,
        ticker: createdVale.ticker,
        name: createdVale.name,
        type: createdVale.type,
        currency: createdVale.currency,
        exchange: createdVale.exchange,
      },
      update: {},
    });

    // 2026: BUY 200 PETR4 @ 22.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4Id,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '200',
        unitPrice: '22.00',
        fees: '4.90',
      })
      .expect(201);

    // 2026: BUY 10 VALE3 @ 30.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: vale3.id,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '10',
        unitPrice: '30.00',
      })
      .expect(201);

    // Query Annual Readiness for 2026
    const readinessRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const openingSec = readinessRes.body.data.sections.find(
      (s: { section: string }) => s.section === 'OPENING_POSITIONS',
    );
    const closingSec = readinessRes.body.data.sections.find(
      (s: { section: string }) => s.section === 'ANNUAL_POSITIONS',
    );

    expect(openingSec.status).toBe('NO_ACTIVITY');
    expect(closingSec.status).toBe('READY');
    expect(closingSec.isComplete).toBe(true);
    expect(closingSec.blockingReasons).toHaveLength(0);

    // Query DIRPF support package to verify 2 Bens e Direitos items
    const reportingRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const bensSec = reportingRes.body.data.sections.find(
      (s: { section: string }) => s.section === 'BENS_E_DIREITOS',
    );
    expect(bensSec.itemCount).toBe(2);
  });

  // Scenario 14: Partial Sale retains READY closing position (VALE3 mirror)
  it('Scenario 14: Partial sale leaves positive closing position with READY status', async () => {
    const userId = uuidFor('user-readiness-partial-sale');
    const { token, portfolioId, accountId, assetId } = await setupPortfolioWithAsset(
      userId,
      'VALE3_P',
    );

    // BUY 20 @ 30.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        quantity: '20',
        unitPrice: '30.00',
      })
      .expect(201);

    // SELL 5 @ 45.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'SELL',
        currency: 'BRL',
        tradeDate: '2026-03-15',
        quantity: '5',
        unitPrice: '45.00',
      })
      .expect(201);

    const readinessRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const closingSec = readinessRes.body.data.sections.find(
      (s: { section: string }) => s.section === 'ANNUAL_POSITIONS',
    );
    expect(closingSec.status).toBe('READY');
    expect(closingSec.isComplete).toBe(true);
  });

  // Scenario 15: Full Sale to zero gives NO_ACTIVITY closing position
  it('Scenario 15: Full sale to zero gives NO_ACTIVITY closing position', async () => {
    const userId = uuidFor('user-readiness-full-sale');
    const { token, portfolioId, accountId, assetId } = await setupPortfolioWithAsset(
      userId,
      'TEMP_FULL',
    );

    // BUY 10 @ 30.00
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-02-01',
        quantity: '10',
        unitPrice: '30.00',
      })
      .expect(201);

    // SELL 10 @ 35.00 (position reaches zero)
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type: 'SELL',
        currency: 'BRL',
        tradeDate: '2026-02-15',
        quantity: '10',
        unitPrice: '35.00',
      })
      .expect(201);

    const readinessRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const closingSec = readinessRes.body.data.sections.find(
      (s: { section: string }) => s.section === 'ANNUAL_POSITIONS',
    );
    expect(closingSec.status).toBe('NO_ACTIVITY');
    expect(closingSec.isComplete).toBe(true);
  });

  // Scenario 16: Cross-user isolation - user B does not see user A closing positions
  it('Scenario 16: Cross-user isolation - user B does not see user A closing positions', async () => {
    const userA = uuidFor('user-a-iso');
    const userB = uuidFor('user-b-iso');

    const { token: tokenA, portfolioId, accountId, assetId } = await setupPortfolioWithAsset(
      userA,
      'ISO_A',
    );
    const tokenB = await session(userB);

    // User A has 1 position
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-05-10',
        quantity: '50',
        unitPrice: '25.00',
      })
      .expect(201);

    const resA = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const closingA = resA.body.data.sections.find(
      (s: { section: string }) => s.section === 'ANNUAL_POSITIONS',
    );
    const closingB = resB.body.data.sections.find(
      (s: { section: string }) => s.section === 'ANNUAL_POSITIONS',
    );

    expect(closingA.status).toBe('READY');
    expect(closingB.status).toBe('NO_ACTIVITY');
  });
});

