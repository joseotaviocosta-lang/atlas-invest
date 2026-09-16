import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ASSET_VALE3, ASSET_HGLG11, ACCOUNT_XP, ACCOUNT_NU } from '../fixtures/assets';

describe('Portfolio Engine Core: Multi-Asset & Multi-Account Isolation', () => {
  it('Cross-Asset Isolation: transactions in Asset A must not affect Asset B', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_VALE3, quantity: '50', tradeDate: '2026-01-12' })
      .sell({ assetId: ASSET_PETR4, quantity: '30', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_HGLG11, quantity: '20', tradeDate: '2026-01-20' })
      .replay();

    expect(result.state.assets.size).toBe(3);
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('70');
    expect(result.state.assets.get(String(ASSET_VALE3))?.quantity.value).toBe('50');
    expect(result.state.assets.get(String(ASSET_HGLG11))?.quantity.value).toBe('20');
  });

  it('Multi-Account Separation & Portfolio Aggregation', () => {
    const result = scenario()
      // Account XP: Buy 100 PETR4
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        tradeDate: '2026-01-10',
      })
      // Account NuInvest: Buy 50 PETR4
      .buy({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        tradeDate: '2026-01-12',
      })
      // Account NuInvest: Buy 30 VALE3
      .buy({
        accountId: ACCOUNT_NU,
        assetId: ASSET_VALE3,
        quantity: '30',
        tradeDate: '2026-01-15',
      })
      .replay();

    // Accounts presence
    expect(result.state.accounts.size).toBe(2);

    const xpAccount = result.state.accounts.get(String(ACCOUNT_XP));
    expect(xpAccount).toBeDefined();
    expect(xpAccount?.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('100');
    expect(xpAccount?.assets.has(String(ASSET_VALE3))).toBe(false);

    const nuAccount = result.state.accounts.get(String(ACCOUNT_NU));
    expect(nuAccount).toBeDefined();
    expect(nuAccount?.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('50');
    expect(nuAccount?.assets.get(String(ASSET_VALE3))?.quantity.value).toBe('30');

    // Aggregated portfolio level
    expect(result.state.assets.size).toBe(2);
    // PETR4 sum: 100 (XP) + 50 (NU) = 150
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('150');
    // VALE3 sum: 30 (NU)
    expect(result.state.assets.get(String(ASSET_VALE3))?.quantity.value).toBe('30');
  });
});
