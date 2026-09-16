import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';
import { Quantity, LocalDate } from '@atlas/domain';

describe('Portfolio Engine Core: As-Of Date Filtering', () => {
  it('should include transactions on or before asOfDate and exclude transactions after asOfDate', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', tradeDate: '2026-01-20' })
      .buy({ assetId: ASSET_PETR4, quantity: '30', tradeDate: '2026-02-01' })
      .asOf('2026-01-20')
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.state.asOfDate).toEqual(LocalDate.from('2026-01-20'));

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('150'))).toBe(true);
  });

  it('should return empty portfolio state when asOfDate is before the first transaction', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_VALE3, quantity: '200', tradeDate: '2026-01-15' })
      .asOf('2026-01-01')
      .replay();

    expect(result.totalProcessedCount).toBe(0);
    expect(result.appliedTransactions).toHaveLength(0);
    expect(result.state.assets.size).toBe(0);
    expect(result.state.accounts.size).toBe(0);
    expect(result.state.lastTransactionDate).toBeUndefined();
    expect(result.state.asOfDate).toEqual(LocalDate.from('2026-01-01'));
  });

  it('should include all transactions when asOfDate is after all transactions', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_VALE3, quantity: '200', tradeDate: '2026-01-15' })
      .asOf('2026-12-31')
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);
    expect(
      result.state.assets.get(String(ASSET_PETR4))?.quantity.equals(Quantity.from('100')),
    ).toBe(true);
    expect(
      result.state.assets.get(String(ASSET_VALE3))?.quantity.equals(Quantity.from('200')),
    ).toBe(true);
  });

  it('should handle exact date boundaries including multiple transactions on asOfDate', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '20', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '10', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', tradeDate: '2026-01-16' })
      .asOf('2026-01-15')
      .replay();

    expect(result.totalProcessedCount).toBe(3);
    expect(result.appliedTransactions).toHaveLength(3);
    const petr4 = result.state.assets.get(String(ASSET_PETR4));
    expect(petr4?.quantity.equals(Quantity.from('110'))).toBe(true);
  });
});
