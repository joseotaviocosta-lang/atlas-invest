import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cleanDatabase, getTestPrismaClient, seedBaseFixtures } from './setup';

/**
 * Phase 5S-C — rectification link persistence (append-only identity + audit).
 *
 * One row per original transaction; compensating/replacement legs are
 * ordinary ledger rows (RESTRICT); portfolio cascades with its scope.
 * No backfill: historical rectifications carry no link rows.
 */
describe('Database: transaction rectifications (Phase 5S-C)', () => {
  const prisma = getTestPrismaClient();
  let portfolioId: string;
  let accountId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await prisma.transactionRectificationRecord.deleteMany({});
    await prisma.transaction.deleteMany({ where: { portfolioId } });
  });

  async function seedTx(): Promise<string> {
    const tx = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId,
        type: 'BUY',
        tradeDate: new Date('2026-03-01T00:00:00.000Z'),
        currency: 'BRL',
        provider: 'TEST',
        externalId: `tx-5sc-${randomUUID()}`,
      },
    });
    return tx.id;
  }

  it('persists a rectification link with audit fields', async () => {
    const originalId = await seedTx();
    const compensatingId = await seedTx();
    const replacementId = await seedTx();
    const created = await prisma.transactionRectificationRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        originalTransactionId: originalId,
        compensatingTransactionId: compensatingId,
        replacementTransactionId: replacementId,
        mode: 'RECTIFY',
        reason: 'Quantidade correta e 60',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date('2026-10-27T12:00:00.000Z'),
      },
    });
    expect(created.originalTransactionId).toBe(originalId);
    expect(created.mode).toBe('RECTIFY');
    expect(created.reason).toBe('Quantidade correta e 60');
  });

  it('enforces one outgoing rectification per original (unique)', async () => {
    const originalId = await seedTx();
    await prisma.transactionRectificationRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        originalTransactionId: originalId,
        compensatingTransactionId: await seedTx(),
        replacementTransactionId: await seedTx(),
        mode: 'RECTIFY',
        reason: 'primeira',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date(),
      },
    });
    await expect(
      prisma.transactionRectificationRecord.create({
        data: {
          id: randomUUID(),
          portfolioId,
          originalTransactionId: originalId,
          compensatingTransactionId: await seedTx(),
          replacementTransactionId: await seedTx(),
          mode: 'CANCEL',
          reason: 'segunda',
          decidedByPrincipal: 'user-1',
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('supports chained rectification (B may itself be rectified)', async () => {
    const a = await seedTx();
    const compA = await seedTx();
    const b = await seedTx();
    await prisma.transactionRectificationRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        originalTransactionId: a,
        compensatingTransactionId: compA,
        replacementTransactionId: b,
        mode: 'RECTIFY',
        reason: 'A->B',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date(),
      },
    });
    const compB = await seedTx();
    const c = await seedTx();
    const second = await prisma.transactionRectificationRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        originalTransactionId: b,
        compensatingTransactionId: compB,
        replacementTransactionId: c,
        mode: 'RECTIFY',
        reason: 'B->C',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date(),
      },
    });
    expect(second.originalTransactionId).toBe(b);
    expect(second.replacementTransactionId).toBe(c);
  });

  it('restricts deleting ledger rows referenced by rectifications', async () => {
    const originalId = await seedTx();
    await prisma.transactionRectificationRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        originalTransactionId: originalId,
        compensatingTransactionId: await seedTx(),
        replacementTransactionId: null,
        mode: 'CANCEL',
        reason: 'cancelamento',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date(),
      },
    });
    await expect(prisma.transaction.delete({ where: { id: originalId } })).rejects.toThrow();
  });
});
