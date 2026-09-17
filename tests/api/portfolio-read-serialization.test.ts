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

describe('API Serialization: Financial Decimals as Strings, Null Cost Basis, Clean JSON', () => {
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
        email: 'portfolio-serial-tester@atlas.dev',
        name: 'Portfolio Serialization Tester',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Test Portfolio',
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
        name: 'Account 1',
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
        settlementDate: new Date('2026-01-12T10:00:00Z'),
        quantity: '100.55',
        unitPrice: '30.1234',
        amount: '3028.90803',
        currency: 'BRL',
        fees: '10.50',
      },
    });

    // Incomplete transfer for VALE3 (incoming transfer without cost basis)
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: assetVale3Id,
        type: 'TRANSFER_IN',
        tradeDate: new Date('2026-01-15T10:00:00Z'),
        settlementDate: new Date('2026-01-15T10:00:00Z'),
        quantity: '50',
        amount: '0',
        currency: 'BRL',
      },
    });
  });

  const assertFinancialStringOrNull = (val: unknown, path: string) => {
    if (val === null) return;
    if (typeof val === 'string') {
      expect(!isNaN(Number(val)), `Expected numeric string at ${path}, got "${val}"`).toBe(true);
      return;
    }
    throw new Error(
      `Financial field at ${path} must be string or null, but got ${typeof val} (${val})`,
    );
  };

  it('verifies GET /state serializes all financial values as strings or null, never IEEE-754 floats', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const data = res.body.data;

    // Cash flow summary
    if (data.cashFlowSummaries.length > 0) {
      for (const cf of data.cashFlowSummaries) {
        assertFinancialStringOrNull(cf.totalInflows.amount, 'cf.totalInflows.amount');
        assertFinancialStringOrNull(cf.totalOutflows.amount, 'cf.totalOutflows.amount');
        assertFinancialStringOrNull(cf.netExternalFlow.amount, 'cf.netExternalFlow.amount');
      }
    }

    // Realized summary
    if (data.realizedSummaries.length > 0) {
      for (const rs of data.realizedSummaries) {
        assertFinancialStringOrNull(rs.grossProceeds.amount, 'rs.grossProceeds.amount');
        assertFinancialStringOrNull(rs.netProceeds.amount, 'rs.netProceeds.amount');
        if (rs.realizedGainLoss) {
          assertFinancialStringOrNull(rs.realizedGainLoss.amount, 'rs.realizedGainLoss.amount');
        }
      }
    }

    // Positions in state
    expect(data.positions).toHaveLength(2);

    const petr4Pos = data.positions.find((p: { assetId: string }) => p.assetId === assetPetr4Id);
    expect(petr4Pos).toBeDefined();
    expect(petr4Pos.costBasisStatus).toBe('KNOWN');
    assertFinancialStringOrNull(petr4Pos.quantity, 'petr4Pos.quantity');
    assertFinancialStringOrNull(petr4Pos.totalCost.amount, 'petr4Pos.totalCost.amount');
    assertFinancialStringOrNull(petr4Pos.averageCost.amount, 'petr4Pos.averageCost.amount');
    expect(typeof petr4Pos.quantity).toBe('string');
    expect(typeof petr4Pos.totalCost.amount).toBe('string');
    expect(typeof petr4Pos.averageCost.amount).toBe('string');

    // VALE3 has INCOMPLETE cost basis -> must be null, not 0
    const vale3Pos = data.positions.find((p: { assetId: string }) => p.assetId === assetVale3Id);
    expect(vale3Pos).toBeDefined();
    expect(vale3Pos.costBasisStatus).toBe('INCOMPLETE');
    expect(vale3Pos.totalCost).toBeNull();
    expect(vale3Pos.averageCost).toBeNull();
    assertFinancialStringOrNull(vale3Pos.quantity, 'vale3Pos.quantity');
  });

  it('verifies GET /positions serializes positions with null costBasis on INCOMPLETE status', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const positions = res.body.data.positions;
    expect(positions).toHaveLength(2);

    const vale3 = positions.find((p: { assetId: string }) => p.assetId === assetVale3Id);
    expect(vale3).toBeDefined();
    expect(vale3.costBasisStatus).toBe('INCOMPLETE');
    expect(vale3.totalCost).toBeNull();
    expect(vale3.averageCost).toBeNull();
    expect(vale3.quantity).toBe('50');
  });

  it('verifies GET /history serializes all financial values as strings and meta counts as integers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const items = res.body.data;
    const meta = res.body.meta;
    expect(typeof meta.totalCount).toBe('number');
    expect(typeof meta.limit).toBe('number');

    for (const item of items) {
      if (item.details?.quantity !== undefined) {
        assertFinancialStringOrNull(item.details.quantity, 'item.details.quantity');
      }
      if (item.details?.amount?.amount !== undefined) {
        assertFinancialStringOrNull(item.details.amount.amount, 'item.details.amount.amount');
      }
    }
  });
});
