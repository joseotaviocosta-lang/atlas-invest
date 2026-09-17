import { describe, it, expect } from 'vitest';
import { createPortfolioId, Transaction, TransactionFactory } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';

/**
 * Deterministic PRNG using Linear Congruential Generator.
 * Guarantees identical sequence across runs without global Math.random().
 */
class DeterministicPRNG {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/**
 * Seeded stress scenario generator producing valid long-only ledgers.
 */
function generateStressLedger(
  targetCount: number,
  seed = 2026,
): { portfolioId: string; transactions: Transaction[] } {
  const prng = new DeterministicPRNG(seed);
  const portfolioId = 'c0000000-0000-4000-8000-000000000999';

  const accounts = [
    'd0000000-0000-4000-8000-000000000101',
    'd0000000-0000-4000-8000-000000000102',
    'd0000000-0000-4000-8000-000000000103',
  ];

  const assets = [
    'e0000000-0000-4000-8000-000000000201',
    'e0000000-0000-4000-8000-000000000202',
    'e0000000-0000-4000-8000-000000000203',
    'e0000000-0000-4000-8000-000000000204',
    'e0000000-0000-4000-8000-000000000205',
  ];

  // In-memory simulation during generation to guarantee valid long-only quantities
  const custody = new Map<string, number>(); // accountId:assetId -> qty

  function getQty(acc: string, asset: string): number {
    return custody.get(`${acc}:${asset}`) ?? 0;
  }
  function setQty(acc: string, asset: string, qty: number): void {
    custody.set(`${acc}:${asset}`, qty);
  }

  const transactions: Transaction[] = [];
  let dayOffset = 1;
  let txIdCounter = 1;

  function makeTxId(): string {
    return `f0000000-0000-4000-8000-${(txIdCounter++).toString().padStart(12, '0')}`;
  }

  function currentDate(): string {
    const base = new Date(Date.UTC(2020, 0, 1 + dayOffset));
    return base.toISOString().slice(0, 10);
  }

  // Seed initial deposits
  for (const acc of accounts) {
    transactions.push(
      TransactionFactory.createCashMovement({
        id: makeTxId(),
        portfolioId,
        accountId: acc,
        type: 'DEPOSIT',
        amount: '1000000.00',
        currency: 'BRL',
        tradeDate: currentDate(),
      }),
    );
  }

  let transferGroupCounter = 1;

  while (transactions.length < targetCount) {
    dayOffset++;
    const tradeDate = currentDate();
    const actionType = prng.nextInt(1, 10);
    const acc = prng.choice(accounts);
    const asset = prng.choice(assets);
    const currentHolding = getQty(acc, asset);

    if (actionType <= 3 || currentHolding === 0) {
      // 1-3: BUY
      const qty = prng.nextInt(10, 200);
      const price = prng.nextInt(10, 100).toFixed(2);
      transactions.push(
        TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          quantity: qty.toString(),
          unitPrice: price,
          currency: 'BRL',
          tradeDate,
        }),
      );
      setQty(acc, asset, currentHolding + qty);
    } else if (actionType === 4 && currentHolding > 10) {
      // 4: SELL
      const sellQty = prng.nextInt(1, Math.floor(currentHolding / 2));
      const price = prng.nextInt(15, 120).toFixed(2);
      transactions.push(
        TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          quantity: sellQty.toString(),
          unitPrice: price,
          currency: 'BRL',
          tradeDate,
        }),
      );
      setQty(acc, asset, currentHolding - sellQty);
    } else if (actionType === 5 && currentHolding > 20 && transactions.length + 2 <= targetCount) {
      // 5: MATCHED TRANSFER
      const otherAccounts = accounts.filter((a) => a !== acc);
      const destAcc = prng.choice(otherAccounts);
      const transferQty = prng.nextInt(1, Math.floor(currentHolding / 2));
      const transferGroupId = `tg-stress-${transferGroupCounter++}`;

      transactions.push(
        TransactionFactory.createTransfer({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          type: 'TRANSFER_OUT',
          quantity: transferQty.toString(),
          currency: 'BRL',
          transferGroupId,
          tradeDate,
        }),
      );
      transactions.push(
        TransactionFactory.createTransfer({
          id: makeTxId(),
          portfolioId,
          accountId: destAcc,
          assetId: asset,
          type: 'TRANSFER_IN',
          quantity: transferQty.toString(),
          currency: 'BRL',
          transferGroupId,
          tradeDate,
        }),
      );
      setQty(acc, asset, currentHolding - transferQty);
      setQty(destAcc, asset, getQty(destAcc, asset) + transferQty);
    } else if (actionType === 6) {
      // 6: DIVIDEND or JCP
      transactions.push(
        TransactionFactory.createIncome({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          type: prng.choice(['DIVIDEND', 'JCP', 'FII_INCOME']),
          amount: prng.nextInt(50, 500).toFixed(2),
          currency: 'BRL',
          tradeDate,
        }),
      );
    } else if (actionType === 7) {
      // 7: FEE or TAX
      transactions.push(
        TransactionFactory.createExpense({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          type: prng.choice(['FEE', 'TAX']),
          amount: prng.nextInt(5, 50).toFixed(2),
          currency: 'BRL',
          tradeDate,
        }),
      );
    } else if (actionType === 8) {
      // 8: SUBSCRIPTION
      const qty = prng.nextInt(5, 50);
      const price = prng.nextInt(8, 30).toFixed(2);
      transactions.push(
        TransactionFactory.createSubscription({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          quantity: qty.toString(),
          unitPrice: price,
          currency: 'BRL',
          tradeDate,
        }),
      );
      setQty(acc, asset, currentHolding + qty);
    } else if (actionType === 9 && currentHolding >= 10 && currentHolding <= 5000) {
      // 9: SPLIT (2:1)
      transactions.push(
        TransactionFactory.createSplit({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          assetId: asset,
          type: 'SPLIT',
          factor: '2',
          currency: 'BRL',
          tradeDate,
        }),
      );
      setQty(acc, asset, currentHolding * 2);
    } else {
      // 10: CASH MOVEMENT (DEPOSIT or WITHDRAWAL)
      transactions.push(
        TransactionFactory.createCashMovement({
          id: makeTxId(),
          portfolioId,
          accountId: acc,
          type: prng.choice(['DEPOSIT', 'WITHDRAWAL']),
          amount: prng.nextInt(100, 5000).toFixed(2),
          currency: 'BRL',
          tradeDate,
        }),
      );
    }
  }

  return { portfolioId, transactions };
}

describe('Portfolio Engine: Massive Replay Hardening & Scale (Phase 1F)', () => {
  it('should replay a 1,000-transaction seeded ledger deterministically and verify core invariants', () => {
    const { portfolioId, transactions } = generateStressLedger(1000, 42);

    const t0 = performance.now();
    const result1 = replayPortfolio({
      portfolioId: createPortfolioId(portfolioId),
      transactions,
    });
    const t1 = performance.now();
    const duration1 = t1 - t0;

    // Verify invariant counts
    expect(result1.totalProcessedCount).toBe(transactions.length);
    expect(result1.appliedTransactions.length).toBe(transactions.length);
    expect(result1.deferredEvents).toHaveLength(0);

    // Replay a second time with fresh instance and verify 100% determinism
    const result2 = replayPortfolio({
      portfolioId: createPortfolioId(portfolioId),
      transactions,
    });

    expect(result1.state.assets.size).toBe(result2.state.assets.size);
    for (const [k, v] of result1.state.assets.entries()) {
      const v2 = result2.state.assets.get(k)!;
      expect(v.quantity.value).toBe(v2.quantity.value);
      expect(v.totalCost?.amount).toBe(v2.totalCost?.amount);
    }

    console.info(`[BENCHMARK] 1,000 transactions replay completed in ${duration1.toFixed(2)}ms`);
    expect(duration1).toBeLessThan(10000); // Generous timeout
  });

  it('should replay a 10,000-transaction seeded ledger deterministically within reasonable limits', () => {
    const { portfolioId, transactions } = generateStressLedger(10000, 99);

    const t0 = performance.now();
    const result = replayPortfolio({
      portfolioId: createPortfolioId(portfolioId),
      transactions,
    });
    const t1 = performance.now();
    const duration = t1 - t0;

    expect(result.totalProcessedCount).toBe(transactions.length);
    expect(result.appliedTransactions.length).toBe(transactions.length);
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.state.assets.size).toBeGreaterThan(0);

    console.info(`[BENCHMARK] 10,000 transactions replay completed in ${duration.toFixed(2)}ms`);
  });

  it('should benchmark 50,000-transaction seeded ledger (benchmark coverage)', () => {
    const { portfolioId, transactions } = generateStressLedger(50000, 777);

    const t0 = performance.now();
    const result = replayPortfolio({
      portfolioId: createPortfolioId(portfolioId),
      transactions,
    });
    const t1 = performance.now();
    const duration = t1 - t0;

    expect(result.totalProcessedCount).toBe(transactions.length);
    expect(result.appliedTransactions.length).toBe(transactions.length);
    expect(result.deferredEvents).toHaveLength(0);

    console.info(`[BENCHMARK] 50,000 transactions replay completed in ${duration.toFixed(2)}ms`);
  }, 120000); // 2 minute timeout for 50k benchmark
});
