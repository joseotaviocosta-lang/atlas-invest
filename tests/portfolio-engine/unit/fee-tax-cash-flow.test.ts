import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Fee & Tax Standalone Cash Flows', () => {
  it('should record standalone FEE as OPERATIONAL_EXPENSE outflow without altering position quantity or cost basis', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .fee({ amount: '50.00', assetId: ASSET_PETR4, tradeDate: '2026-01-10' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    // Position must be completely unchanged by standalone fee
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('100');
    expect(pos.totalCost?.amount).toBe('1000');
    expect(pos.averageCost?.amount).toBe('10');

    // Standalone fee recorded as cash flow
    expect(result.state.cashFlowEvents).toHaveLength(1);
    const cf = result.state.cashFlowEvents[0]!;
    expect(cf.type).toBe('FEE');
    expect(cf.direction).toBe('OUTFLOW');
    expect(cf.category).toBe('OPERATIONAL_EXPENSE');
    expect(cf.amount.amount).toBe('50');
    expect(String(cf.relatedAssetId)).toBe(String(ASSET_PETR4));
  });

  it('should record standalone TAX as TAX_PAYMENT outflow and accumulate in cashFlowSummary', () => {
    const result = scenario().tax({ amount: '120.00', tradeDate: '2026-01-15' }).replay();

    expect(result.state.cashFlowEvents).toHaveLength(1);
    const cf = result.state.cashFlowEvents[0]!;
    expect(cf.type).toBe('TAX');
    expect(cf.direction).toBe('OUTFLOW');
    expect(cf.category).toBe('TAX_PAYMENT');
    expect(cf.amount.amount).toBe('120');

    const summary = result.state.cashFlowSummary.get('BRL')!;
    expect(summary.totalTaxes.amount).toBe('120');
    expect(summary.totalOutflows.amount).toBe('120');
  });

  it('should NEVER heuristically pair standalone FEE or TAX with a SELL transaction', () => {
    // BUY 100 @ 10 = 1000
    // SELL 50 @ 15 = 750 gross proceeds
    // Standalone FEE on same date: 20
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .sell({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .fee({ amount: '20.00', assetId: ASSET_PETR4, tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0]!;
    // Disposal selling costs must be 0 (FEE was NOT inside the SELL transaction)
    expect(disposal.sellingCosts.amount).toBe('0');
    expect(disposal.grossProceeds.amount).toBe('750');
    expect(disposal.netProceeds.amount).toBe('750');
    expect(disposal.costBasisRemoved?.amount).toBe('500');
    expect(disposal.realizedGainLoss?.amount).toBe('250');

    // Standalone fee is in cashFlowEvents
    expect(result.state.cashFlowEvents).toHaveLength(1);
    expect(result.state.cashFlowEvents[0]!.amount.amount).toBe('20');
  });
});
