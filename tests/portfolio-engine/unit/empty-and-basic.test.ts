import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, PORTFOLIO_DEFAULT, ACCOUNT_XP } from '../fixtures/assets';
import { Quantity } from '@atlas/domain';

describe('Portfolio Engine Core: Basic Quantity Replay', () => {
  it('should return valid empty state for empty portfolio', () => {
    const result = scenario().replay();

    expect(result.totalProcessedCount).toBe(0);
    expect(result.appliedTransactions).toHaveLength(0);
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.state.portfolioId).toBe(PORTFOLIO_DEFAULT);
    expect(result.state.accounts.size).toBe(0);
    expect(result.state.assets.size).toBe(0);
    expect(result.state.processedTransactionCount).toBe(0);
    expect(result.state.appliedTransactionCount).toBe(0);
    expect(result.state.deferredTransactionCount).toBe(0);
  });

  it('should correctly replay a single BUY transaction', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .replay();

    expect(result.totalProcessedCount).toBe(1);
    expect(result.appliedTransactions).toHaveLength(1);
    expect(result.deferredEvents).toHaveLength(0);

    // Account level verification
    const account = result.state.accounts.get(String(ACCOUNT_XP));
    expect(account).toBeDefined();
    const assetInAccount = account?.assets.get(String(ASSET_PETR4));
    expect(assetInAccount?.quantity.equals(Quantity.from('100'))).toBe(true);

    // Portfolio level aggregated verification
    const aggregatedAsset = result.state.assets.get(String(ASSET_PETR4));
    expect(aggregatedAsset?.quantity.equals(Quantity.from('100'))).toBe(true);
  });

  it('should cumulatively sum multiple BUY transactions for the same asset', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', tradeDate: '2026-01-15' })
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(asset?.quantity.value).toBe('150');
  });

  it('should deduct quantity for BUY + SELL transactions', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', tradeDate: '2026-01-20' })
      .replay();

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.equals(Quantity.from('60'))).toBe(true);
    expect(asset?.quantity.value).toBe('60');
  });
});
