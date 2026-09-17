import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: As-Of Cutoffs with Transfers (Phase 1F)', () => {
  it('should accurately represent in-transit custody between transfer legs without retroactive teleportation', () => {
    // 1. Buy 100 @ 10.00 in XP on 2026-01-05
    // 2. TRANSFER_OUT 40 shares from XP on 2026-01-10 (transferGroupId: 'tg-cross-date')
    // 3. TRANSFER_IN 40 shares into NU on 2026-01-12 (transferGroupId: 'tg-cross-date')
    const s = scenario()
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
        transferGroupId: 'tg-cross-date',
        outTradeDate: '2026-01-10',
        inTradeDate: '2026-01-12',
      });

    // --- Cutoff 1: As-of 2026-01-08 (Before any transfer) ---
    const replayBefore = s.asOf('2026-01-08').replay();
    expect(replayBefore.appliedTransactions).toHaveLength(1);
    const xpPosBefore = replayBefore.state.accounts
      .get(String(ACCOUNT_XP))!
      .assets.get(String(ASSET_PETR4))!;
    expect(xpPosBefore.quantity.value).toBe('100');
    expect(xpPosBefore.totalCost?.amount).toBe('1000');
    expect(replayBefore.state.accounts.has(String(ACCOUNT_NU))).toBe(false);

    // --- Cutoff 2: As-of 2026-01-11 (Between OUT and IN legs — In Transit) ---
    const replayMid = s.asOf('2026-01-11').replay();
    // Replay sees BUY and TRANSFER_OUT (TRANSFER_IN is filtered out because tradeDate 2026-01-12 > 2026-01-11)
    expect(replayMid.appliedTransactions).toHaveLength(2);

    // XP has already transferred out 40 shares -> 60 remaining @ 10.00 (cost 600)
    const xpPosMid = replayMid.state.accounts
      .get(String(ACCOUNT_XP))!
      .assets.get(String(ASSET_PETR4))!;
    expect(xpPosMid.quantity.value).toBe('60');
    expect(xpPosMid.totalCost?.amount).toBe('600');
    expect(xpPosMid.averageCost?.amount).toBe('10');

    // NU has not yet received custody -> does not hold position at this cutoff
    expect(replayMid.state.accounts.has(String(ACCOUNT_NU))).toBe(false);

    // Consolidated portfolio at this cutoff reflects custody in transit (60 shares, cost 600)
    const portPosMid = replayMid.state.assets.get(String(ASSET_PETR4))!;
    expect(portPosMid.quantity.value).toBe('60');
    expect(portPosMid.totalCost?.amount).toBe('600');

    // --- Cutoff 3: As-of 2026-01-15 (After completed transfer) ---
    const replayAfter = s.asOf('2026-01-15').replay();
    expect(replayAfter.appliedTransactions).toHaveLength(3);

    // XP has 60 @ 10.00
    const xpPosAfter = replayAfter.state.accounts
      .get(String(ACCOUNT_XP))!
      .assets.get(String(ASSET_PETR4))!;
    expect(xpPosAfter.quantity.value).toBe('60');
    expect(xpPosAfter.totalCost?.amount).toBe('600');

    // NU has 40 @ 10.00
    const nuPosAfter = replayAfter.state.accounts
      .get(String(ACCOUNT_NU))!
      .assets.get(String(ASSET_PETR4))!;
    expect(nuPosAfter.quantity.value).toBe('40');
    expect(nuPosAfter.totalCost?.amount).toBe('400');
    expect(nuPosAfter.averageCost?.amount).toBe('10');
    expect(nuPosAfter.costBasisStatus).toBe('KNOWN');

    // Consolidated portfolio is fully restored (100 shares @ 10.00, total cost 1000)
    const portPosAfter = replayAfter.state.assets.get(String(ASSET_PETR4))!;
    expect(portPosAfter.quantity.value).toBe('100');
    expect(portPosAfter.totalCost?.amount).toBe('1000');
    expect(portPosAfter.averageCost?.amount).toBe('10');
  });
});
