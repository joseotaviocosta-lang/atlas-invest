import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { TransactionFactory, LocalDate } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import { TransactionRepository } from '../../packages/database/src';

describe('Database Integration: Deterministic Ledger Ordering & Traversal', () => {
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

  it('should return transactions in strictly deterministic order: tradeDate ASC, createdAt ASC, id ASC', async () => {
    // Insert transactions deliberately out of chronological order
    const tx3 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '300.00',
      currency: 'BRL',
      tradeDate: '2026-03-01',
      notes: 'Third event chronologically',
    });

    const tx1 = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '100.00',
      currency: 'BRL',
      tradeDate: '2026-01-01',
      notes: 'First event chronologically',
    });

    const tx2a = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      amount: '200.00',
      currency: 'BRL',
      tradeDate: '2026-02-01',
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      notes: 'Second event A',
    });

    const tx2b = TransactionFactory.createCashMovement({
      portfolioId,
      accountId,
      type: 'WITHDRAWAL',
      amount: '50.00',
      currency: 'BRL',
      tradeDate: '2026-02-01',
      createdAt: new Date('2026-02-01T11:00:00.000Z'),
      notes: 'Second event B (later createdAt)',
    });

    // Save in non-chronological order: tx3, then tx1, then tx2b, then tx2a
    await txRepo.create(tx3);
    await txRepo.create(tx1);
    await txRepo.create(tx2b);
    await txRepo.create(tx2a);

    // Retrieve ledger
    const ledger = await txRepo.findByPortfolioId(portfolioId);

    expect(ledger.length).toBe(4);
    expect(ledger[0].id).toBe(tx1.id);
    expect(ledger[1].id).toBe(tx2a.id);
    expect(ledger[2].id).toBe(tx2b.id);
    expect(ledger[3].id).toBe(tx3.id);
  });

  it('should filter transactions by economic date range', async () => {
    const dates = ['2026-01-10', '2026-02-15', '2026-03-20', '2026-04-25'];

    for (const d of dates) {
      await txRepo.create(
        TransactionFactory.createCashMovement({
          portfolioId,
          accountId,
          type: 'DEPOSIT',
          amount: '100.00',
          currency: 'BRL',
          tradeDate: d,
        }),
      );
    }

    const filtered = await txRepo.findByPortfolioId(portfolioId, {
      startDate: LocalDate.from('2026-02-01'),
      endDate: LocalDate.from('2026-03-31'),
    });

    expect(filtered.length).toBe(2);
    expect(filtered[0].tradeDate.toString()).toBe('2026-02-15');
    expect(filtered[1].tradeDate.toString()).toBe('2026-03-20');
  });

  it('should paginate transactions with limit and skip', async () => {
    for (let i = 1; i <= 5; i++) {
      await txRepo.create(
        TransactionFactory.createCashMovement({
          portfolioId,
          accountId,
          type: 'DEPOSIT',
          amount: `${i * 100}.00`,
          currency: 'BRL',
          tradeDate: `2026-01-0${i}`,
        }),
      );
    }

    const page1 = await txRepo.findByPortfolioId(portfolioId, undefined, {
      limit: 2,
      skip: 0,
    });
    expect(page1.length).toBe(2);
    expect(page1[0].tradeDate.toString()).toBe('2026-01-01');
    expect(page1[1].tradeDate.toString()).toBe('2026-01-02');

    const page2 = await txRepo.findByPortfolioId(portfolioId, undefined, {
      limit: 2,
      skip: 2,
    });
    expect(page2.length).toBe(2);
    expect(page2[0].tradeDate.toString()).toBe('2026-01-03');
    expect(page2[1].tradeDate.toString()).toBe('2026-01-04');
  });
});
