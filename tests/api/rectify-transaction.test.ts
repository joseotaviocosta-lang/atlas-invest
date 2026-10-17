import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: Atomic & Idempotent Transaction Rectification (Hotfix 02)', () => {
  let app: INestApplication;
  let portfolioId: string;
  let accountId: string;
  let assetId: string;
  let _userId: string;
  let authToken: string;
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
    _userId = fixtures.userId;

    const session = await createAuthenticatedUserSession(fixtures.userId);
    authToken = session.token;

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

  // Helper to append a transaction
  async function createTx(payload: Record<string, unknown>, token = authToken, pId = portfolioId) {
    return request(app.getHttpServer())
      .post(`/api/v1/portfolios/${pId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  // Helper to rectify
  async function rectifyTx(
    txId: string,
    payload: Record<string, unknown>,
    token = authToken,
    pId = portfolioId,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/portfolios/${pId}/transactions/${txId}/rectify`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  describe('Section 11: Failure Injection & Atomic Rollback', () => {
    it('rolls back entirely if failure is injected between compensation and replacement persistence', async () => {
      // 1. Create a BUY transaction to rectify
      const buyRes = await createTx({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00',
      });
      expect(buyRes.status).toBe(201);
      const originalTxId = buyRes.body.data.id;

      // 2. Count transactions in DB initially
      const initialCount = await prisma.transaction.count({
        where: { portfolioId },
      });
      expect(initialCount).toBe(1);

      // 3. Temporarily override prisma.$transaction to inject failure during second insert
      type TransactionFn = (tx: unknown) => Promise<unknown>;
      const originalTxFn = prisma.$transaction.bind(prisma);
      prisma.$transaction = (async (arg: unknown) => {
        if (typeof arg === 'function') {
          const fn = arg as TransactionFn;
          return originalTxFn(async (txClient: unknown) => {
            let callCount = 0;
            const client = txClient as {
              transaction: {
                create: (args: unknown) => Promise<unknown>;
              };
            };
            const realCreate = client.transaction.create.bind(client.transaction);
            client.transaction.create = async (args: unknown) => {
              callCount++;
              if (callCount === 2) {
                throw new Error('INJECTED_DATABASE_FAILURE_ON_REPLACEMENT_INSERT');
              }
              return realCreate(args);
            };
            return fn(client);
          });
        }
        return originalTxFn(arg as never);
      }) as unknown as typeof prisma.$transaction;

      try {
        const rectifyRes = await rectifyTx(originalTxId, {
          mode: 'RECTIFY',
          reason: 'Ajuste de teste com falha injetada',
          idempotencyKey: 'fail-inject-key-01',
          replacement: {
            type: 'BUY',
            quantity: '12',
            unitPrice: '30.00',
            tradeDate: '2026-10-15',
          },
        });

        // The request must fail due to injected failure
        expect(rectifyRes.status).toBe(500);

        // 4. Verify DB atomicity: rollback must leave NO compensation and NO replacement
        const finalTxs = await prisma.transaction.findMany({
          where: { portfolioId },
        });

        expect(finalTxs.length).toBe(1);
        expect(finalTxs[0]!.id).toBe(originalTxId);
        expect(finalTxs[0]!.notes ?? '').not.toContain('[COMPENSAÇÃO');
        expect(finalTxs[0]!.notes ?? '').not.toContain('[CORREÇÃO');
      } finally {
        prisma.$transaction = originalTxFn;
      }
    });
  });

  describe('Section 5: Idempotency Verification', () => {
    it('returns deterministic result without duplicate compensation or replacement on retry', async () => {
      // 1. Create original SELL
      const sellRes = await createTx({
        accountId,
        assetId,
        type: 'SELL',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '5',
        unitPrice: '45.00',
        fees: '0.00',
      });
      expect(sellRes.status).toBe(201);
      const originalTxId = sellRes.body.data.id;

      const idempotencyKey = 'idemp-test-vale3-01';
      const rectifyPayload = {
        mode: 'RECTIFY',
        reason: 'Erro de quantidade',
        idempotencyKey,
        replacement: {
          type: 'SELL',
          quantity: '3',
          unitPrice: '45.00',
          tradeDate: '2026-10-15',
          fees: '0.00',
          notes: 'Substituição corrigida',
        },
      };

      // 2. First attempt
      const res1 = await rectifyTx(originalTxId, rectifyPayload);
      expect(res1.status).toBe(200);
      expect(res1.body.data.isIdempotentReplay).toBe(false);
      expect(res1.body.data.compensatingTransaction).toBeDefined();
      expect(res1.body.data.replacementTransaction).toBeDefined();
      const compId = res1.body.data.compensatingTransaction.id;
      const repId = res1.body.data.replacementTransaction.id;

      // 3. Second attempt with exact same idempotency key
      const res2 = await rectifyTx(originalTxId, rectifyPayload);
      expect(res2.status).toBe(200);
      expect(res2.body.data.isIdempotentReplay).toBe(true);
      expect(res2.body.data.compensatingTransaction.id).toBe(compId);
      expect(res2.body.data.replacementTransaction.id).toBe(repId);

      // 4. Verify DB has exactly 3 records: original, 1 compensation, 1 replacement
      const allTxs = await prisma.transaction.findMany({
        where: { portfolioId },
      });
      expect(allTxs.length).toBe(3);

      const compensations = allTxs.filter((t) => t.notes?.includes('[COMPENSAÇÃO'));
      const replacements = allTxs.filter((t) => t.notes?.includes('[CORREÇÃO'));
      expect(compensations.length).toBe(1);
      expect(replacements.length).toBe(1);
    });
  });

  describe('Section 12: Required Correction Fixture (VALE3 Replay & Fiscal Derived State)', () => {
    it('executes BUY 20 VALE3 @30, SELL 5 @45, then rectifies SELL to 3 @45 -> derived custody 17', async () => {
      // Step A: BUY 20 VALE3 @30
      const buyRes = await createTx({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '20',
        unitPrice: '30.00',
        fees: '0.00',
      });
      expect(buyRes.status).toBe(201);

      // Step B: SELL 5 VALE3 @45
      const sellRes = await createTx({
        accountId,
        assetId,
        type: 'SELL',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '5',
        unitPrice: '45.00',
        fees: '0.00',
      });
      expect(sellRes.status).toBe(201);
      const originalSellId = sellRes.body.data.id;

      // Check interim custody: 20 - 5 = 15
      const state1 = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(state1.status).toBe(200);
      expect(state1.body.data.positions[0].quantity).toBe('15');

      // Step C: Rectify SELL 5 @45 -> SELL 3 @45
      const rectifyRes = await rectifyTx(originalSellId, {
        mode: 'RECTIFY',
        reason: 'Correção de quantidade vendida de 5 para 3',
        idempotencyKey: 'fixture-vale3-rectify',
        replacement: {
          type: 'SELL',
          quantity: '3',
          unitPrice: '45.00',
          tradeDate: '2026-10-15',
          fees: '0.00',
        },
      });
      expect(rectifyRes.status).toBe(200);

      // Verify returned data
      expect(rectifyRes.body.data.compensatingTransaction.type).toBe('BUY');
      expect(rectifyRes.body.data.compensatingTransaction.quantity).toBe('5');
      expect(rectifyRes.body.data.replacementTransaction.type).toBe('SELL');
      expect(rectifyRes.body.data.replacementTransaction.quantity).toBe('3');

      // Step D: Verify derived portfolio state after rectification
      // 20 - 5 + 5 - 3 = 17
      const stateAfter = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(stateAfter.status).toBe(200);
      expect(stateAfter.body.data.positions.length).toBe(1);
      expect(stateAfter.body.data.positions[0].quantity).toBe('17');
      expect(stateAfter.body.data.positions[0].assetId).toBe(assetId);

      // Step E: Verify historical state replay across timeline (before vs after tradeDate)
      const statePrior = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state?asOf=2026-10-14`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(statePrior.status).toBe(200);
      expect(statePrior.body.data.positions.length).toBe(0);

      // Step F: Verify ledger append-only audit in DB
      // Exactly 4 transactions in DB: BUY 20, original SELL 5, compensating BUY 5, replacement SELL 3
      const dbTxs = await prisma.transaction.findMany({
        where: { portfolioId },
        orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
      });
      expect(dbTxs.length).toBe(4);
      const originalInDb = dbTxs.find((t) => t.id === originalSellId);
      expect(originalInDb).toBeDefined();
      expect(originalInDb!.quantity.toString()).toBe('5');
      expect(originalInDb!.type).toBe('SELL');
    });
  });

  describe('Section 14: Ownership & Anti-Enumeration Security', () => {
    it('returns 404 and makes zero modifications when User B attempts to rectify User A transaction', async () => {
      // 1. User A creates transaction
      const buyRes = await createTx({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '10',
        unitPrice: '30.00',
      });
      expect(buyRes.status).toBe(201);
      const userATxId = buyRes.body.data.id;

      // 2. Create User B with their own portfolio and session
      const userBId = '88888888-8888-4888-8888-888888888888';
      await prisma.user.create({
        data: {
          id: userBId,
          email: 'userb@test.com',
          name: 'User B',
          passwordHash: 'dummy-hash-user-b',
          baseCurrency: 'BRL',
        },
      });
      const userBPortfolio = await prisma.portfolio.create({
        data: {
          userId: userBId,
          name: 'User B Portfolio',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });
      const userBSession = await createAuthenticatedUserSession(userBId);
      const userBToken = userBSession.token;

      // 3. User B attempts to rectify User A's transaction using User A's portfolio ID
      const attack1 = await rectifyTx(
        userATxId,
        {
          mode: 'RECTIFY',
          reason: 'Ataque cross-user',
          replacement: {
            type: 'BUY',
            quantity: '999',
            unitPrice: '1.00',
            tradeDate: '2026-10-15',
          },
        },
        userBToken,
        portfolioId, // User A's portfolio
      );
      expect(attack1.status).toBe(404);

      // 4. User B attempts to rectify User A's transaction inside User B's portfolio ID
      const attack2 = await rectifyTx(
        userATxId,
        {
          mode: 'RECTIFY',
          reason: 'Ataque cross-user via target portfolio',
          replacement: {
            type: 'BUY',
            quantity: '999',
            unitPrice: '1.00',
            tradeDate: '2026-10-15',
          },
        },
        userBToken,
        userBPortfolio.id,
      );
      expect(attack2.status).toBe(404);

      // 5. Verify User A's portfolio remains completely untouched (1 original tx)
      const userATxs = await prisma.transaction.findMany({
        where: { portfolioId },
      });
      expect(userATxs.length).toBe(1);
      expect(userATxs[0]!.id).toBe(userATxId);

      // 6. Verify User B has zero transactions
      const userBTxs = await prisma.transaction.findMany({
        where: { portfolioId: userBPortfolio.id },
      });
      expect(userBTxs.length).toBe(0);
    });
  });

  describe('Section 7 & 9: Eligibility & Cancel Mode', () => {
    it('supports CANCEL mode to estornar transaction without creating replacement', async () => {
      const buyRes = await createTx({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '10',
        unitPrice: '20.00',
      });
      expect(buyRes.status).toBe(201);
      const txId = buyRes.body.data.id;

      const cancelRes = await rectifyTx(txId, {
        mode: 'CANCEL',
        reason: 'Cancelamento total por duplicidade',
      });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.mode).toBe('CANCEL');
      expect(cancelRes.body.data.compensatingTransaction).toBeDefined();
      expect(cancelRes.body.data.replacementTransaction).toBeNull();

      // Derived custody should now be 0 (10 BUY - 10 SELL compensation)
      const state = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(state.status).toBe(200);
      expect(state.body.data.positions.length).toBe(0);
    });

    it('rejects rectifying an already compensated transaction when attempted with a new key', async () => {
      const buyRes = await createTx({
        accountId,
        assetId,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-10-15',
        quantity: '10',
        unitPrice: '20.00',
      });
      const txId = buyRes.body.data.id;

      // First cancel succeeds
      await rectifyTx(txId, {
        mode: 'CANCEL',
        reason: 'Primeiro cancelamento',
      });

      // Second attempt with different key / reason must be rejected
      const secondAttempt = await rectifyTx(txId, {
        mode: 'CANCEL',
        reason: 'Tentativa de segundo cancelamento',
        idempotencyKey: 'different-key-99',
      });
      expect(secondAttempt.status).toBe(400);
    });
  });
});
