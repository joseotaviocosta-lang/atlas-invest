import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Cash Flow Summary (Currency-Segregated Aggregation)', () => {
  it('should accurately compute totalInflows, totalOutflows, netExternalFlow, and subcategories', () => {
    const result = scenario()
      .deposit({ amount: '10000.00', tradeDate: '2026-01-01' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-05' })
      .amortization({ assetId: ASSET_PETR4, amount: '300.00', tradeDate: '2026-01-10' })
      .withdrawal({ amount: '2500.00', tradeDate: '2026-01-15' })
      .fee({ amount: '35.00', tradeDate: '2026-01-20' })
      .tax({ amount: '15.00', tradeDate: '2026-01-20' })
      .replay();

    const summary = result.state.cashFlowSummary.get('BRL');
    expect(summary).toBeDefined();

    // Inflows: DEPOSIT (10000) + AMORTIZATION (300) = 10300
    expect(summary?.totalInflows.amount).toBe('10300');

    // Outflows: WITHDRAWAL (2500) + FEE (35) + TAX (15) = 2550
    expect(summary?.totalOutflows.amount).toBe('2550');

    // External contributions: 10000
    expect(summary?.totalExternalContributions.amount).toBe('10000');

    // External withdrawals: 2500
    expect(summary?.totalExternalWithdrawals.amount).toBe('2500');

    // Net external flow: 10000 - 2500 = 7500
    expect(summary?.netExternalFlow.amount).toBe('7500');

    // Capital returns (Amortization): 300
    expect(summary?.totalCapitalReturns.amount).toBe('300');

    // Fees: 35
    expect(summary?.totalFees.amount).toBe('35');

    // Taxes: 15
    expect(summary?.totalTaxes.amount).toBe('15');
  });

  it('should compute negative netExternalFlow when withdrawals exceed contributions', () => {
    const result = scenario()
      .deposit({ amount: '1000.00', tradeDate: '2026-01-01' })
      .withdrawal({ amount: '3500.00', tradeDate: '2026-01-10' })
      .replay();

    const summary = result.state.cashFlowSummary.get('BRL')!;
    // 1000 - 3500 = -2500
    expect(summary.netExternalFlow.amount).toBe('-2500');
  });
});
