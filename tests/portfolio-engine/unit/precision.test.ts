import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine Core: Exact Decimal Precision (No IEEE 754 Float)', () => {
  it('should maintain exact decimal precision with fractional quantities (0.1 + 0.2 = 0.3)', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '0.1', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '0.2', tradeDate: '2026-01-15' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.value).toBe('0.3');
    expect(asset?.quantity.toString()).not.toBe('0.30000000000000004');
  });

  it('should support up to 18 decimal places of exact precision without truncation', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '123456789.123456789', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '0.000000001', tradeDate: '2026-01-15' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.value).toBe('123456789.12345679');
  });

  it('should handle fractional SELL with exact balance', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '1.5', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '0.75', tradeDate: '2026-01-15' })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.value).toBe('0.75');
  });

  it('should handle very large quantities without overflow or scientific notation', () => {
    const result = scenario()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '1000000000000.000000000000000000',
        tradeDate: '2026-01-10',
      })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '500000000000.000000000000000000',
        tradeDate: '2026-01-15',
      })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.value).toBe('1500000000000');
  });
});
