import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import {
  TransactionRepository,
  DuplicateExternalTransactionError,
} from '../../packages/database/src';

describe('Database Integration: Idempotency & External Provider Constraints', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);

  let portfolioId: string;
  let accountId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should reject duplicate transaction with same provider and externalId within the same portfolio', async () => {
    const tx1 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '1000.00',
      currency: 'BRL',
      provider: 'OPEN_FINANCE_ITAU',
      externalId: 'EXT-TX-9999',
      tradeDate: '2026-04-01',
    });

    await txRepo.create(tx1);

    const tx2 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '1000.00',
      currency: 'BRL',
      provider: 'OPEN_FINANCE_ITAU',
      externalId: 'EXT-TX-9999',
      tradeDate: '2026-04-01',
    });

    await expect(txRepo.create(tx2)).rejects.toThrow(DuplicateExternalTransactionError);
  });

  it('should allow multiple manual transactions where provider and externalId are null', async () => {
    const tx1 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '500.00',
      currency: 'BRL',
      tradeDate: '2026-04-02',
    });

    const tx2 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '500.00',
      currency: 'BRL',
      tradeDate: '2026-04-02',
    });

    const saved1 = await txRepo.create(tx1);
    const saved2 = await txRepo.create(tx2);

    expect(saved1.id).not.toBe(saved2.id);
  });

  it('should find transaction by external ID', async () => {
    const tx = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '2500.00',
      currency: 'BRL',
      provider: 'CEI_B3',
      externalId: 'B3-IMPORT-777',
      tradeDate: '2026-04-03',
    });

    await txRepo.create(tx);

    const found = await txRepo.findByExternalId(portfolioId, 'CEI_B3', 'B3-IMPORT-777');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(tx.id);
  });
});
