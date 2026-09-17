import { describe, it, expect } from 'vitest';
import { Money, Transaction } from '@atlas/domain';
import {
  replayPortfolio,
  InvalidIncomeAmountError,
  CurrencyMismatchError,
} from '@atlas/portfolio-engine';
import { scenario } from '../scenario-builder';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';

describe('Phase 1E: Income Events (DIVIDEND, JCP, FII_INCOME)', () => {
  it('should record DIVIDEND without altering position quantity, total cost, or average cost', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .dividend({ assetId: ASSET_PETR4, amount: '150.00', tradeDate: '2026-01-20' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    // Position invariants
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('100');
    expect(pos.totalCost?.amount).toBe('2000');
    expect(pos.averageCost?.amount).toBe('20');
    expect(pos.costBasisStatus).toBe('KNOWN');

    // Income events audit
    expect(result.state.incomeEvents).toHaveLength(1);
    const inc = result.state.incomeEvents[0]!;
    expect(inc.type).toBe('DIVIDEND');
    expect(inc.amount.amount).toBe('150');
    expect(inc.currency).toBe('BRL');
    expect(String(inc.assetId)).toBe(String(ASSET_PETR4));

    // Zero RealizedDisposal emitted
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('should record JCP and FII_INCOME cleanly with their respective types', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .jcp({ assetId: ASSET_PETR4, amount: '80.00', tradeDate: '2026-01-15' })
      .fiiIncome({ assetId: ASSET_VALE3, amount: '120.00', tradeDate: '2026-01-18' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(3);
    expect(result.state.incomeEvents).toHaveLength(2);

    const jcpEvent = result.state.incomeEvents.find((e) => e.type === 'JCP')!;
    expect(jcpEvent).toBeDefined();
    expect(jcpEvent.amount.amount).toBe('80');
    expect(String(jcpEvent.assetId)).toBe(String(ASSET_PETR4));

    const fiiEvent = result.state.incomeEvents.find((e) => e.type === 'FII_INCOME')!;
    expect(fiiEvent).toBeDefined();
    expect(fiiEvent.amount.amount).toBe('120');
    expect(String(fiiEvent.assetId)).toBe(String(ASSET_VALE3));
  });

  it('should allow income events after full position liquidation (ex-date prior to sale, payment date after)', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '25.00', tradeDate: '2026-01-15' })
      .dividend({ assetId: ASSET_PETR4, amount: '50.00', tradeDate: '2026-01-20' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(3);
    // Position is fully liquidated and omitted from active state
    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);

    // Income event is recorded cleanly
    expect(result.state.incomeEvents).toHaveLength(1);
    expect(result.state.incomeEvents[0]!.amount.amount).toBe('50');
    expect(result.state.incomeEvents[0]!.type).toBe('DIVIDEND');

    // Realized disposal from sell is present
    expect(result.state.realizedDisposals).toHaveLength(1);
  });

  it('should reject non-positive income amount with InvalidIncomeAmountError', () => {
    const invalidTx = {
      id: 'tx-inv-1',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'DIVIDEND' as const,
      amount: Money.zero('BRL'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-15',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [invalidTx as unknown as Transaction],
      });
    }).toThrow(InvalidIncomeAmountError);
  });

  it('should reject currency mismatch between transaction currency and income amount currency', () => {
    const mismatchedTx = {
      id: 'tx-inv-2',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'DIVIDEND' as const,
      amount: Money.from('50.00', 'USD'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-15',
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
