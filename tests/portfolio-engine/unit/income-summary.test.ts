import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';

describe('Phase 1E: Income Summary (Currency-Segregated Aggregation)', () => {
  it('should aggregate totalDividends, totalJcp, totalFiiIncome, and totalIncome accurately in BRL', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-01' })
      .dividend({ assetId: ASSET_PETR4, amount: '100.50', tradeDate: '2026-01-10' })
      .dividend({ assetId: ASSET_PETR4, amount: '50.25', tradeDate: '2026-01-15' })
      .jcp({ assetId: ASSET_PETR4, amount: '40.00', tradeDate: '2026-01-20' })
      .fiiIncome({ assetId: ASSET_VALE3, amount: '75.00', tradeDate: '2026-01-25' })
      .replay();

    const summary = result.state.incomeSummary.get('BRL');
    expect(summary).toBeDefined();
    expect(summary?.currency).toBe('BRL');

    // 100.50 + 50.25 = 150.75
    expect(summary?.totalDividends.amount).toBe('150.75');
    // 40.00
    expect(summary?.totalJcp.amount).toBe('40');
    // 75.00
    expect(summary?.totalFiiIncome.amount).toBe('75');
    // 150.75 + 40 + 75 = 265.75
    expect(summary?.totalIncome.amount).toBe('265.75');
  });

  it('should segregate income summaries across different currencies (BRL and USD)', () => {
    const result = scenario()
      .dividend({
        assetId: ASSET_PETR4,
        amount: '100.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      })
      .dividend({ assetId: ASSET_VALE3, amount: '25.00', currency: 'USD', tradeDate: '2026-01-12' })
      .jcp({ assetId: ASSET_PETR4, amount: '30.00', currency: 'BRL', tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.incomeSummary.size).toBe(2);

    const brlSummary = result.state.incomeSummary.get('BRL')!;
    expect(brlSummary.totalDividends.amount).toBe('100');
    expect(brlSummary.totalJcp.amount).toBe('30');
    expect(brlSummary.totalIncome.amount).toBe('130');

    const usdSummary = result.state.incomeSummary.get('USD')!;
    expect(usdSummary.totalDividends.amount).toBe('25');
    expect(usdSummary.totalJcp.amount).toBe('0');
    expect(usdSummary.totalIncome.amount).toBe('25');
  });
});
