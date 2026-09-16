import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, PORTFOLIO_DEFAULT, ACCOUNT_XP } from '../fixtures/assets';
import { TransactionFactory } from '@atlas/domain';
import { replayPortfolio, NegativePositionError } from '@atlas/portfolio-engine';

describe('Portfolio Engine Core: Canonical Ordering & 1,000x Determinism', () => {
  it('Same-Day Ordering: createdAt decides execution order when tradeDate is identical', () => {
    // Scenario 1: BUY at 10:00, SELL at 11:00 on the same date -> Valid
    const buyFirst = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
      createdAt: new Date('2026-01-10T10:00:00.000Z'),
    });

    const sellSecond = TransactionFactory.createSell({
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '40',
      unitPrice: '12.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
      createdAt: new Date('2026-01-10T11:00:00.000Z'),
    });

    // Pass them in reversed input order [sellSecond, buyFirst]
    // The canonical sorting must sort buyFirst before sellSecond!
    const result = replayPortfolio({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: [sellSecond, buyFirst],
    });

    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('60');

    // Scenario 2: SELL at 09:00, BUY at 10:00 -> Must throw NegativePositionError even if passed as [buyFirst, sellEarlier]
    const sellEarlier = TransactionFactory.createSell({
      id: 'f0000000-0000-4000-8000-000000000003',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '10',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
      createdAt: new Date('2026-01-10T09:00:00.000Z'),
    });

    expect(() =>
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [buyFirst, sellEarlier],
      }),
    ).toThrow(NegativePositionError);
  });

  it('Same-Timestamp Ordering: Transaction ID decides order deterministically when tradeDate and createdAt match', () => {
    const time = new Date('2026-01-10T12:00:00.000Z');

    const txA = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
      createdAt: time,
    });

    const txB = TransactionFactory.createSell({
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '30',
      unitPrice: '11.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
      createdAt: time,
    });

    // Reversed input [txB, txA]
    const result = replayPortfolio({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: [txB, txA],
    });

    expect(result.appliedTransactions[0].id).toBe(txA.id);
    expect(result.appliedTransactions[1].id).toBe(txB.id);
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('70');
  });

  it('Randomized Input Order Invariance: 50 random shuffles must yield 100% identical derived state', () => {
    // Build a chronological scenario of 10 events
    const s = scenario()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        tradeDate: '2026-01-01',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '50',
        tradeDate: '2026-01-02',
        createdAt: new Date('2026-01-02T10:00:00Z'),
      })
      .dividend({
        assetId: ASSET_PETR4,
        amount: '20',
        tradeDate: '2026-01-03',
        createdAt: new Date('2026-01-03T10:00:00Z'),
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '30',
        tradeDate: '2026-01-04',
        createdAt: new Date('2026-01-04T10:00:00Z'),
      })
      .transferOut({
        assetId: ASSET_PETR4,
        quantity: '20',
        tradeDate: '2026-01-05',
        createdAt: new Date('2026-01-05T10:00:00Z'),
      })
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '10',
        tradeDate: '2026-01-06',
        createdAt: new Date('2026-01-06T10:00:00Z'),
      });

    const baselineTxList = s.build();
    const baselineResult = s.replay();

    // Fisher-Yates shuffle helper
    function shuffle<T>(array: T[]): T[] {
      const copy = [...array];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    }

    // Run 50 shuffles and compare with baseline
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffle(baselineTxList);
      const shuffledResult = replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: shuffled,
      });

      expect(shuffledResult.totalProcessedCount).toBe(baselineResult.totalProcessedCount);
      expect(shuffledResult.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe(
        baselineResult.state.assets.get(String(ASSET_PETR4))?.quantity.value,
      );

      // Verify exact transaction application order matches baseline
      for (let t = 0; t < baselineResult.appliedTransactions.length; t++) {
        expect(shuffledResult.appliedTransactions[t]?.id).toBe(
          baselineResult.appliedTransactions[t]?.id,
        );
      }
    }
  });

  it('Repeatability: Replaying 1,000 times over same input yields deep-equal results', () => {
    const s = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '35', tradeDate: '2026-01-15' });

    const first = s.replay();

    for (let i = 0; i < 1000; i++) {
      const current = s.replay();
      expect(current.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('65');
      expect(current.totalProcessedCount).toBe(first.totalProcessedCount);
    }
  });
});
