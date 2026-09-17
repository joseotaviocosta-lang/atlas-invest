import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Multi-Account Income & Cash Flow Segregation and Portfolio Aggregation', () => {
  it('should segregate income and cash flows per account and aggregate into portfolio totals', () => {
    // XP Account: Deposit 10,000, Buy 100 @ 10, Dividend 50
    // NU Account: Deposit 5,000, Buy 50 @ 10, JCP 30
    const result = scenario()
      .deposit({ amount: '10000.00', accountId: ACCOUNT_XP, tradeDate: '2026-01-01' })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-05',
      })
      .dividend({
        assetId: ASSET_PETR4,
        amount: '50.00',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-10',
      })
      .deposit({ amount: '5000.00', accountId: ACCOUNT_NU, tradeDate: '2026-01-02' })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '10.00',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-06',
      })
      .jcp({
        assetId: ASSET_PETR4,
        amount: '30.00',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-12',
      })
      .replay();

    // Check Account XP
    const xpAccount = result.state.accounts.get(String(ACCOUNT_XP))!;
    expect(xpAccount.incomeEvents).toHaveLength(1);
    expect(xpAccount.incomeEvents[0]!.type).toBe('DIVIDEND');
    expect(xpAccount.incomeSummary.get('BRL')?.totalIncome.amount).toBe('50');
    expect(xpAccount.cashFlowEvents).toHaveLength(1);
    expect(xpAccount.cashFlowSummary.get('BRL')?.totalInflows.amount).toBe('10000');

    // Check Account NU
    const nuAccount = result.state.accounts.get(String(ACCOUNT_NU))!;
    expect(nuAccount.incomeEvents).toHaveLength(1);
    expect(nuAccount.incomeEvents[0]!.type).toBe('JCP');
    expect(nuAccount.incomeSummary.get('BRL')?.totalIncome.amount).toBe('30');
    expect(nuAccount.cashFlowEvents).toHaveLength(1);
    expect(nuAccount.cashFlowSummary.get('BRL')?.totalInflows.amount).toBe('5000');

    // Portfolio consolidated totals
    expect(result.state.incomeEvents).toHaveLength(2);
    const portIncomeSummary = result.state.incomeSummary.get('BRL')!;
    expect(portIncomeSummary.totalDividends.amount).toBe('50');
    expect(portIncomeSummary.totalJcp.amount).toBe('30');
    expect(portIncomeSummary.totalIncome.amount).toBe('80');

    expect(result.state.cashFlowEvents).toHaveLength(2);
    const portCashFlowSummary = result.state.cashFlowSummary.get('BRL')!;
    expect(portCashFlowSummary.totalExternalContributions.amount).toBe('15000');
    expect(portCashFlowSummary.totalInflows.amount).toBe('15000');
    expect(portCashFlowSummary.netExternalFlow.amount).toBe('15000');
  });
});
