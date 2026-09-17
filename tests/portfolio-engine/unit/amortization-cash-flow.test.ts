import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Amortization Multi-Dimension Cash Flow Component', () => {
  it('should reduce carried cost (Phase 1D) AND record CAPITAL_RETURN cash inflow without double counting', () => {
    // BUY 100 @ 20.00 = 2000.00
    // AMORTIZATION: 500.00
    // Resulting position: 100 shares, total cost 1500.00, average cost 15.00
    // Resulting cash flow: CAPITAL_RETURN INFLOW of 500.00
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-05' })
      .amortization({ assetId: ASSET_PETR4, amount: '500.00', tradeDate: '2026-01-15' })
      .replay();

    // Invariant: exactly 2 applied transactions, 0 deferred
    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    // Dimension 1: Asset position cost basis reduction
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('100');
    expect(pos.totalCost?.amount).toBe('1500');
    expect(pos.averageCost?.amount).toBe('15');

    // Corporate actions audit trail preserved
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    expect(result.state.appliedCorporateActions[0]!.type).toBe('AMORTIZATION');

    // Dimension 2: Cash flow event recorded
    expect(result.state.cashFlowEvents).toHaveLength(1);
    const cf = result.state.cashFlowEvents[0]!;
    expect(cf.type).toBe('AMORTIZATION');
    expect(cf.direction).toBe('INFLOW');
    expect(cf.category).toBe('CAPITAL_RETURN');
    expect(cf.amount.amount).toBe('500');
    expect(String(cf.relatedAssetId)).toBe(String(ASSET_PETR4));

    // Reflected in cashFlowSummary
    const summary = result.state.cashFlowSummary.get('BRL')!;
    expect(summary.totalCapitalReturns.amount).toBe('500');
    expect(summary.totalInflows.amount).toBe('500');
    // netExternalFlow is strictly external contributions - external withdrawals (excludes capital return)
    expect(summary.netExternalFlow.amount).toBe('0');
  });
});
