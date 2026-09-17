import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';
import { createAccountId } from '@atlas/domain';

const ACCOUNT_BTG = createAccountId('d0000000-0000-4000-8000-000000000003');

describe('Portfolio Engine: Matched Transfers (Phase 1F)', () => {
  it('should preserve portfolio quantity, carried cost, and zero realized/income/cashflow on matched transfer', () => {
    // 1. Account XP buys 100 PETR4 @ 30.00 (Total cost = 3000.00, avg = 30.00)
    // 2. Transfer 40 PETR4 from XP to BTG (transferGroupId: 'tg-matched-1')
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '30.00',
        tradeDate: '2026-01-10',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_BTG,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'tg-matched-1',
        outTradeDate: '2026-01-15',
        inTradeDate: '2026-01-15',
      })
      .replay();

    // Invariants check on portfolio level
    expect(result.appliedTransactions).toHaveLength(3); // BUY, TRANSFER_OUT, TRANSFER_IN
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.totalProcessedCount).toBe(3);

    // Zero realized disposals
    expect(result.state.realizedDisposals).toHaveLength(0);
    expect(result.state.realizedSummary.size).toBe(0);

    // Zero income
    expect(result.state.incomeEvents).toHaveLength(0);
    expect(result.state.incomeSummary.size).toBe(0);

    // Zero external cash flow from transfer (only the buy's cost basis, buy is not cash flow event)
    expect(result.state.cashFlowEvents).toHaveLength(0);

    // Audit transfers trail
    expect(result.state.appliedTransfers).toHaveLength(2);
    const outTransfer = result.state.appliedTransfers.find((t) => t.type === 'TRANSFER_OUT')!;
    const inTransfer = result.state.appliedTransfers.find((t) => t.type === 'TRANSFER_IN')!;

    expect(outTransfer.status).toBe('MATCHED');
    expect(outTransfer.transferGroupId).toBe('tg-matched-1');
    expect(String(outTransfer.accountId)).toBe(String(ACCOUNT_XP));
    expect(String(outTransfer.counterpartyAccountId)).toBe(String(ACCOUNT_BTG));
    expect(outTransfer.quantity.value).toBe('40');
    expect(outTransfer.carriedCost?.amount).toBe('1200'); // 40 * 30.00
    expect(outTransfer.costBasisStatus).toBe('KNOWN');

    expect(inTransfer.status).toBe('MATCHED');
    expect(inTransfer.transferGroupId).toBe('tg-matched-1');
    expect(String(inTransfer.accountId)).toBe(String(ACCOUNT_BTG));
    expect(String(inTransfer.counterpartyAccountId)).toBe(String(ACCOUNT_XP));
    expect(inTransfer.quantity.value).toBe('40');
    expect(inTransfer.carriedCost?.amount).toBe('1200');
    expect(inTransfer.costBasisStatus).toBe('KNOWN');

    // Origin Account (XP) state
    const xpAccount = result.state.accounts.get(String(ACCOUNT_XP))!;
    const xpPos = xpAccount.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('60');
    expect(xpPos.totalCost?.amount).toBe('1800');
    expect(xpPos.averageCost?.amount).toBe('30');
    expect(xpPos.costBasisStatus).toBe('KNOWN');
    expect(xpAccount.appliedTransfers).toHaveLength(1);

    // Destination Account (BTG) state
    const btgAccount = result.state.accounts.get(String(ACCOUNT_BTG))!;
    const btgPos = btgAccount.assets.get(String(ASSET_PETR4))!;
    expect(btgPos.quantity.value).toBe('40');
    expect(btgPos.totalCost?.amount).toBe('1200');
    expect(btgPos.averageCost?.amount).toBe('30');
    expect(btgPos.costBasisStatus).toBe('KNOWN');
    expect(btgAccount.appliedTransfers).toHaveLength(1);

    // Consolidated Portfolio state: perfectly preserved
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('100');
    expect(portPos.totalCost?.amount).toBe('3000');
    expect(portPos.averageCost?.amount).toBe('30');
    expect(portPos.costBasisStatus).toBe('KNOWN');
  });

  it('should handle same-day transfer when TRANSFER_IN appears before TRANSFER_OUT in canonical order', () => {
    // IN has earlier createdAt or ID than OUT on the same tradeDate
    const result = scenario()
      .buy({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '50.00',
        tradeDate: '2026-01-10',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '50',
        transferGroupId: 'tg-sameday-in-first',
        tradeDate: '2026-01-12',
        inCreatedAt: new Date('2026-01-12T10:00:00.000Z'),
        outCreatedAt: new Date('2026-01-12T10:00:01.000Z'),
      })
      .replay();

    // Verify consolidated portfolio state
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('100');
    expect(portPos.totalCost?.amount).toBe('5000');
    expect(portPos.averageCost?.amount).toBe('50');

    // XP has 50 @ 50 (cost 2500)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('50');
    expect(xpPos.totalCost?.amount).toBe('2500');
    expect(xpPos.averageCost?.amount).toBe('50');

    // NU has 50 @ 50 (cost 2500)
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('50');
    expect(nuPos.totalCost?.amount).toBe('2500');
    expect(nuPos.averageCost?.amount).toBe('50');
  });
});
