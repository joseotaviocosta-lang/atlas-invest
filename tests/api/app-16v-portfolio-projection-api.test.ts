import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  createAuthenticatedUserSession,
  getTestPrismaClient,
} from './setup';

describe('API Integration: APP-16V Portfolio Projection After Contribution', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;
  let accountId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;
  });

  it('POST /decision-brief/projection returns 200 with before/after state and zero DB mutations', async () => {
    const prisma = getTestPrismaClient();

    const initialTxCount = await prisma.transaction.count({ where: { portfolioId } });

    // Seed 2 active holdings
    const asset1 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const asset2 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'ITUB4',
        name: 'Itaú Unibanco PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset1.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '28.50',
        amount: '2850.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset2.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '35.00',
        amount: '3500.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/projection`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '2000.00', currency: 'BRL' })
      .expect(200);

    expect(res.body.data).toBeDefined();
    const proj = res.body.data;
    expect(proj.portfolioId).toBe(portfolioId);
    expect(proj.modelVersion).toBe('opportunity-v2.3.1');
    expect(proj.before).toBeDefined();
    expect(proj.after).toBeDefined();
    expect(proj.classProjection).toBeInstanceOf(Array);
    expect(proj.assetProjection).toBeInstanceOf(Array);
    expect(proj.concentration).toBeDefined();
    expect(proj.targetProgress).toBeDefined();

    // Verify exact money conservation: after == before + allocated
    expect(proj.after.investedAssetCents).toBe(
      proj.before.investedAssetCents + proj.allocatedCents,
    );
    expect(proj.allocatedCents + proj.unallocatedCents).toBe(proj.totalCents);

    // Verify ZERO side effects on database
    const finalTxCount = await prisma.transaction.count({ where: { portfolioId } });
    expect(finalTxCount).toBe(initialTxCount + 2); // only our 2 setup transactions exist
  });

  it('POST /decision-brief/project-scenarios returns 200 with 3 scenarios on a shared before baseline', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/project-scenarios`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '3000.00', currency: 'BRL' })
      .expect(200);

    expect(res.body.data).toBeDefined();
    const comp = res.body.data;
    expect(comp.portfolioId).toBe(portfolioId);
    expect(comp.scenarios).toBeInstanceOf(Array);
    expect(comp.scenarios.length).toBe(3);

    const scenarioIds = comp.scenarios.map((s: any) => s.scenarioId);
    expect(scenarioIds).toContain('CAUTIOUS');
    expect(scenarioIds).toContain('BALANCED');
    expect(scenarioIds).toContain('OPPORTUNITY_FOCUS');

    // Baseline before must be identical
    const cautious = comp.scenarios.find((s: any) => s.scenarioId === 'CAUTIOUS');
    const balanced = comp.scenarios.find((s: any) => s.scenarioId === 'BALANCED');
    expect(cautious.projection.before.investedAssetCents).toBe(
      balanced.projection.before.investedAssetCents,
    );
  });

  it('validates contribution amount and rejects negative or zero values with 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/projection`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '-500.00' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/projection`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '0' })
      .expect(400);
  });

  it('enforces anti-enumeration returning 404 for nonexistent portfolio', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${randomUUID()}/decision-brief/projection`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '1000.00' })
      .expect(404);
  });

  // APP-16V-R1: Test critical baseline separation (2 valued + 1 incomplete)
  it('APP-16V-R1: preserves complete active positions in projection when an asset lacks quote/valuation (2 valued + 1 unvalued)', async () => {
    const prisma = getTestPrismaClient();

    // Seed 2 valued assets and 1 unvalued asset
    const asset1 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const asset2 = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    const assetUnvalued = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'UNVALUED3',
        name: 'Unvalued Holding ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    // Transactions for all 3 assets
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset1.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        amount: '3000.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: asset2.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '60.00',
        amount: '6000.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        assetId: assetUnvalued.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        quantity: '50',
        unitPrice: '10.00',
        amount: '500.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    // Seed market quote records for asset1 and asset2 ONLY, leaving assetUnvalued without quote
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await prisma.marketQuoteRecord.create({
      data: {
        assetId: asset1.id,
        tradingDate: new Date(`${today}T00:00:00.000Z`),
        currency: 'BRL',
        close: '35.00',
        provider: 'BRAPI',
        providerSymbol: 'PETR4',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });

    await prisma.marketQuoteRecord.create({
      data: {
        assetId: asset2.id,
        tradingDate: new Date(`${today}T00:00:00.000Z`),
        currency: 'BRL',
        close: '70.00',
        provider: 'BRAPI',
        providerSymbol: 'VALE3',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/decision-brief/projection`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '2000.00', currency: 'BRL' })
      .expect(200);

    expect(res.body.data).toBeDefined();
    const proj = res.body.data;

    // Critical proof (Parte BA, BB, BC, BD, BE):
    // All 3 active holdings are accounted for in dataQuality
    expect(proj.dataQuality.totalAssets).toBe(3);
    expect(proj.dataQuality.valuedAssets).toBe(2);
    expect(proj.dataQuality.incompleteAssets).toBe(1);
    expect(proj.dataQuality.projectionComplete).toBe(false);
    expect(proj.dataQuality.weightBasis).toBe('VALUED_POSITIONS_ONLY');

    // Unvalued asset is present in assetProjection
    const unvaluedInProj = proj.assetProjection.find((a: any) => a.ticker === 'UNVALUED3');
    expect(unvaluedInProj).toBeDefined();
    expect(unvaluedInProj.beforeValue).toBeNull();
    expect(unvaluedInProj.projectionStatus).toBe('INCOMPLETE');

    // Warnings must contain partial valuation alert
    expect(
      proj.warnings.some((w: string) => w.includes('Valuation parcial') && w.includes('1 de 3')),
    ).toBe(true);
  });
});
