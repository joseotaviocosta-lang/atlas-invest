import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: Partial Transfer (Phase 1F)', () => {
  it('should maintain origin average cost when partially transferring custody and transport exact carried cost', () => {
    // 1. Buy 100 @ 10.00 = 1000.00
    // 2. Buy 100 @ 20.00 = 2000.00 -> 200 shares, cost 3000.00, avg 15.00
    // 3. Transfer 50 shares to NU
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-10',
      })
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-11',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        transferGroupId: 'tg-partial-1',
        tradeDate: '2026-01-15',
      })
      .replay();

    // Check origin XP: 150 shares, total cost 2250.00, average cost 15.00
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('150');
    expect(xpPos.totalCost?.amount).toBe('2250');
    expect(xpPos.averageCost?.amount).toBe('15');
    expect(xpPos.costBasisStatus).toBe('KNOWN');

    // Check destination NU: 50 shares, total cost 750.00, average cost 15.00
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('50');
    expect(nuPos.totalCost?.amount).toBe('750');
    expect(nuPos.averageCost?.amount).toBe('15');
    expect(nuPos.costBasisStatus).toBe('KNOWN');

    // Check portfolio consolidated: 200 shares, total cost 3000.00, average cost 15.00
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('200');
    expect(portPos.totalCost?.amount).toBe('3000');
    expect(portPos.averageCost?.amount).toBe('15');
  });

  it('should support multiple consecutive partial transfers preserving proportional cost basis', () => {
    // 100 @ 10 = 1000 in XP
    // Transfer 40 to NU -> XP has 60 @ 10 (600), NU has 40 @ 10 (400)
    // Transfer 20 from NU back to XP -> NU has 20 @ 10 (200), XP has 80 @ 10 (800)
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
        quantity: '40',
        transferGroupId: 'tg-part-seq-1',
        tradeDate: '2026-01-12',
      })
      .transfer({
        fromAccountId: ACCOUNT_NU,
        toAccountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '20',
        transferGroupId: 'tg-part-seq-2',
        tradeDate: '2026-01-14',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('80');
    expect(xpPos.totalCost?.amount).toBe('800');
    expect(xpPos.averageCost?.amount).toBe('10');

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('20');
    expect(nuPos.totalCost?.amount).toBe('200');
    expect(nuPos.averageCost?.amount).toBe('10');

    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('100');
    expect(portPos.totalCost?.amount).toBe('1000');
    expect(portPos.averageCost?.amount).toBe('10');
  });
});
