import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5S-C — append-only transaction rectification workflow.
 *
 * Originals are never updated or deleted: a compensating reversal plus
 * an optional replacement are committed atomically with an audit link.
 * Chains resolve to the terminal replacement; conflicts return 409
 * with the effective id; identical replacements are rejected.
 */
describe('API Integration: transaction rectification workflow (Phase 5S-C)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  const prisma = getTestPrismaClient();

  function rectifyUrl(txId: string): string {
    return `/api/v1/portfolios/${portfolioId}/transactions/${txId}/rectify`;
  }

  function detailUrl(txId: string): string {
    return `/api/v1/transactions/${txId}`;
  }

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
    const session = await createAuthenticatedUserSession(fixtures.userId);
    authToken = session.token;
  });

  let tickerSeq = 0;
  async function createAsset(): Promise<ReturnType<typeof Asset.create>> {
    tickerSeq += 1;
    const asset = Asset.create({
      ticker: `P5C${tickerSeq}`,
      name: `P5C ${tickerSeq} S.A.`,
      type: 'STOCK' as never,
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });
    return asset;
  }

  async function buy(assetId: string, quantity = '100', unitPrice = '30.00', externalId?: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity,
        unitPrice,
        totalAmount: (Number(quantity) * Number(unitPrice)).toFixed(2),
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'TEST',
        externalId: externalId ?? `tx-5sc-${randomUUID()}`,
      });
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  it('requires a reason and rejects identical replacements', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id);

    const noReason = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        idempotencyKey: `k-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '100', unitPrice: '30.00', tradeDate: '2026-03-01' },
      });
    expect(noReason.status).toBe(400);

    const identical = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Tentativa sem alteracao real',
        idempotencyKey: `k-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '100', unitPrice: '30.00', tradeDate: '2026-03-01' },
      });
    expect(identical.status).toBe(400);
    expect(JSON.stringify(identical.body)).toMatch(/identical/i);

    // Rejects unknown fields (strict DTO).
    const extra = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'x',
        hacker: true,
        replacement: { type: 'BUY', quantity: '1', unitPrice: '1.00', tradeDate: '2026-03-01' },
      });
    expect(extra.status).toBe(400);
  });

  it('creates compensating + replacement + link atomically with audit', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id);
    const beforeCount = await prisma.transaction.count({ where: { portfolioId } });

    const res = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Quantidade correta e 60',
        idempotencyKey: `k-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '60', unitPrice: '30.00', tradeDate: '2026-03-02' },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.originalTransactionId).toBe(tx.id);
    expect(res.body.data.compensatingTransaction.type).toBe('SELL');
    expect(res.body.data.compensatingTransaction.quantity).toBe('100');
    expect(res.body.data.replacementTransaction.quantity).toBe('60');
    expect(res.body.data.rectificationId).toBeDefined();
    expect(res.body.data.effectiveTransactionId).toBe(res.body.data.replacementTransaction.id);

    const rows = await prisma.transaction.findMany({
      where: { portfolioId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(beforeCount + 2);

    // Rejected second attempt: 409 with the effective id, nothing written.
    const retry = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Segunda tentativa',
        idempotencyKey: `other-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '10', unitPrice: '30.00', tradeDate: '2026-03-02' },
      });
    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe('TRANSACTION.ALREADY_RECTIFIED');
    expect(retry.body.details?.effectiveTransactionId).toBe(
      res.body.data.replacementTransaction.id,
    );
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(beforeCount + 2);
  });

  it('resolves chains A→B→C to the terminal replacement', async () => {
    const asset = await createAsset();
    const a = await buy(asset.id, '100', '30.00');
    const r1 = await request(app.getHttpServer())
      .post(rectifyUrl(a.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Corrige quantidade para 60',
        idempotencyKey: `k1-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '60', unitPrice: '30.00', tradeDate: '2026-03-02' },
      });
    expect(r1.status).toBe(200);
    const bId = r1.body.data.replacementTransaction.id as string;

    // Rectifying the replacement creates a chained link B → C.
    const r2 = await request(app.getHttpServer())
      .post(rectifyUrl(bId))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Corrige preco para 31',
        idempotencyKey: `k2-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '60', unitPrice: '31.00', tradeDate: '2026-03-02' },
      });
    expect(r2.status).toBe(200);
    const cId = r2.body.data.replacementTransaction.id as string;

    // Chain head resolves through to C.
    const again = await request(app.getHttpServer())
      .post(rectifyUrl(a.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'CANCEL', reason: 'x', idempotencyKey: `k3-${randomUUID()}` });
    expect(again.status).toBe(409);
    expect(again.body.details?.effectiveTransactionId).toBe(cId);

    // Detail exposes the full chain with audit.
    const detail = await request(app.getHttpServer())
      .get(detailUrl(a.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.rectification.status).toBe('SUPERSEDED');
    expect(detail.body.data.rectification.effectiveTransactionId).toBe(cId);
    expect(
      detail.body.data.rectification.chain.map(
        (row: { transactionId: string }) => row.transactionId,
      ),
    ).toEqual(expect.arrayContaining([a.id, bId, cId]));

    const untouched = await request(app.getHttpServer())
      .get(detailUrl(cId))
      .set('Authorization', `Bearer ${authToken}`);
    expect(untouched.body.data.rectification.status).toBe('CORRECTION');
  });

  it('marks suppressed and corrected rows in the ledger list', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id);
    const res = await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Ajuste de quantidade',
        idempotencyKey: `k-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '55', unitPrice: '30.00', tradeDate: '2026-03-02' },
      });
    const replacementId = res.body.data.replacementTransaction.id as string;

    const list = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/transactions?limit=100`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(list.status).toBe(200);
    const byId = new Map(list.body.data.map((row: { id: string }) => [row.id, row]));
    expect(byId.get(tx.id)?.rectification?.status).toBe('SUPERSEDED');
    expect(byId.get(tx.id)?.rectification?.replacementTransactionId).toBe(replacementId);
    expect(byId.get(replacementId)?.rectification?.status).toBe('CORRECTION');
  });

  it('applies only the terminal replacement in portfolio state (no double count)', async () => {
    const asset = await createAsset();
    const tx = await buy(asset.id, '100', '30.00');
    await request(app.getHttpServer())
      .post(rectifyUrl(tx.id))
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'RECTIFY',
        reason: 'Corrige quantidade para 60',
        idempotencyKey: `k-${randomUUID()}`,
        replacement: { type: 'BUY', quantity: '60', unitPrice: '30.00', tradeDate: '2026-03-02' },
      });

    const state = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(state.status).toBe(200);
    const position = state.body.data.positions.find(
      (p: { assetId: string }) => p.assetId === asset.id,
    );
    // 100 BUY - 100 SELL (compensation) + 60 BUY = 60 net, never 160.
    expect(position.quantity).toBe('60');

    // Raw ledger still lists all three legs for audit.
    const rows = await prisma.transaction.findMany({ where: { portfolioId } });
    expect(rows).toHaveLength(3);
  });
});
