import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { LocalDate, TransactionFactory } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import { TransactionRepository } from '../../packages/database/src';

describe('Database Integration: LocalDate Round-Trip & Timezone Immunity', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should preserve exact economic dates across month and leap-year boundaries without timezone drift', async () => {
    const { portfolioId, accountId } = await seedBaseFixtures();

    const dates = [
      '2024-02-29', // Leap year day
      '2026-12-31', // End of year
      '2026-01-01', // Start of year
      '2026-07-15', // Mid year
    ];

    for (const dateStr of dates) {
      const tx = TransactionFactory.createCashMovement({
        portfolioId,
        accountId,
        type: 'DEPOSIT',
        amount: '100.00',
        currency: 'BRL',
        tradeDate: dateStr,
      });

      await txRepo.create(tx);

      const retrieved = await txRepo.findById(tx.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.tradeDate).toBeInstanceOf(LocalDate);
      expect(retrieved?.tradeDate.toString()).toBe(dateStr);
    }
  });

  it('should preserve settlementDate when specified', async () => {
    const { portfolioId, accountId } = await seedBaseFixtures();

    const tx = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '500.00',
      currency: 'BRL',
      tradeDate: '2026-03-10',
      settlementDate: '2026-03-12',
    });

    await txRepo.create(tx);

    const retrieved = await txRepo.findById(tx.id);
    expect(retrieved?.tradeDate.toString()).toBe('2026-03-10');
    expect(retrieved?.settlementDate?.toString()).toBe('2026-03-12');
  });
});
