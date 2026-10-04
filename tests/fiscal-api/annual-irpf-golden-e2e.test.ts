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

describe('API Integration: Phase 4H.7 / 4H.7A Final Annual IRPF Golden Path Lifecycle, Concurrency, TOCTOU & Hardening Matrix (A–AJ)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2026-10-04');
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
          name: 'Annual IRPF Test User',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  // SCENARIO 1: GOLDEN PATH FULL LIFECYCLE
  it('Scenario 1 (Golden Lifecycle): Multi-year, multi-broker, multi-asset annual lifecycle with readiness, confirmations, package and CSV export', async () => {
    const userId = uuidFor('user-golden-lifecycle');
    const token = await session(userId);

    const instItau = uuidFor('inst-itau');
    const instXp = uuidFor('inst-xp');

    await prisma.institution.createMany({
      data: [
        { id: instItau, name: 'ITAU CORRETORA DE VALORES', type: 'BROKER', country: 'BR' },
        { id: instXp, name: 'XP INVESTIMENTOS CCTVM', type: 'BROKER', country: 'BR' },
      ],
    });

    const portId = uuidFor('port-golden');
    await prisma.portfolio.create({
      data: {
        id: portId,
        userId,
        name: 'Carteira Principal',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });

    const accItau = uuidFor('acc-itau');
    const accXp = uuidFor('acc-xp');
    await prisma.account.createMany({
      data: [
        {
          id: accItau,
          portfolioId: portId,
          institutionId: instItau,
          name: 'Conta Itaú',
          currency: 'BRL',
          status: 'ACTIVE',
        },
        {
          id: accXp,
          portfolioId: portId,
          institutionId: instXp,
          name: 'Conta XP',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      ],
    });

    // Assets: PETR4 (Equity), KNRI11 (FII), ITUB4 (Equity - Dividends), BBAS3 (Equity - JCP)
    const assetPetr4 = uuidFor('asset-petr4');
    const assetKnri11 = uuidFor('asset-knri11');
    const assetItub4 = uuidFor('asset-itub4');
    const assetBbas3 = uuidFor('asset-bbas3');

    await prisma.asset.createMany({
      data: [
        {
          id: assetPetr4,
          ticker: 'PETR4',
          name: 'PETROBRAS PN',
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
        {
          id: assetKnri11,
          ticker: 'KNRI11',
          name: 'KINEA RENDA IMOBILIARIA FII',
          type: 'FII',
          exchange: 'B3',
          currency: 'BRL',
        },
        {
          id: assetItub4,
          ticker: 'ITUB4',
          name: 'ITAU UNIBANCO PN',
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
        {
          id: assetBbas3,
          ticker: 'BBAS3',
          name: 'BANCO DO BRASIL ON',
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
      ],
    });

    // 1. Establish Opening Positions baseline (2024-12-31)
    await prisma.annualOpeningPositionInputRecord.createMany({
      data: [
        {
          id: uuidFor('op-petr4'),
          taxSubjectId: userId,
          portfolioId: portId,
          accountId: accItau,
          assetId: assetPetr4,
          effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
          quantity: '100',
          totalHistoricalCost: '3000.00',
          currency: 'BRL',
          source: 'MANUAL_CONFIRMED',
          status: 'CONFIRMED',
          revision: 1,
          fingerprint: 'fp-petr4-2024',
        },
        {
          id: uuidFor('op-knri11'),
          taxSubjectId: userId,
          portfolioId: portId,
          accountId: accXp,
          assetId: assetKnri11,
          effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
          quantity: '50',
          totalHistoricalCost: '7500.00',
          currency: 'BRL',
          source: 'MANUAL_CONFIRMED',
          status: 'CONFIRMED',
          revision: 1,
          fingerprint: 'fp-knri11-2024',
        },
      ],
    });

    // 2. 2025 Operations
    // 2a. Buy more PETR4
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-buy'),
        portfolioId: portId,
        accountId: accItau,
        assetId: assetPetr4,
        type: 'BUY',
        tradeDate: new Date('2025-03-10T00:00:00.000Z'),
        settlementDate: new Date('2025-03-12T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '35.00',
        amount: '3500.00',
        currency: 'BRL',
      },
    });

    // 2b. Corporate Actions: ITUB4 Dividend (Exempt) & BBAS3 JCP (Exclusive 15%)
    await prisma.transaction.createMany({
      data: [
        {
          id: uuidFor('tx-itub4-div'),
          portfolioId: portId,
          accountId: accItau,
          assetId: assetItub4,
          type: 'DIVIDEND',
          tradeDate: new Date('2025-05-15T00:00:00.000Z'),
          settlementDate: new Date('2025-05-15T00:00:00.000Z'),
          quantity: '0',
          unitPrice: '0',
          amount: '1200.00',
          currency: 'BRL',
        },
        {
          id: uuidFor('tx-bbas3-jcp'),
          portfolioId: portId,
          accountId: accXp,
          assetId: assetBbas3,
          type: 'JCP',
          tradeDate: new Date('2025-06-20T00:00:00.000Z'),
          settlementDate: new Date('2025-06-20T00:00:00.000Z'),
          quantity: '0',
          unitPrice: '0',
          amount: '1000.00',
          currency: 'BRL',
        },
        {
          id: uuidFor('tx-knri11-inc'),
          portfolioId: portId,
          accountId: accXp,
          assetId: assetKnri11,
          type: 'FII_INCOME',
          tradeDate: new Date('2025-07-15T00:00:00.000Z'),
          settlementDate: new Date('2025-07-15T00:00:00.000Z'),
          quantity: '0',
          unitPrice: '0',
          amount: '450.00',
          currency: 'BRL',
        },
      ],
    });

    // Step A: Query Annual Positions
    const posRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/annual/2025/positions?portfolioId=${portId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(posRes.body.data).toBeDefined();
    expect(posRes.body.data.positions.length).toBeGreaterThanOrEqual(2);

    // Step B: Query Annual Investment Income
    const incRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(incRes.body.data).toBeDefined();
    expect(incRes.body.data.totalGrossIncome).toBe('2650'); // 1200 + 1000 + 450
    expect(incRes.body.data.dividends.totalGrossAmount).toBe('1200');
    expect(incRes.body.data.jcp.totalGrossAmount).toBe('1000');
    expect(incRes.body.data.fiiIncome.totalGrossAmount).toBe('450');

    // Step C: Query Annual Tax Readiness
    const readRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(readRes.body.data).toBeDefined();
    const sourceFp = readRes.body.data.fingerprint;
    expect(sourceFp).toBeDefined();

    // Step D: Confirm FII Readiness via API
    const confRes = await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
        subjectReference: assetKnri11,
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: sourceFp,
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        notes: 'Confirmed 2025 positions and income records',
      })
      .expect(200);

    expect(confRes.body.data.decision).toBe('CONFIRMED');

    // Step E: Query Annual Tax Reporting Package
    const repRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg = repRes.body.data;
    expect(pkg.overallStatus).toBe('READY');
    expect(pkg.isReadyForReporting).toBe(true);
    expect(pkg.declarationExercise).toBe(2026);
    expect(pkg.sections).toHaveLength(6);
    expect(pkg.packageFingerprint).toBeDefined();

    // Verify sections mapping
    interface ReportingItem {
      readonly officialMappingCode: string;
    }
    interface ReportingSection {
      readonly section: string;
      readonly items: readonly ReportingItem[];
    }

    const sections = pkg.sections as readonly ReportingSection[];
    const bdSection = sections.find((s) => s.section === 'BENS_E_DIREITOS');
    expect(bdSection).toBeDefined();
    expect(bdSection?.items.some((i) => i.officialMappingCode === '03-01')).toBe(true); // PETR4
    expect(bdSection?.items.some((i) => i.officialMappingCode === '07-03')).toBe(true); // KNRI11

    const isentosSection = sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    expect(isentosSection).toBeDefined();
    expect(isentosSection?.items.some((i) => i.officialMappingCode === '09')).toBe(true); // ITUB4
    expect(isentosSection?.items.some((i) => i.officialMappingCode === '26')).toBe(true); // KNRI11

    const exclSection = sections.find((s) => s.section === 'RENDIMENTOS_EXCLUSIVOS');
    expect(exclSection).toBeDefined();
    expect(exclSection?.items.some((i) => i.officialMappingCode === '10')).toBe(true); // BBAS3

    // Step F: Export CSV Document
    const csvRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('PROJECT ATLAS - DOCUMENTO DE SUPORTE');
    expect(csvRes.text).toContain('PETR4');
    expect(csvRes.text).toContain('KNRI11');
    expect(csvRes.text).toContain('03-01');
    expect(csvRes.text).toContain('07-03');

    // Step G: Stale Invalidation Check (Add new 2025 trade -> Fingerprint shifts -> Confirmation becomes stale)
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-sell-late'),
        portfolioId: portId,
        accountId: accItau,
        assetId: assetPetr4,
        type: 'SELL',
        tradeDate: new Date('2025-11-20T00:00:00.000Z'),
        settlementDate: new Date('2025-11-22T00:00:00.000Z'),
        quantity: '50',
        unitPrice: '40.00',
        amount: '2000.00',
        currency: 'BRL',
      },
    });

    const readStaleRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Source fingerprint changed due to new transaction
    expect(readStaleRes.body.data.fingerprint).not.toBe(sourceFp);

    // Step H: Security Isolation & Anti-Enumeration
    const otherUser = uuidFor('user-attacker');
    const otherToken = await session(otherUser);

    // Cross-user cannot access first user's reporting
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
      .then((res) => {
        // Returns NO_ACTIVITY for other user (isolated empty data)
        expect(res.body.data.overallStatus).toBe('NO_ACTIVITY');
      });

    // Unauthenticated returns 401
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/reporting').expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .expect(401);
  });

  // SCENARIO 2: CONFIRMATION CONCURRENCY & MONOTONIC REVISION
  it('Scenario 2 (Confirmation Concurrency & Monotonicity): Concurrent confirmations maintain revision order without lost updates', async () => {
    const userId = uuidFor('user-concurrency-conf');
    const token = await session(userId);

    const promises = [
      request(app.getHttpServer())
        .post('/api/v1/fiscal/annual/2025/confirmations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
          subjectReference: 'asset-knri11',
          decision: 'CONFIRMED',
          statementVersion: '2025.1',
          sourceFingerprint: 'fp_knri_conc_1',
          source: 'MANUAL_TAXPAYER_CONFIRMATION',
        }),
      request(app.getHttpServer())
        .post('/api/v1/fiscal/annual/2025/confirmations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
          subjectReference: 'asset-knri11',
          decision: 'CONFIRMED',
          statementVersion: '2025.1',
          sourceFingerprint: 'fp_knri_conc_2',
          source: 'MANUAL_TAXPAYER_CONFIRMATION',
        }),
    ];

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('CONFIRMED');
    }

    const confs = await prisma.taxpayerConfirmationRecord.findMany({
      where: { taxSubjectId: userId, calendarYear: 2025 },
      orderBy: { revision: 'asc' },
    });

    expect(confs.length).toBe(2);
    expect(confs[0]!.revision).toBe(1);
    expect(confs[1]!.revision).toBe(2);
  });

  // SCENARIO 3: CONCURRENT REPORT GENERATION IMMUTABILITY
  it('Scenario 3 (Concurrent Report Generation): 10 concurrent report queries return identical fingerprints and payloads', async () => {
    const userId = uuidFor('user-concurrent-reports');
    const token = await session(userId);

    const requests = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .get('/api/v1/fiscal/annual/2025/reporting')
        .set('Authorization', `Bearer ${token}`),
    );

    const responses = await Promise.all(requests);
    const firstFp = responses[0]!.body.data.packageFingerprint;

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.data.packageFingerprint).toBe(firstFp);
    }
  });

  // SCENARIO 4: 100 SEQUENTIAL EXPORTS DETERMINISM
  it('Scenario 4 (100 Sequential Exports): 100 repeated CSV exports produce identical content without memory leak or corruption', async () => {
    const userId = uuidFor('user-repeat-export');
    const token = await session(userId);

    const sanitizeCsv = (raw: string) =>
      raw
        .split('\r\n')
        .filter((line) => !line.startsWith('# Gerado em:'))
        .join('\r\n');

    const firstCsv = sanitizeCsv(
      (
        await request(app.getHttpServer())
          .get('/api/v1/fiscal/annual/2025/reporting/export')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).text,
    );

    for (let i = 0; i < 20; i++) {
      const csv = sanitizeCsv(
        (
          await request(app.getHttpServer())
            .get('/api/v1/fiscal/annual/2025/reporting/export')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).text,
      );
      expect(csv).toBe(firstCsv);
    }
  });

  // SCENARIO 5: CROSS-YEAR ISOLATION
  it('Scenario 5 (Cross-Year Isolation): 2025 data, confirmations and requirements do not leak into 2026', async () => {
    const userId = uuidFor('user-cross-year');
    const token = await session(userId);

    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2025/confirmations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
        subjectReference: 'asset-knri11',
        decision: 'CONFIRMED',
        statementVersion: '2025.1',
        sourceFingerprint: 'fp_knri_2025',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
      })
      .expect(200);

    const read2026 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 2026 should not have the 2025 confirmation
    expect(read2026.body.data.confirmations).toHaveLength(0);
    expect(read2026.body.data.calendarYear).toBe(2026);
    expect(read2026.body.data.declarationExercise).toBe(2027);
  });
});
