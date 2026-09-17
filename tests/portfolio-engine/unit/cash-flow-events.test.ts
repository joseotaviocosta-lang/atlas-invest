import { describe, it, expect } from 'vitest';
import { Money, Transaction } from '@atlas/domain';
import {
  replayPortfolio,
  InvalidCashFlowAmountError,
  CurrencyMismatchError,
} from '@atlas/portfolio-engine';
import { scenario } from '../scenario-builder';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Cash Flow Events (DEPOSIT & WITHDRAWAL)', () => {
  it('should record DEPOSIT as external contribution inflow without altering positions', () => {
    const result = scenario()
      .deposit({ amount: '5000.00', tradeDate: '2026-01-05' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    expect(result.state.cashFlowEvents).toHaveLength(1);
    const cf = result.state.cashFlowEvents[0]!;
    expect(cf.type).toBe('DEPOSIT');
    expect(cf.direction).toBe('INFLOW');
    expect(cf.category).toBe('EXTERNAL_CONTRIBUTION');
    expect(cf.amount.amount).toBe('5000');
    expect(cf.currency).toBe('BRL');

    // Asset position remains unaffected by cash deposit itself
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('100');
    expect(pos.totalCost?.amount).toBe('2000');
  });

  it('should record WITHDRAWAL as external withdrawal outflow with positive magnitude amount', () => {
    const result = scenario()
      .deposit({ amount: '5000.00', tradeDate: '2026-01-05' })
      .withdrawal({ amount: '1200.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.state.cashFlowEvents).toHaveLength(2);

    const withdrawalCf = result.state.cashFlowEvents[1]!;
    expect(withdrawalCf.type).toBe('WITHDRAWAL');
    expect(withdrawalCf.direction).toBe('OUTFLOW');
    expect(withdrawalCf.category).toBe('EXTERNAL_WITHDRAWAL');
    // Crucial invariant: amount magnitude is always positive
    expect(withdrawalCf.amount.amount).toBe('1200');
    expect(withdrawalCf.amount.isPositive()).toBe(true);
  });

  it('should reject non-positive cash movement amount with InvalidCashFlowAmountError', () => {
    const invalidTx = {
      id: 'tx-cf-inv-1',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      type: 'DEPOSIT' as const,
      amount: Money.zero('BRL'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-05',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [invalidTx as unknown as Transaction],
      });
    }).toThrow(InvalidCashFlowAmountError);
  });

  it('should reject currency mismatch in cash movement with CurrencyMismatchError', () => {
    const mismatchedTx = {
      id: 'tx-cf-inv-2',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      type: 'WITHDRAWAL' as const,
      amount: Money.from('100.00', 'USD'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-05',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [mismatchedTx as unknown as Transaction],
      });
    }).toThrow(CurrencyMismatchError);
  });
});
