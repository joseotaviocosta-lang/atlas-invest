import { describe, it, expect } from 'vitest';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';
import { createPortfolioReplayEngine } from '@atlas/portfolio-engine';
import { TransactionFactory, Transaction } from '@atlas/domain';

describe('Portfolio Engine Core: Performance Benchmarks', () => {
  it('should replay 1,000 transactions well within performance target (< 500ms)', () => {
    const transactions: Transaction[] = [];
    const assets = [ASSET_PETR4, ASSET_VALE3];

    for (let i = 0; i < 1000; i++) {
      const assetId = assets[i % 2];
      const day = ((i % 28) + 1).toString().padStart(2, '0');
      const month = ((Math.floor(i / 28) % 12) + 1).toString().padStart(2, '0');
      const seq = (i + 1).toString().padStart(12, '0');

      transactions.push(
        TransactionFactory.createBuy({
          id: `f0000000-0000-4000-8000-${seq}`,
          portfolioId: String(PORTFOLIO_DEFAULT),
          accountId: String(ACCOUNT_XP),
          assetId: String(assetId),
          quantity: '10',
          unitPrice: '25.50',
          currency: 'BRL',
          tradeDate: `2025-${month}-${day}`,
          createdAt: new Date(1735689600000 + i * 1000),
        }),
      );
    }

    const engine = createPortfolioReplayEngine();
    const startTime = performance.now();
    const result = engine.replay({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
    });
    const duration = performance.now() - startTime;

    expect(result.totalProcessedCount).toBe(1000);
    expect(result.appliedTransactions).toHaveLength(1000);
    expect(result.state.assets.size).toBe(2);
    // Performance target: 1,000 transactions < 500ms
    expect(duration).toBeLessThan(500);
  });

  it('should replay 10,000 transactions cleanly without memory exhaustion (< 3,000ms)', () => {
    const transactions: Transaction[] = [];
    const assets = [ASSET_PETR4, ASSET_VALE3];

    for (let i = 0; i < 10000; i++) {
      const assetId = assets[i % 2];
      const day = ((i % 28) + 1).toString().padStart(2, '0');
      const month = ((Math.floor(i / 28) % 12) + 1).toString().padStart(2, '0');
      const year = (2020 + Math.floor(i / (28 * 12))).toString();
      const seq = (i + 1).toString().padStart(12, '0');

      // Interleave BUY and SELL keeping balance positive
      if (i % 5 === 4) {
        transactions.push(
          TransactionFactory.createSell({
            id: `f0000000-0000-4000-8000-${seq}`,
            portfolioId: String(PORTFOLIO_DEFAULT),
            accountId: String(ACCOUNT_XP),
            assetId: String(assetId),
            quantity: '5',
            unitPrice: '30.00',
            currency: 'BRL',
            tradeDate: `${year}-${month}-${day}`,
            createdAt: new Date(1577836800000 + i * 1000),
          }),
        );
      } else {
        transactions.push(
          TransactionFactory.createBuy({
            id: `f0000000-0000-4000-8000-${seq}`,
            portfolioId: String(PORTFOLIO_DEFAULT),
            accountId: String(ACCOUNT_XP),
            assetId: String(assetId),
            quantity: '10',
            unitPrice: '25.00',
            currency: 'BRL',
            tradeDate: `${year}-${month}-${day}`,
            createdAt: new Date(1577836800000 + i * 1000),
          }),
        );
      }
    }

    const engine = createPortfolioReplayEngine();
    const startTime = performance.now();
    const result = engine.replay({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions,
    });
    const duration = performance.now() - startTime;

    expect(result.totalProcessedCount).toBe(10000);
    expect(result.appliedTransactions).toHaveLength(10000);
    expect(result.state.assets.size).toBe(2);
    // Performance target: 10,000 transactions < 3,000ms
    expect(duration).toBeLessThan(3000);
  });
});
