import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Income and Cash Flows Historical Replay (asOfDate Filtering)', () => {
  it('should filter income and cash flow events strictly up to asOfDate', () => {
    // 2026-01-01: DEPOSIT 5000
    // 2026-01-10: BUY 100 @ 10
    // 2026-01-15: DIVIDEND 100
    // 2026-01-20: WITHDRAWAL 1000
    // 2026-01-25: JCP 50
    const s = scenario()
      .deposit({ amount: '5000.00', tradeDate: '2026-01-01' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .dividend({ assetId: ASSET_PETR4, amount: '100.00', tradeDate: '2026-01-15' })
      .withdrawal({ amount: '1000.00', tradeDate: '2026-01-20' })
      .jcp({ assetId: ASSET_PETR4, amount: '50.00', tradeDate: '2026-01-25' });

    // As of 2026-01-15: includes DEPOSIT, BUY, DIVIDEND; excludes WITHDRAWAL, JCP
    const result = s.asOf('2026-01-15').replay();

    expect(result.totalProcessedCount).toBe(3);
    expect(result.appliedTransactions).toHaveLength(3);

    // Income events: only DIVIDEND
    expect(result.state.incomeEvents).toHaveLength(1);
    expect(result.state.incomeEvents[0]!.type).toBe('DIVIDEND');
    expect(result.state.incomeSummary.get('BRL')?.totalDividends.amount).toBe('100');
    expect(result.state.incomeSummary.get('BRL')?.totalJcp.amount).toBe('0');
    expect(result.state.incomeSummary.get('BRL')?.totalIncome.amount).toBe('100');

    // Cash flow events: only DEPOSIT
    expect(result.state.cashFlowEvents).toHaveLength(1);
    expect(result.state.cashFlowEvents[0]!.type).toBe('DEPOSIT');
    expect(result.state.cashFlowSummary.get('BRL')?.totalInflows.amount).toBe('5000');
    expect(result.state.cashFlowSummary.get('BRL')?.totalOutflows.amount).toBe('0');
    expect(result.state.cashFlowSummary.get('BRL')?.netExternalFlow.amount).toBe('5000');
  });
});
