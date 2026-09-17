import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine: Transfer and Realized Gain/Loss Interaction (Phase 1F)', () => {
  it('should accurately calculate realized gain at destination using transported cost basis and emit zero realized gain on transfer', () => {
    // 1. Account XP buys 100 PETR4 @ 10.00 (Total cost = 1000.00, avg = 10.00)
    // 2. Transfer 40 PETR4 to Account NU (transported cost = 400.00, avg = 10.00)
    // 3. Account NU sells 20 PETR4 @ 15.00:
    //    - Gross proceeds = 300.00
    //    - Cost removed = 20 * 10.00 = 200.00
    //    - Realized gain = 100.00
    // 4. Account XP sells 30 PETR4 @ 20.00:
    //    - Gross proceeds = 600.00
    //    - Cost removed = 30 * 10.00 = 300.00
    //    - Realized gain = 300.00
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
        transferGroupId: 'tg-realized-interact',
        tradeDate: '2026-01-10',
      })
      .sell({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '15.00',
        tradeDate: '2026-01-15',
      })
      .sell({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '30',
        unitPrice: '20.00',
        tradeDate: '2026-01-20',
      })
      .replay();

    // Exactly 2 realized disposals (from the two SELLs, ZERO from the transfer)
    expect(result.state.realizedDisposals).toHaveLength(2);

    const nuDisposal = result.state.realizedDisposals.find(
      (d) => String(d.accountId) === String(ACCOUNT_NU),
    )!;
    expect(nuDisposal.quantity.value).toBe('20');
    expect(nuDisposal.costBasisRemoved?.amount).toBe('200');
    expect(nuDisposal.realizedGainLoss?.amount).toBe('100');
    expect(nuDisposal.status).toBe('KNOWN');

    const xpDisposal = result.state.realizedDisposals.find(
      (d) => String(d.accountId) === String(ACCOUNT_XP),
    )!;
    expect(xpDisposal.quantity.value).toBe('30');
    expect(xpDisposal.costBasisRemoved?.amount).toBe('300');
    expect(xpDisposal.realizedGainLoss?.amount).toBe('300');
    expect(xpDisposal.status).toBe('KNOWN');

    // Consolidated portfolio realized gain = 100 + 300 = 400
    const portRealizedSummary = result.state.realizedSummary.get('BRL')!;
    expect(portRealizedSummary.realizedGainLoss?.amount).toBe('400');
    expect(portRealizedSummary.costBasisRemoved?.amount).toBe('500');

    // Remaining positions:
    // XP: 100 - 40 - 30 = 30 shares @ 10.00 (cost 300)
    const xpPos = result.state.accounts.get(String(ACCOUNT_XP))!.assets.get(String(ASSET_PETR4))!;
    expect(xpPos.quantity.value).toBe('30');
    expect(xpPos.totalCost?.amount).toBe('300');
    expect(xpPos.averageCost?.amount).toBe('10');

    // NU: 40 - 20 = 20 shares @ 10.00 (cost 200)
    const nuPos = result.state.accounts.get(String(ACCOUNT_NU))!.assets.get(String(ASSET_PETR4))!;
    expect(nuPos.quantity.value).toBe('20');
    expect(nuPos.totalCost?.amount).toBe('200');
    expect(nuPos.averageCost?.amount).toBe('10');

    // Portfolio total: 50 shares @ 10.00 (cost 500)
    const portPos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(portPos.quantity.value).toBe('50');
    expect(portPos.totalCost?.amount).toBe('500');
  });

  it('should yield INCOMPLETE realized gain if destination sells after receiving transfer with incomplete cost basis', () => {
    const result = scenario()
      .transferIn({
        accountId: ACCOUNT_XP,
        assetId: ASSET_PETR4,
        quantity: '50',
        tradeDate: '2026-01-05',
      })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '30',
        transferGroupId: 'tg-incomp-sell',
        tradeDate: '2026-01-10',
      })
      .sell({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '25.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.status).toBe('INCOMPLETE');
    expect(disposal.costBasisRemoved).toBeUndefined();
    expect(disposal.realizedGainLoss).toBeUndefined();
  });
});
