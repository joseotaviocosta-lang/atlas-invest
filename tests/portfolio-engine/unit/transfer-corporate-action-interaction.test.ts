import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: Transfer and Corporate Action Interaction (Phase 1F)', () => {
  it('should interact correctly with SPLIT before transfer', () => {
    // 1. Buy 100 @ 20.00 = 2000.00 in XP
    // 2. SPLIT factor 2:1 on XP -> 200 @ 10.00 (cost 2000)
    // 3. Transfer 80 shares to NU -> carried cost = 80 * 10.00 = 800.00
    // 4. XP remaining: 120 @ 10.00 (cost 1200); NU: 80 @ 10.00 (cost 800)
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-05',
      })
      .split({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        factor: '2',
        tradeDate: '2026-01-08',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '80',
        transferGroupId: 'tg-split-transfer',
        tradeDate: '2026-01-12',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('120');
    expect(xpPos.totalCost?.amount).toBe('1200');
    expect(xpPos.averageCost?.amount).toBe('10');

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('80');
    expect(nuPos.totalCost?.amount).toBe('800');
    expect(nuPos.averageCost?.amount).toBe('10');

    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('200');
    expect(portPos.totalCost?.amount).toBe('2000');
    expect(portPos.averageCost?.amount).toBe('10');
  });

  it('should interact correctly with REVERSE_SPLIT at destination after transfer', () => {
    // 1. Buy 100 @ 10.00 in XP
    // 2. Transfer 40 to NU -> NU has 40 @ 10.00 (cost 400), XP has 60 @ 10.00 (cost 600)
    // 3. REVERSE_SPLIT factor 2 on NU -> NU has 20 @ 20.00 (cost 400)
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-05',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'tg-revsplit-after',
        tradeDate: '2026-01-10',
      })
      .reverseSplit({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        factor: '2',
        tradeDate: '2026-01-15',
      })
      .replay();

    // XP is unaffected by corporate action occurring in NU
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('60');
    expect(xpPos.totalCost?.amount).toBe('600');
    expect(xpPos.averageCost?.amount).toBe('10');

    // NU has transformed quantity and preserved cost
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('20');
    expect(nuPos.totalCost?.amount).toBe('400');
    expect(nuPos.averageCost?.amount).toBe('20');

    // Consolidated portfolio: 60 + 20 = 80 shares, total cost 1000, avg 12.5
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('80');
    expect(portPos.totalCost?.amount).toBe('1000');
    expect(portPos.averageCost?.amount).toBe('12.5');
  });

  it('should interact correctly with AMORTIZATION before transfer', () => {
    // 1. Buy 100 @ 20.00 = 2000.00 in XP
    // 2. Amortization 500.00 in XP -> cost reduced to 1500.00, avg = 15.00
    // 3. Transfer 50 shares to NU -> carried cost = 50 * 15.00 = 750.00
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-05',
      })
      .amortization({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        amount: '500.00',
        tradeDate: '2026-01-08',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        transferGroupId: 'tg-amort-transfer',
        tradeDate: '2026-01-12',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('50');
    expect(xpPos.totalCost?.amount).toBe('750');
    expect(xpPos.averageCost?.amount).toBe('15');

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('50');
    expect(nuPos.totalCost?.amount).toBe('750');
    expect(nuPos.averageCost?.amount).toBe('15');

    // Amortization capital return cash flow is recorded, but transfer emits zero cash flows
    expect(result.state.cashFlowEvents).toHaveLength(1);
    expect(result.state.cashFlowEvents[0].category).toBe('CAPITAL_RETURN');
  });

  it('should interact correctly with BONUS before transfer', () => {
    // 1. Buy 100 @ 10.00 = 1000.00 in XP
    // 2. Bonus 10 shares with assigned cost 100.00 -> 110 shares, cost 1100.00, avg 10.00
    // 3. Transfer 55 shares to NU -> carried cost 550.00, avg 10.00
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-05',
      })
      .bonus({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '10',
        assignedCost: '100.00',
        tradeDate: '2026-01-08',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '55',
        transferGroupId: 'tg-bonus-transfer',
        tradeDate: '2026-01-12',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('55');
    expect(xpPos.totalCost?.amount).toBe('550');
    expect(xpPos.averageCost?.amount).toBe('10');

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('55');
    expect(nuPos.totalCost?.amount).toBe('550');
    expect(nuPos.averageCost?.amount).toBe('10');
  });

  it('should interact correctly with SUBSCRIPTION before transfer', () => {
    // 1. SUBSCRIPTION in XP: 50 shares @ 12.00 = 600.00
    // 2. Transfer 25 shares to NU -> carried cost = 300.00, avg = 12.00
    const result = scenario()
      .subscription({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '12.00',
        tradeDate: '2026-01-05',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '25',
        transferGroupId: 'tg-sub-transfer',
        tradeDate: '2026-01-10',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('25');
    expect(xpPos.totalCost?.amount).toBe('300');
    expect(xpPos.averageCost?.amount).toBe('12');

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('25');
    expect(nuPos.totalCost?.amount).toBe('300');
    expect(nuPos.averageCost?.amount).toBe('12');
  });
});
