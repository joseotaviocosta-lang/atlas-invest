import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ACCOUNT_XP, ACCOUNT_NU } from '../fixtures/assets';
import { NegativePositionError } from '@atlas/portfolio-engine';

describe('Portfolio Engine Core: Custody Transfers (TRANSFER_IN / TRANSFER_OUT)', () => {
  it('TRANSFER_IN should increase asset quantity in target account', () => {
    const result = scenario()
      .transferIn({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '50',
        tradeDate: '2026-01-10',
      })
      .replay();

    expect(result.appliedTransactions).toHaveLength(1);
    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset?.quantity.value).toBe('50');
  });

  it('TRANSFER_OUT should decrease quantity and respect long-only constraint', () => {
    const s = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '50',
        tradeDate: '2026-01-10',
      })
      .transferOut({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '60',
        tradeDate: '2026-01-15',
      });

    expect(() => s.replay()).toThrow(NegativePositionError);
  });

  it('Transfer between accounts should preserve portfolio-level total quantity invariant', () => {
    const result = scenario()
      // 1. Buy 100 in XP
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        tradeDate: '2026-01-10',
      })
      // 2. Transfer 40 out from XP
      .transferOut({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '40',
        tradeDate: '2026-01-15',
      })
      // 3. Transfer 40 in to NuInvest
      .transferIn({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        tradeDate: '2026-01-15',
      })
      .replay();

    expect(result.appliedTransactions).toHaveLength(3);

    // Account level
    const xp = result.state.accounts.get(String(ACCOUNT_XP));
    expect(xp?.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('60');

    const nu = result.state.accounts.get(String(ACCOUNT_NU));
    expect(nu?.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('40');

    // Aggregated portfolio level invariant: 60 + 40 = 100
    const agg = result.state.assets.get(String(ASSET_PETR4));
    expect(agg?.quantity.value).toBe('100');
  });
});
