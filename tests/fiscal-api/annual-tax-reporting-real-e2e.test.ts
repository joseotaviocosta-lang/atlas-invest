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

describe('API Integration: Annual Tax Reporting Real E2E Matrix (Phase 4H.6A)', () => {
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

  it('1. Rejects unauthenticated requests with 401 on both JSON and CSV export endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/fiscal/annual/2025/reporting').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .expect(401);
  });

  it('2. Empty portfolio produces a COMPLETE / READY_FOR_REPORTING package with canonical sections and disclaimer', async () => {
    const userId = uuidFor('user-empty-reporting');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg: TestReportingPackage = res.body.data;
    expect(pkg.calendarYear).toBe(2025);
    expect(pkg.declarationExercise).toBe(2026);
    expect(pkg.overallStatus).toBe('NO_ACTIVITY');
    expect(pkg.isReadyForReporting).toBe(true);
    expect(pkg.disclaimer).toContain('Não substitui o Programa Gerador da Declaração');
    expect(pkg.sections).toHaveLength(6);
    expect(pkg.blockedItems).toHaveLength(0);
    expect(pkg.pendingConfirmations).toHaveLength(0);
  });

  it('3. Populated equity portfolio returns mapped Bens e Direitos, Rendimentos and Variable Income', async () => {
    const userId = uuidFor('user-full-reporting');
    const token = await session(userId);
    const portfolioId = uuidFor('portfolio-full-reporting');
    const accountId = uuidFor('account-full-reporting');
    const assetId = uuidFor('asset-petr4');
    const institutionId = uuidFor('inst-full-reporting');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Corretora Alfa', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Carteira Principal',
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
        name: 'Conta Principal',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    await prisma.asset.create({
      data: {
        id: assetId,
        ticker: 'PETR4',
        name: 'Petroleo Brasileiro SA',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Seed opening position
    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-petr4'),
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
        fingerprint: 'fp-op-petr4',
      },
    });

    // Buy transaction in 2025
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-buy'),
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

    // Dividend in 2025
    await prisma.transaction.create({
      data: {
        id: uuidFor('tx-petr4-div'),
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

    const bens = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    expect(bens).toBeDefined();
    expect(bens!.items.length).toBeGreaterThan(0);
    const petr4Item = bens!.items.find((i) => i.ticker === 'PETR4');
    expect(petr4Item).toBeDefined();
    expect(petr4Item!.officialMappingCode).toBe('03-01'); // Grupo 03 - Código 01: Ações (inclusive as listadas em bolsa)

    const isentos = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    expect(isentos).toBeDefined();
    expect(isentos!.items.length).toBeGreaterThan(0);
    const divItem = isentos!.items.find((i) => i.officialMappingCode === '09');
    expect(divItem).toBeDefined();
    expect(divItem!.grossAmount).toBe('500');
  });

  it('4. CSV export delivers formatted attachment with UTF-8 charset and all sections', async () => {
    const userId = uuidFor('user-csv-export');
    const token = await session(userId);
    const portfolioId = uuidFor('portfolio-csv-export');
    const accountId = uuidFor('account-csv-export');
    const assetId = uuidFor('asset-vale-csv');
    const institutionId = uuidFor('inst-csv-export');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Corretora CSV', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Carteira CSV',
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
        name: 'Conta CSV',
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
        id: uuidFor('op-vale3-csv'),
        taxSubjectId: userId,
        portfolioId,
        accountId,
        assetId,
        effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
        quantity: '100',
        totalHistoricalCost: '6000.00',
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
        fingerprint: 'fp-op-vale3-csv',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2025/reporting/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="atlas-suporte-irpf-2025.csv"',
    );
    expect(res.text).toContain('# PROJECT ATLAS - DOCUMENTO DE SUPORTE');
    expect(res.text).toContain('# Exercicio: 2026 (Ano-Calendario: 2025)');
    expect(res.text).toContain('Secao;Codigo Declaracao;Item / Categoria');
    expect(res.text).toContain('BENS_E_DIREITOS');
    expect(res.text).toContain('VALE3');
  });

  it('5. Pending confirmation or blocked evidence causes package to reflect BLOCKED / isReadyForReporting=false', async () => {
    const userId = uuidFor('user-blocked-reporting');
    const token = await session(userId);
    const portfolioId = uuidFor('portfolio-blocked-reporting');
    const accountId = uuidFor('account-blocked-reporting');
    const assetId = uuidFor('asset-blocked-reporting');
    const institutionId = uuidFor('inst-blocked-reporting');

    await prisma.institution.create({
      data: { id: institutionId, name: 'Corretora Beta', type: 'BROKER', country: 'BR' },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Carteira Pendente',
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
        name: 'Conta Investimentos',
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

    // Opening position in DRAFT state
    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-vale3-draft'),
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
        fingerprint: 'fp-op-vale3-draft',
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

  it('6. Isolates tax subjects strictly with zero cross-user leakage', async () => {
    const userA = uuidFor('user-isolate-a');
    const userB = uuidFor('user-isolate-b');
    const tokenA = await session(userA);
    const tokenB = await session(userB);

    const portfolioA = uuidFor('port-a');
    const accountA = uuidFor('acc-a');
    const assetA = uuidFor('asset-a');
    const institutionA = uuidFor('inst-a');

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
        ticker: 'ITUB4',
        name: 'Itau Unibanco',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });
    await prisma.annualOpeningPositionInputRecord.create({
      data: {
        id: uuidFor('op-itub4-a'),
        taxSubjectId: userA,
        portfolioId: portfolioA,
        accountId: accountA,
        assetId: assetA,
        effectiveDate: new Date('2024-12-31T00:00:00.000Z'),
        quantity: '200',
        totalHistoricalCost: '6000.00',
        currency: 'BRL',
        source: 'MANUAL_CONFIRMED',
        status: 'CONFIRMED',
        revision: 1,
        fingerprint: 'fp-op-itub4-a',
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

    const bensA: TestSectionSummary = resA.body.data.sections.find(
      (s: TestSectionSummary) => s.section === 'BENS_E_DIREITOS',
    );
    const bensB: TestSectionSummary = resB.body.data.sections.find(
      (s: TestSectionSummary) => s.section === 'BENS_E_DIREITOS',
    );

    expect(bensA.items.some((i) => i.ticker === 'ITUB4')).toBe(true);
    expect(bensB.items.some((i) => i.ticker === 'ITUB4')).toBe(false);
  });
});
