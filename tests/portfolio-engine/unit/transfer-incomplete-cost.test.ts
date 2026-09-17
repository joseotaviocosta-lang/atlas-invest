import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: Transfer Incomplete Cost Handling (Phase 1F)', () => {
  it('should propagate INCOMPLETE status to destination when origin has incomplete cost basis', () => {
    // 1. Account XP receives unmatched TRANSFER_IN (cost is INCOMPLETE)
    // 2. Transfer 40 shares from XP to NU
    // 3. Both XP and NU must have costBasisStatus = INCOMPLETE
    const result = scenario()
      .transferIn({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        tradeDate: '2026-01-05',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'tg-incomp-prop',
        tradeDate: '2026-01-10',
      })
      .replay();

    // Origin XP: 60 shares, INCOMPLETE, cost is undefined (not zero!)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('60');
    expect(xpPos.costBasisStatus).toBe('INCOMPLETE');
    expect(xpPos.totalCost).toBeUndefined();
    expect(xpPos.averageCost).toBeUndefined();

    // Destination NU: 40 shares, INCOMPLETE, cost is undefined (not zero!)
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('40');
    expect(nuPos.costBasisStatus).toBe('INCOMPLETE');
    expect(nuPos.totalCost).toBeUndefined();
    expect(nuPos.averageCost).toBeUndefined();

    // Consolidated Portfolio: 100 shares, INCOMPLETE
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('100');
    expect(portPos.costBasisStatus).toBe('INCOMPLETE');
    expect(portPos.totalCost).toBeUndefined();
    expect(portPos.averageCost).toBeUndefined();
  });

  it('should keep destination INCOMPLETE if destination already held an INCOMPLETE position before transfer', () => {
    // 1. NU receives unmatched TRANSFER_IN (30 shares, INCOMPLETE)
    // 2. XP buys 100 shares @ 10.00 (KNOWN)
    // 3. XP transfers 50 shares to NU (KNOWN)
    // 4. NU now has 80 shares, but must remain INCOMPLETE because past cost is unknown
    const result = scenario()
      .transferIn({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '30',
        tradeDate: '2026-01-05',
      })
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-08',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        transferGroupId: 'tg-dest-already-incomp',
        tradeDate: '2026-01-12',
      })
      .replay();

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('80');
    expect(nuPos.costBasisStatus).toBe('INCOMPLETE');
    expect(nuPos.totalCost).toBeUndefined();
    expect(nuPos.averageCost).toBeUndefined();

    // XP remaining position is KNOWN (50 @ 10.00 = 500)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('50');
    expect(xpPos.totalCost?.amount).toBe('500');
    expect(xpPos.averageCost?.amount).toBe('10');
    expect(xpPos.costBasisStatus).toBe('KNOWN');
  });

  it('should safely handle unmatched TRANSFER_IN as custody arriving without known cost basis', () => {
    const result = scenario()
      .transferIn({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '75',
        tradeDate: '2026-01-10',
      })
      .replay();

    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('75');
    expect(xpPos.costBasisStatus).toBe('INCOMPLETE');
    expect(xpPos.totalCost).toBeUndefined();

    expect(result.state.appliedTransfers).toHaveLength(1);
    expect(result.state.appliedTransfers[0].status).toBe('UNMATCHED_IN');
    expect(result.state.appliedTransfers[0].carriedCost).toBeUndefined();
  });

  it('should safely handle unmatched TRANSFER_OUT as custody leaving portfolio scope without fabricating destination', () => {
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-05',
      })
      .transferOut({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '40',
        tradeDate: '2026-01-10',
      })
      .replay();

    // XP has 60 @ 20.00 (cost 1200)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('60');
    expect(xpPos.totalCost?.amount).toBe('1200');
    expect(xpPos.averageCost?.amount).toBe('20');
    expect(xpPos.costBasisStatus).toBe('KNOWN');

    // Portfolio consolidated holds 60 shares
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('60');
    expect(portPos.totalCost?.amount).toBe('1200');

    // Audit transfer record
    expect(result.state.appliedTransfers).toHaveLength(1);
    expect(result.state.appliedTransfers[0].status).toBe('UNMATCHED_OUT');
    expect(result.state.appliedTransfers[0].carriedCost?.amount).toBe('800');
  });
});
