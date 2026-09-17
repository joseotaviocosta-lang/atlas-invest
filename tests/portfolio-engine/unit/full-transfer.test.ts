import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: Full Transfer (Phase 1F)', () => {
  it('should completely remove position from origin and transport full cost basis to destination', () => {
    // 1. Buy 100 PETR4 @ 10.00 = 1000.00 in XP
    // 2. Full transfer 100 PETR4 from XP to NU
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-10',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '100',
        transferGroupId: 'tg-full-1',
        tradeDate: '2026-01-15',
      })
      .replay();

    // Origin account has zero shares, position should be deleted from active assets map
    const xpAssets = result.state.accounts.get(String(ACCOUNT_XP))!.assets;
    expect(xpAssets.has(String(ASSET_PETR4))).toBe(false);

    // Destination account holds full position
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('100');
    expect(nuPos.totalCost?.amount).toBe('1000');
    expect(nuPos.averageCost?.amount).toBe('10');
    expect(nuPos.costBasisStatus).toBe('KNOWN');

    // Consolidated portfolio retains 100 shares @ 10.00
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('100');
    expect(portPos.totalCost?.amount).toBe('1000');
    expect(portPos.averageCost?.amount).toBe('10');
  });

  it('should allow subsequent BUY in origin after full transfer without retaining residual cost basis', () => {
    // 1. Buy 100 @ 10.00 in XP
    // 2. Full transfer 100 to NU
    // 3. Buy 50 @ 25.00 in XP
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-10',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '100',
        transferGroupId: 'tg-full-reenter',
        tradeDate: '2026-01-15',
      })
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '25.00',
        tradeDate: '2026-01-20',
      })
      .replay();

    // XP has only 50 @ 25.00 (cost 1250)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('50');
    expect(xpPos.totalCost?.amount).toBe('1250');
    expect(xpPos.averageCost?.amount).toBe('25');

    // NU has 100 @ 10.00 (cost 1000)
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('100');
    expect(nuPos.totalCost?.amount).toBe('1000');
    expect(nuPos.averageCost?.amount).toBe('10');

    // Portfolio has 150 shares, total cost 2250, avg 15.00
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('150');
    expect(portPos.totalCost?.amount).toBe('2250');
    expect(portPos.averageCost?.amount).toBe('15');
  });
});
