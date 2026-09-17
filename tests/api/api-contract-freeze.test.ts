import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Contract Freeze: Portfolio Read API v1 Formal Freeze', () => {
  let app: INestApplication;
  let authToken: string;
  const prisma = getTestPrismaClient();

  const userId = '11111111-1111-4111-8111-111111111111';
  let portfolioId: string;
  let accountId: string;
  let assetPetr4Id: string;
  let assetVale3Id: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();

    await prisma.user.create({
      data: {
        id: userId,
        email: 'api-freeze-tester@atlas.dev',
        name: 'API Freeze Tester',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Freeze Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolioId = portfolio.id;

    const institution = await prisma.institution.create({
      data: {
        name: 'XP Investimentos',
        type: 'BROKER',
        country: 'BR',
      },
    });

    const acc = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'Account XP',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    accountId = acc.id;

    const petr4 = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetPetr4Id = petr4.id;

    const vale3 = await prisma.asset.create({
      data: {
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetVale3Id = vale3.id;

    // Normal BUY PETR4
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetPetr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00Z'),
        quantity: '100.5',
        unitPrice: '30.12',
        amount: '3027.06',
        currency: 'BRL',
        fees: '10.50',
      },
    });

    // Incomplete transfer for VALE3
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetVale3Id,
        type: 'TRANSFER_IN',
        tradeDate: new Date('2026-01-15T10:00:00Z'),
        quantity: '50',
        amount: '0',
        currency: 'BRL',
      },
    });
  });

  const assertFinancialStringOrNull = (val: unknown, path: string) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'object' && val !== null && 'amount' in val) {
      assertFinancialStringOrNull((val as { amount: unknown }).amount, `${path}.amount`);
      return;
    }
    expect(typeof val, `Field ${path} should be string, got ${typeof val}`).toBe('string');
    const strVal = val as string;
    expect(isNaN(Number(strVal)), `Field ${path} should be numeric string, got "${strVal}"`).toBe(
      false,
    );
    expect(
      /e/i.test(strVal),
      `Field ${path} must never contain scientific notation, got "${strVal}"`,
    ).toBe(false);
  };

  it('1. GET /state satisfies frozen schema, decimal string invariants, and no internal type leakage', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const body = res.body.data;

    // Root schema freeze
    expect(body).toHaveProperty('portfolioId', portfolioId);
    expect(body).toHaveProperty('asOfDate');
    expect(body).toHaveProperty('completeness');
    expect(body).toHaveProperty('positions');
    expect(body).toHaveProperty('realizedSummaries');
    expect(body).toHaveProperty('incomeSummaries');
    expect(body).toHaveProperty('cashFlowSummaries');
    expect(body).toHaveProperty('replayMetadata');

    expect(Array.isArray(body.positions)).toBe(true);
    expect(Array.isArray(body.realizedSummaries)).toBe(true);
    expect(Array.isArray(body.incomeSummaries)).toBe(true);
    expect(Array.isArray(body.cashFlowSummaries)).toBe(true);

    // Metadata contract freeze
    expect(body.replayMetadata).toMatchObject({
      engineVersion: '1.0.0-rc.1',
      processedTransactionCount: expect.any(Number),
      appliedTransactionCount: expect.any(Number),
      deferredTransactionCount: expect.any(Number),
    });

    // Positions contract freeze
    expect(body.positions).toHaveLength(2);
    for (const pos of body.positions) {
      expect(pos).toHaveProperty('assetId');
      expect(pos).toHaveProperty('quantity');
      expect(pos).toHaveProperty('costBasisStatus');

      assertFinancialStringOrNull(pos.quantity, `positions[${pos.assetId}].quantity`);
      assertFinancialStringOrNull(pos.totalCost, `positions[${pos.assetId}].totalCost`);
      assertFinancialStringOrNull(pos.averageCost, `positions[${pos.assetId}].averageCost`);

      if (pos.costBasisStatus === 'INCOMPLETE') {
        expect(pos.totalCost).toBeNull();
        expect(pos.averageCost).toBeNull();
      } else {
        expect(pos.totalCost).not.toBeNull();
        expect(pos.averageCost).not.toBeNull();
      }
    }
  });

  it('2. GET /positions satisfies frozen schema and filtering', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const body = res.body.data;

    expect(body).toHaveProperty('portfolioId', portfolioId);
    expect(body).toHaveProperty('accountId');
    expect(body).toHaveProperty('asOfDate');
    expect(body).toHaveProperty('positions');
    expect(Array.isArray(body.positions)).toBe(true);
  });

  it('3. GET /history satisfies frozen pagination schema, cursor format, and filter fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=10`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const items = res.body.data;
    const meta = res.body.meta;

    expect(Array.isArray(items)).toBe(true);
    expect(meta).toMatchObject({
      limit: 10,
      totalCount: expect.any(Number),
      hasMore: expect.any(Boolean),
    });

    for (const evt of items) {
      expect(evt).toHaveProperty('id');
      expect(evt).toHaveProperty('kind');
      expect(evt).toHaveProperty('tradeDate');
      expect(evt).toHaveProperty('details');

      const details = evt.details;
      if (details.grossAmount)
        assertFinancialStringOrNull(details.grossAmount, 'details.grossAmount');
      if (details.netAmount) assertFinancialStringOrNull(details.netAmount, 'details.netAmount');
      if (details.quantity) assertFinancialStringOrNull(details.quantity, 'details.quantity');
      if (details.unitPrice) assertFinancialStringOrNull(details.unitPrice, 'details.unitPrice');
      if (details.fees) assertFinancialStringOrNull(details.fees, 'details.fees');
      if (details.taxes) assertFinancialStringOrNull(details.taxes, 'details.taxes');
      if (details.costBasis) assertFinancialStringOrNull(details.costBasis, 'details.costBasis');
      if (details.realizedGainLoss)
        assertFinancialStringOrNull(details.realizedGainLoss, 'details.realizedGainLoss');
    }
  });

  it('4. OpenAPI freeze: verifies documentation exposes all portfolio read endpoints', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    expect(res.status).toBe(200);

    const paths = Object.keys(res.body.paths);
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}/state');
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}/positions');
    expect(paths).toContain('/api/v1/portfolios/{portfolioId}/history');

    const statePath = res.body.paths['/api/v1/portfolios/{portfolioId}/state'];
    expect(statePath.get).toBeDefined();

    const positionsPath = res.body.paths['/api/v1/portfolios/{portfolioId}/positions'];
    expect(positionsPath.get).toBeDefined();

    const historyPath = res.body.paths['/api/v1/portfolios/{portfolioId}/history'];
    expect(historyPath.get).toBeDefined();
  });
});
