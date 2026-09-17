import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';
import { CurrencyMismatchError } from '@atlas/portfolio-engine';

describe('Portfolio Engine: Transfer with Existing Destination Position (Phase 1F)', () => {
  it('should apply weighted average cost merge when destination already holds shares of the asset', () => {
    // 1. Account NU already holds: 50 shares @ 20.00 = 1000.00
    // 2. Account XP holds: 100 shares @ 10.00 = 1000.00
    // 3. Transfer 50 shares from XP to NU (carried cost = 50 * 10.00 = 500.00)
    // 4. Expected NU after transfer:
    //    quantity = 50 + 50 = 100
    //    totalCost = 1000.00 + 500.00 = 1500.00
    //    averageCost = 1500.00 / 100 = 15.00
    const result = scenario()
      .buy({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '20.00',
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
        transferGroupId: 'tg-dest-merge-1',
        tradeDate: '2026-01-12',
      })
      .replay();

    // Check NU destination state
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('100');
    expect(nuPos.totalCost?.amount).toBe('1500');
    expect(nuPos.averageCost?.amount).toBe('15');
    expect(nuPos.costBasisStatus).toBe('KNOWN');

    // Check XP origin state (100 - 50 = 50 @ 10.00, cost = 500)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('50');
    expect(xpPos.totalCost?.amount).toBe('500');
    expect(xpPos.averageCost?.amount).toBe('10');

    // Check Consolidated Portfolio: 150 shares, total cost 2000.00, average cost 13.33333333333333333333
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('150');
    expect(portPos.totalCost?.amount).toBe('2000');
    expect(portPos.averageCost?.amount.startsWith('13.3333')).toBe(true);
  });

  it('should handle complex weighted merge scenario from Section 91', () => {
    // Destination: 100 @ 30.00 (cost 3000)
    // Origin: 100 @ 10.00 and 100 @ 20.00 (avg 15.00)
    // Transfer 50 shares (carried cost = 50 * 15.00 = 750.00)
    // Destination after: 150 shares, cost = 3000 + 750 = 3750.00, avg = 3750 / 150 = 25.00
    const result = scenario()
      .buy({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30.00',
        tradeDate: '2026-01-05',
      })
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-06',
      })
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-07',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        transferGroupId: 'tg-sec91',
        tradeDate: '2026-01-10',
      })
      .replay();

    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('150');
    expect(nuPos.totalCost?.amount).toBe('3750');
    expect(nuPos.averageCost?.amount).toBe('25');
    expect(nuPos.costBasisStatus).toBe('KNOWN');
  });

  it('should reject transfer when destination holds position in different currency', () => {
    // XP holds BRL position
    // NU holds USD position of the same assetId
    // Transfer attempted in BRL should fail with CurrencyMismatchError
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          currency: 'BRL',
          tradeDate: '2026-01-05',
        })
        .buy({
          accountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          unitPrice: '5.00',
          currency: 'USD',
          tradeDate: '2026-01-06',
        })
        .transfer({
          fromAccountId: ACCOUNT_XP,
          toAccountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          currency: 'BRL',
          transferGroupId: 'tg-curr-mismatch',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(CurrencyMismatchError);
  });
});
