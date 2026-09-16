import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, PORTFOLIO_DEFAULT, ACCOUNT_XP } from '../fixtures/assets';
import { Quantity, Money, TransactionFactory } from '@atlas/domain';
import {
  createPortfolioReplayEngine,
  CurrencyMismatchError,
  InvalidBuyCostError,
} from '@atlas/portfolio-engine';

describe('Portfolio Engine Core: BUY Cost Basis & Weighted Average Cost', () => {
  it('Single BUY: establishes initial quantity, totalCost, and averageCost', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30.00', tradeDate: '2026-01-10' })
      .replay();

    expect(result.totalProcessedCount).toBe(1);
    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('3000.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('30.00', 'BRL'))).toBe(true);
    expect(asset?.currency).toBe('BRL');
    expect(asset?.costBasisStatus).toBe('KNOWN');
  });

  it('Canonical Example 1: Multiple BUYs calculate exact weighted average, not simple average', () => {
    // BUY 100 @ 30 (cost: 3000)
    // BUY 50 @ 36 (cost: 1800)
    // Total cost: 4800, Total qty: 150, Weighted avg: 32 (NOT (30+36)/2 = 33)
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30.00', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '36.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('4800.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('32.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.amount).toBe('32');
    expect(asset?.costBasisStatus).toBe('KNOWN');
  });

  it('Embedded acquisition fees: fees in BUY are added to cost basis', () => {
    // BUY 100 @ 30, fee = 10
    // grossCost = 3000, totalCost = 3010, averageCost = 30.10
    const result = scenario()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30.00',
        fees: '10.00',
        tradeDate: '2026-01-10',
      })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('3010.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('30.10', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.amount).toBe('30.1');
  });

  it('Fractional BUY: exact decimal math without float drift (0.1 + 0.2)', () => {
    // BUY 0.1 @ 100 -> cost 10
    // BUY 0.2 @ 110 -> cost 22
    // totalCost = 32, qty = 0.3, avg = 32 / 0.3 = 106.666666...
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '0.1', unitPrice: '100.00', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '0.2', unitPrice: '110.00', tradeDate: '2026-01-15' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('0.3'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('32.00', 'BRL'))).toBe(true);

    // Verify averageCost retains high precision (not truncated or rounded to 2 decimals internally)
    expect(asset?.averageCost?.amount.startsWith('106.6666666666666666')).toBe(true);
  });

  it('Large decimal unit price and quantity: preserves full 40-digit precision', () => {
    const qty = '0.123456789';
    const price = '123.456789123456789';
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: qty, unitPrice: price, tradeDate: '2026-01-10' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.value).toBe(qty);
    expect(asset?.averageCost?.amount).toBe(price);
  });

  it('Rejects BUY with zero or negative unit price', () => {
    const engine = createPortfolioReplayEngine();
    const tx = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '0.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [tx],
      }),
    ).toThrowError(InvalidBuyCostError);
  });

  it('Rejects multi-currency purchases on the same asset position with CurrencyMismatchError', () => {
    const engine = createPortfolioReplayEngine();
    const tx1 = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createBuy({
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '50',
      unitPrice: '6.00',
      currency: 'USD',
      tradeDate: '2026-01-15',
    });

    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [tx1, tx2],
      }),
    ).toThrowError(CurrencyMismatchError);
  });
});
