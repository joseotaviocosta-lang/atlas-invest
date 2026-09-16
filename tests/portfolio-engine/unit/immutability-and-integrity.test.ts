import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  ASSET_PETR4,
  PORTFOLIO_DEFAULT,
  PORTFOLIO_SECONDARY,
  ACCOUNT_XP,
} from '../fixtures/assets';
import {
  createPortfolioReplayEngine,
  DuplicateTransactionError,
  CrossPortfolioTransactionError,
  NegativePositionError,
} from '@atlas/portfolio-engine';
import { TransactionFactory } from '@atlas/domain';

describe('Portfolio Engine Core: Immutability and Integrity', () => {
  it('should not mutate the input transactions array even if frozen', () => {
    const builder = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-20' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', tradeDate: '2026-01-10' });

    const txs = builder.build();
    // Deep freeze input array
    Object.freeze(txs);
    txs.forEach((tx) => Object.freeze(tx));

    const engine = createPortfolioReplayEngine();
    const result = engine.replay({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: txs,
    });

    expect(result.totalProcessedCount).toBe(2);
    // Ensure input array wasn't sorted in-place
    expect(txs[0].tradeDate.toString()).toBe('2026-01-20');
    expect(txs[1].tradeDate.toString()).toBe('2026-01-10');
  });

  it('should throw DuplicateTransactionError when multiple transactions have identical id', () => {
    const duplicateId = 'f0000000-0000-4000-8000-000000000999';
    const tx1 = TransactionFactory.createBuy({
      id: duplicateId,
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createBuy({
      id: duplicateId,
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '50',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });

    const engine = createPortfolioReplayEngine();
    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [tx1, tx2],
      }),
    ).toThrowError(DuplicateTransactionError);
  });

  it('should throw CrossPortfolioTransactionError when a transaction belongs to a different portfolio', () => {
    const tx1 = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: String(PORTFOLIO_SECONDARY),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '50',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });

    const engine = createPortfolioReplayEngine();
    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [tx1, tx2],
      }),
    ).toThrowError(CrossPortfolioTransactionError);
  });

  it('should guarantee error atomicity: fails completely without returning partial state', () => {
    const engine = createPortfolioReplayEngine();

    // Sequence: BUY 100, then SELL 150 (which violates long-only invariant)
    const tx1 = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createSell({
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '150',
      unitPrice: '12.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });

    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [tx1, tx2],
      }),
    ).toThrowError(NegativePositionError);
  });
});
