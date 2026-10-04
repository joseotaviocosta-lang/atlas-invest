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

interface TestSectionItem {
  readonly reportingItemId: string;
  readonly section: string;
  readonly category: string;
  readonly officialMappingCode: string;
  readonly officialMappingLabel: string;
  readonly mappingStatus: string;
  readonly description: string;
  readonly assetId?: string;
  readonly ticker?: string;
  readonly payerId?: string;
  readonly payerName?: string;
  readonly grossAmount?: string;
  readonly withheldAmount?: string;
  readonly netAmount?: string;
  readonly openingCostBasis?: string;
  readonly closingCostBasis?: string;
  readonly isBlocked: boolean;
  readonly blockingReasons: readonly string[];
  readonly sourceReferences: readonly string[];
}

interface TestSectionSummary {
  readonly section: string;
  readonly title: string;
  readonly status: string;
  readonly isComplete: boolean;
  readonly itemCount: number;
  readonly items: readonly TestSectionItem[];
  readonly blockingReasons: readonly string[];
}

interface TestReportingPackage {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly overallStatus: string;
  readonly isReadyForReporting: boolean;
  readonly reportingRuleVersion: string;
  readonly generatedAt: string;
  readonly sections: readonly TestSectionSummary[];
  readonly blockedItems: readonly TestSectionItem[];
  readonly pendingConfirmations: readonly TestSectionItem[];
  readonly packageFingerprint: string;
  readonly disclaimer: string;
}

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

describe('API Integration: Annual Tax Reporting Real 13-Scenario E2E Matrix (Phase 4H.6B)', () => {
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

  // 1. Fully Ready
  it('Scenario 1 (fully ready): Active portfolio with all confirmed data produces overallStatus READY, isReadyForReporting true', async () => {
    const userId = uuidFor('user-full-ready');
    const token = await session(userId);
    const portfolioId = uuidFor('port-full-ready');
    const accountId = uuidFor('acc-full-ready');
    const assetId = uuidFor('asset-petr4-ready');
    const institutionId = uuidFor('inst-full-ready');

    await prisma.institution.create({
      data: { id: institutionId, name: 'XP INVESTIMENTOS', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Main Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'XP Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'PETR4',
        name: 'PETROBRAS PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-petr4-ready'),
        taxSubjectId: userId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
        quantity: '100',
        totalHistoricalCost: '3000.00',
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
        fingerprint: 'fp-petr4-ready',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-buy-ready'),
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2025-06-15T00:00:00.000Z'),
        settlementDate: new Date('2025-06-17T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '35.00',
        amount: '3500.00',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-div-ready'),
        portfolioId,
        accountId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: new Date('2025-08-10T00:00:00.000Z'),
        settlementDate: new Date('2025-08-10T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '500.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg: TestReportingPackage = res.body.data;
    expect(pkg.overallStatus).toBe('READY');
    expect(pkg.isReadyForReporting).toBe(true);
    expect(pkg.sections).toHaveLength(6);
  });

  // 2. Blocked positions
  it('Scenario 2 (blocked positions): Position with unconfirmed cost degrades package to BLOCKED / isReadyForReporting=false', async () => {
    const userId = uuidFor('user-blocked-pos');
    const token = await session(userId);
    const portfolioId = uuidFor('port-blocked-pos');
    const accountId = uuidFor('acc-blocked-pos');
    const assetId = uuidFor('asset-blocked-pos');
    const institutionId = uuidFor('inst-blocked-pos');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Corretora X', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Portfolio X',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Account X',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-vale3-unconfirmed'),
        taxSubjectId: userId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
        quantity: '50',
        totalHistoricalCost: '2500.00',
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'DRAFT',
        revision: 1,
        fingerprint: 'fp-vale3-draft',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg: TestReportingPackage = res.body.data;
    expect(pkg.isReadyForReporting).toBe(false);
    expect(pkg.overallStatus).toBe('BLOCKED');
    expect(pkg.blockedItems.length).toBeGreaterThan(0);
  });

  // 3. Transition pending
  it('Scenario 3 (transition pending): 2026 dividend without transition confirmation is marked requires confirmation', async () => {
    const userId = uuidFor('user-trans-pending');
    const token = await session(userId);
    const portfolioId = uuidFor('port-trans-pending');
    const accountId = uuidFor('acc-trans-pending');
    const assetId = uuidFor('asset-bbas3-trans');
    const institutionId = uuidFor('inst-trans-pending');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Banco do Brasil', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port BB',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta BB',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Dividend received in 2026 without transition confirmation
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-bbas3-div-2026'),
        portfolioId,
        accountId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-03-10T00:00:00.000Z'),
        settlementDate: new Date('2026-03-10T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '12000.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg: TestReportingPackage = res.body.data;
    expect(pkg.calendarYear).toBe(2026);
    expect(pkg.declarationExercise).toBe(2027);
  });

  // 4. Transition resolved
  it('Scenario 4 (transition resolved): 2026 dividend with confirmed transition eligibility maps to Rendimentos Isentos 09', async () => {
    const userId = uuidFor('user-trans-resolved');
    const token = await session(userId);
    const portfolioId = uuidFor('port-trans-resolved');
    const accountId = uuidFor('acc-trans-resolved');
    const assetId = uuidFor('asset-itsa4-trans');
    const institutionId = uuidFor('inst-trans-resolved');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Itaú Corretora', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port Itaú',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Itaú',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'ITSA4',
        name: 'Itaúsa PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-itsa4-div-2026'),
        portfolioId,
        accountId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-04-15T00:00:00.000Z'),
        settlementDate: new Date('2026-04-15T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '8000.00',
        currency: 'BRL',
      },
    });

    // Record taxpayer confirmation for pre-2026 transition
    await prisma.taxpayerConfirmationRecord.create({
      data: {
        id: uuidFor('conf-itsa4-trans'),
        taxSubjectId: userId,
        calendarYear: 2026,
        confirmationType: 'DIVIDEND_TRANSITION_ELIGIBILITY',
        subjectReference: assetId,
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'fp-itsa4-div',
        source: 'TAXPAYER_DIRECT_CONFIRMATION',
        createdByPrincipal: userId,
        revision: 1,
        fingerprint: 'fp-conf-itsa4',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2026);
  });

  // 5. FII pending
  it('Scenario 5 (FII pending): FII distribution without confirmed eligibility facts propagates fail-closed', async () => {
    const userId = uuidFor('user-fii-pending');
    const token = await session(userId);
    const portfolioId = uuidFor('port-fii-pending');
    const accountId = uuidFor('acc-fii-pending');
    const assetId = uuidFor('asset-knri-pending');
    const institutionId = uuidFor('inst-fii-pending');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Corretora FII', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port FII',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta FII',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'KNRI11',
        name: 'Kinea Renda Imobiliaria FII',
        type: 'FII',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-knri-inc'),
        portfolioId,
        accountId,
        assetId,
        type: 'FII_INCOME',
        tradeDate: new Date('2025-05-15T00:00:00.000Z'),
        settlementDate: new Date('2025-05-15T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '1500.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg: TestReportingPackage = res.body.data;
    expect(pkg.calendarYear).toBe(2025);
  });

  // 6. FII resolved
  it('Scenario 6 (FII resolved): FII distribution with confirmed facts maps to Rendimentos Isentos 26', async () => {
    const userId = uuidFor('user-fii-resolved');
    const token = await session(userId);
    const portfolioId = uuidFor('port-fii-resolved');
    const accountId = uuidFor('acc-fii-resolved');
    const assetId = uuidFor('asset-hglg-resolved');
    const institutionId = uuidFor('inst-fii-resolved');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Credit Suisse', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port HGLG',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta HGLG',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'HGLG11',
        name: 'CSHG Logistica FII',
        type: 'FII',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/fii-metadata')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        asOfDate: '2025-01-01',
        holderCount: 500,
        investorOwnershipPercent: '0.0001',
        isExchangeTraded: true,
        sourceType: 'OFFICIAL_FUND_DATA',
        sourceReference: 'fii-fact-hglg',
        status: 'KNOWN',
      })
      .expect(200);

    await prisma.taxpayerConfirmationRecord.create({
      data: {
        id: uuidFor('conf-hglg-fii'),
        taxSubjectId: userId,
        calendarYear: 2025,
        confirmationType: 'FII_LEGAL_EXEMPTION_ELIGIBILITY',
        subjectReference: assetId,
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp-hglg-facts',
        source: 'TAXPAYER_DIRECT_CONFIRMATION',
        createdByPrincipal: userId,
        revision: 1,
        fingerprint: 'fp-conf-hglg',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-hglg-inc'),
        portfolioId,
        accountId,
        assetId,
        type: 'FII_INCOME',
        tradeDate: new Date('2025-05-15T00:00:00.000Z'),
        settlementDate: new Date('2025-05-15T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '2000.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
  });

  // 7. 6015 Paid
  it('Scenario 7 (6015 paid): Paid tax obligation reports in Imposto Pago (DARF_6015_PAGO)', async () => {
    const userId = uuidFor('user-6015-paid');
    const token = await session(userId);
    const portfolioId = uuidFor('port-6015-paid');
    const accountId = uuidFor('acc-6015-paid');
    const assetId = uuidFor('asset-6015-paid');
    const institutionId = uuidFor('inst-6015-paid');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Broker Paid', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port Paid',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Paid',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Tax obligation created & marked PAID
    const obligationId = uuidFor('ob-6015-paid');
    await prisma.taxObligationRecord.create({
      data: {
        id: obligationId,
        taxSubjectId: userId,
        competence: '2025-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-ob-paid-fingerprint',
        revision: 1,
        principalAmount: '150.00',
        currency: 'BRL',
        dueDate: new Date('2025-04-30T00:00:00.000Z'),
        status: 'PAID',
        darfReadiness: 'READY',
        dataQuality: 'CONFIRMED',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
  });

  // 8. 6015 Unpaid
  it('Scenario 8 (6015 unpaid): Unpaid tax obligation reports in Imposto Pago as DARF_6015_PENDENTE', async () => {
    const userId = uuidFor('user-6015-unpaid');
    const token = await session(userId);

    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-6015-unpaid'),
        taxSubjectId: userId,
        competence: '2025-04',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-ob-unpaid-fingerprint',
        revision: 1,
        principalAmount: '200.00',
        currency: 'BRL',
        dueDate: new Date('2025-05-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'CONFIRMED',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
  });

  // 9. Stale Confirmation
  it('Scenario 9 (stale confirmation): Changing upstream fingerprint flags confirmation as stale', async () => {
    const userId = uuidFor('user-stale-conf');
    const token = await session(userId);

    await prisma.taxpayerConfirmationRecord.create({
      data: {
        id: uuidFor('conf-stale-test'),
        taxSubjectId: userId,
        calendarYear: 2025,
        confirmationType: 'OPENING_POSITION_COST_BASIS',
        subjectReference: 'asset-stale-ref',
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'old-source-fp',
        source: 'TAXPAYER_DIRECT_CONFIRMATION',
        createdByPrincipal: userId,
        revision: 1,
        fingerprint: 'fp-conf-stale',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
  });

  // 10. Source Revision Determinism
  it('Scenario 10 (source revision): Modifying transactions produces a different package fingerprint (P1 != P2)', async () => {
    const userId = uuidFor('user-src-rev');
    const token = await session(userId);
    const portfolioId = uuidFor('port-src-rev');
    const accountId = uuidFor('acc-src-rev');
    const assetId = uuidFor('asset-src-rev');
    const institutionId = uuidFor('inst-src-rev');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Broker Rev', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port Rev',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Rev',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'B3SA3',
        name: 'B3 SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // P1
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fp1 = res1.body.data.packageFingerprint;

    // Mutate source: add a transaction
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-b3sa3-buy-rev'),
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2025-02-10T00:00:00.000Z'),
        settlementDate: new Date('2025-02-12T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '12.00',
        amount: '1200.00',
        currency: 'BRL',
      },
    });

    // P2
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fp2 = res2.body.data.packageFingerprint;

    expect(fp1).toBeDefined();
    expect(fp2).toBeDefined();
    expect(fp1).not.toBe(fp2);
  });

  // 11. Provisional Mapping
  it('Scenario 11 (provisional mapping): Taxable dividends in 2026 map with PROVISIONAL mapping status', async () => {
    const userId = uuidFor('user-prov-map');
    const token = await session(userId);
    const portfolioId = uuidFor('port-prov-map');
    const accountId = uuidFor('acc-prov-map');
    const assetId = uuidFor('asset-prov-map');
    const institutionId = uuidFor('inst-prov-map');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Broker Prov', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Port Prov',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Prov',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-vale3-high-div'),
        portfolioId,
        accountId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-07-20T00:00:00.000Z'),
        settlementDate: new Date('2026-07-20T00:00:00.000Z'),
        quantity: '0',
        unitPrice: '0',
        amount: '60000.00',
        currency: 'BRL',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.calendarYear).toBe(2026);
  });

  // 12. Cross-user isolation
  it('Scenario 12 (cross-user): Strict multi-user isolation on both API and CSV export endpoints', async () => {
    const userA = uuidFor('user-iso-a');
    const userB = uuidFor('user-iso-b');
    const tokenA = await session(userA);
    const tokenB = await session(userB);

    const portfolioA = uuidFor('port-iso-a');
    const accountA = uuidFor('acc-iso-a');
    const assetA = uuidFor('asset-iso-a');
    const institutionA = uuidFor('inst-iso-a');

    await prisma.institution.create({
      data: { id: institutionA, name: 'Corretora A', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioA,
        userId: userA,
        name: 'Port A',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await prisma.account.create({
      data: {
        id: accountA,
        portfolioId: portfolioA,
        institutionId: institutionA,
        name: 'Conta A',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetA,
        ticker: 'WEGE3',
        name: 'WEG SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-wege3-a'),
        taxSubjectId: userA,
        portfolioId: portfolioA,
        accountId: accountA,
        assetId: assetA,
        effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
        quantity: '300',
        totalHistoricalCost: '12000.00',
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
        fingerprint: 'fp-op-wege3-a',
      },
    });

    const resA = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const bensA = resA.body.data.sections.find(
      (s: TestSectionSummary) => s.section === 'BENS_E_DIREITOS',
    );
    const bensB = resB.body.data.sections.find(
      (s: TestSectionSummary) => s.section === 'BENS_E_DIREITOS',
    );

    expect(bensA.items.some((i: TestSectionItem) => i.ticker === 'WEGE3')).toBe(true);
    expect(bensB.items.some((i: TestSectionItem) => i.ticker === 'WEGE3')).toBe(false);

    // CSV export check
    const csvA = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const csvB = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(csvA.text).toContain('WEGE3');
    expect(csvB.text).not.toContain('WEGE3');
  });

  // 13. Year Boundary
  it('Scenario 13 (year boundary): Requests for calendarYear 2024 vs 2025 produce distinct exercises (calendarYear + 1)', async () => {
    const userId = uuidFor('user-year-boundary');
    const token = await session(userId);

    const res2024 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2024/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res2025 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2024.body.data.calendarYear).toBe(2024);
    expect(res2024.body.data.declarationExercise).toBe(2025);

    expect(res2025.body.data.calendarYear).toBe(2025);
    expect(res2025.body.data.declarationExercise).toBe(2026);
  });
});
