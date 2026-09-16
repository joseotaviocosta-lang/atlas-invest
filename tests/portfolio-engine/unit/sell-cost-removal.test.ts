import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';
import { Quantity, Money } from '@atlas/domain';

describe('Portfolio Engine Core: SELL Proportional Cost Removal & Average Cost Invariance', () => {
  it('Canonical Example 2: Partial SELL removes cost proportionally; sale price does NOT alter average cost', () => {
    // BUY 100 @ 10 (cost: 1000, avg: 10)
    // SELL 40 @ 99 (costRemoved: 400, remaining cost: 600, remaining qty: 60, avg: 10)
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '99.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('60'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('600.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.amount).toBe('10');
  });

  it('Full SELL: completely liquidates position, resets cost basis to zero and omits position', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '25.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '30.00', tradeDate: '2026-01-20' })
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);
    // ADR-039: zero position is omitted from active positions
    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);
    expect(result.state.assets.size).toBe(0);
  });

  it('Canonical Example 3: Rebuy after zero resets cost basis; zero legacy cost carries over', () => {
    // BUY 100 @ 10 (cost: 1000, avg: 10)
    // SELL 100 @ 15 (position liquidated, cost resets)
    // BUY 50 @ 30 (brand new position: cost: 1500, avg: 30)
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '30.00', tradeDate: '2026-01-20' })
      .replay();

    expect(result.totalProcessedCount).toBe(3);
    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('1500.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('30.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.amount).toBe('30');
  });

  it('Partial SELL then BUY recalculates weighted average cost correctly', () => {
    // BUY 100 @ 10 (cost: 1000, avg: 10)
    // SELL 50 @ 15 (costRemoved: 500, remaining cost: 500, remaining qty: 50, avg: 10)
    // BUY 50 @ 20 (acquisitionCost: 1000, newTotalCost: 1500, newQty: 100, newAvg: 15)
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '20.00', tradeDate: '2026-01-20' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('1500.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('15.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.amount).toBe('15');
  });

  it('Fractional SELL removes cost proportionally with exact decimal precision', () => {
    // BUY 1.0 @ 100 (cost: 100, avg: 100)
    // SELL 0.4 @ 150 (costRemoved: 40, remaining cost: 60, remaining qty: 0.6, avg: 100)
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '1.0', unitPrice: '100.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '0.4', unitPrice: '150.00', tradeDate: '2026-01-15' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('0.6'))).toBe(true);
    expect(asset?.totalCost?.equals(Money.from('60.00', 'BRL'))).toBe(true);
    expect(asset?.averageCost?.equals(Money.from('100.00', 'BRL'))).toBe(true);
  });
});
