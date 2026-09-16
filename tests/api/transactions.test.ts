import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
} from './setup';

describe('API Integration: Append-Only Transaction Ledger', () => {
  let app: INestApplication;
  let portfolioId: string;
  let accountId: string;
  let assetId: string;
  const prisma = getTestPrismaClient();

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

    const asset = await prisma.asset.create({
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });
    assetId = asset.id;
  });

  describe('Ledger Append & Precision Invariants', () => {
    it('should append a BUY transaction with high decimal precision strings', async () => {
      const precisionQuantity = '123456789.12345678';
      const precisionUnitPrice = '56.789012';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          assetId,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2026-03-10',
          quantity: precisionQuantity,
          unitPrice: precisionUnitPrice,
          fees: '12.34',
          taxes: '0.00',
          notes: 'Compra fracionária de precisão',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.quantity).toBe(precisionQuantity);
      expect(res.body.data.unitPrice.amount).toBe(precisionUnitPrice);
      expect(res.body.data.type).toBe('BUY');
    });

    it('should reject transactions with numeric float inputs (must be decimal string)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          assetId,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2026-03-10',
          quantity: 100, // Number instead of string
          unitPrice: 35.5, // Float instead of string
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
      expect(res.body.details).toBeDefined();
    });

    it('should reject invalid calendar dates such as 2026-02-30', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          assetId,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2026-02-30', // February 30 does not exist
          quantity: '100',
          unitPrice: '35.50',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    });

    it('should reject cross-portfolio violation with 409 Conflict', async () => {
      // Create a second portfolio with its own account
      const otherPortfolio = await prisma.portfolio.create({
        data: {
          id: '66666666-6666-4666-8666-666666666666',
          userId: '11111111-1111-4111-8111-111111111111',
          name: 'Segunda Carteira',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });

      const otherAccount = await prisma.account.create({
        data: {
          id: '77777777-7777-4777-8777-777777777777',
          portfolioId: otherPortfolio.id,
          institutionId: '22222222-2222-4222-8222-222222222222',
          name: 'Conta na Outra Carteira',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });

      // Attempt to post transaction to portfolioId using otherAccount.id
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId: otherAccount.id,
          assetId,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2026-03-10',
          quantity: '10',
          unitPrice: '50.00',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.code).toBe('PORTFOLIO.CROSS_PORTFOLIO_VIOLATION');
    });

    it('should reject duplicate external transaction with 409 Conflict', async () => {
      const payload = {
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-03-10',
        quantity: '10',
        unitPrice: '50.00',
        provider: 'B3',
        externalId: 'NEG-2026-99999',
      };

      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send(payload);
      expect(firstRes.status).toBe(201);

      const duplicateRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send(payload);

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error).toBe('Conflict');
      expect(duplicateRes.body.code).toBe('TRANSACTION.DUPLICATE_EXTERNAL_ID');
    });

    it('should enforce append-only ledger: PUT, PATCH, and DELETE are strictly disallowed', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          assetId,
          type: 'BUY',
          currency: 'BRL',
          tradeDate: '2026-03-10',
          quantity: '10',
          unitPrice: '50.00',
        });
      const txId = createRes.body.data.id;

      const putRes = await request(app.getHttpServer()).put(
        `/api/v1/transactions/${txId}`,
      );
      expect(putRes.status).toBe(404);

      const patchRes = await request(app.getHttpServer()).patch(
        `/api/v1/transactions/${txId}`,
      );
      expect(patchRes.status).toBe(404);

      const deleteRes = await request(app.getHttpServer()).delete(
        `/api/v1/transactions/${txId}`,
      );
      expect(deleteRes.status).toBe(404);
    });
  });

  describe('Ledger Ordering & Cursor Pagination', () => {
    it('should return transactions sorted deterministically by tradeDate ASC, createdAt ASC, id ASC', async () => {
      // Insert transactions chronologically out of order
      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          type: 'DEPOSIT',
          currency: 'BRL',
          tradeDate: '2026-03-01',
          amount: '300.00',
        });

      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          type: 'DEPOSIT',
          currency: 'BRL',
          tradeDate: '2026-01-01',
          amount: '100.00',
        });

      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .send({
          accountId,
          type: 'DEPOSIT',
          currency: 'BRL',
          tradeDate: '2026-02-01',
          amount: '200.00',
        });

      const res = await request(app.getHttpServer()).get(
        `/api/v1/portfolios/${portfolioId}/transactions`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].tradeDate).toBe('2026-01-01');
      expect(res.body.data[1].tradeDate).toBe('2026-02-01');
      expect(res.body.data[2].tradeDate).toBe('2026-03-01');
    });

    it('should paginate correctly using limit and cursor', async () => {
      for (let i = 1; i <= 5; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/portfolios/${portfolioId}/transactions`)
          .send({
            accountId,
            type: 'DEPOSIT',
            currency: 'BRL',
            tradeDate: `2026-01-0${i}`,
            amount: `${i * 100}.00`,
          });
      }

      // Page 1: limit 2
      const page1 = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/transactions`)
        .query({ limit: 2 });

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(2);
      expect(page1.body.meta.hasMore).toBe(true);
      expect(page1.body.meta.nextCursor).toBeDefined();

      const nextCursor = page1.body.meta.nextCursor;

      // Page 2: limit 2, cursor from page 1
      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/transactions`)
        .query({ limit: 2, cursor: nextCursor });

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBe(2);
      expect(page2.body.data[0].tradeDate).toBe('2026-01-03');
      expect(page2.body.data[1].tradeDate).toBe('2026-01-04');
      expect(page2.body.meta.hasMore).toBe(true);
    });
  });
});
