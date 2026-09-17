import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: Large Ledger Read Model Payload Boundedness & Scaling', () => {
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
    await cleanDatabase();

    await prisma.user.create({
      data: {
        id: userId,
        email: 'large-ledger-tester@atlas.dev',
        name: 'Large Ledger Tester',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Large Ledger Portfolio',
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

    // Seed 300 transactions (batch inserted)
    const txRows = [];
    // Deposit
    txRows.push({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      tradeDate: new Date('2020-01-01T10:00:00Z'),
      amount: '5000000.00',
      currency: 'BRL',
    });

    // 249 buy transactions alternating between PETR4 and VALE3
    for (let i = 1; i <= 249; i++) {
      const assetId = i % 2 === 0 ? assetPetr4Id : assetVale3Id;
      const date = new Date(Date.UTC(2020, 0, 1 + i, 10, 0, 0));
      txRows.push({
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: date,
        quantity: '10',
        unitPrice: '25.00',
        amount: '250.00',
        currency: 'BRL',
      });
    }

    // 50 dividend income transactions
    for (let i = 250; i <= 299; i++) {
      const assetId = i % 2 === 0 ? assetPetr4Id : assetVale3Id;
      const date = new Date(Date.UTC(2020, 0, 1 + i, 10, 0, 0));
      txRows.push({
        portfolioId,
        accountId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: date,
        amount: '15.00',
        currency: 'BRL',
      });
    }

    await prisma.transaction.createMany({
      data: txRows,
    });
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('1. GET /state payload size is bounded by active positions count (O(positions)), not ledger size (O(txs))', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Ledger processed 300 transactions
    expect(data.replayMetadata.processedTransactionCount).toBe(300);

    // But derived positions are strictly bounded by active assets (exactly 2 positions!)
    expect(data.positions).toHaveLength(2);

    // Total payload string size is small (< 5KB), not proportional to 300 transactions
    const jsonString = JSON.stringify(res.body);
    expect(jsonString.length).toBeLessThan(5000);
  });

  it('2. GET /positions returns strictly the 2 active positions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.positions).toHaveLength(2);
  });

  it('3. GET /history pagination keeps history response bounded by limit query parameter', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=15`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(15);
    expect(res.body.meta.limit).toBe(15);
    expect(res.body.meta.hasMore).toBe(true);
    expect(res.body.meta.nextCursor).toBeDefined();
  });
});
