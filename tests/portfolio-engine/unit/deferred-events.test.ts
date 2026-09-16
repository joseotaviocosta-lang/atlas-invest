import { describe, it, expect } from 'vitest';
import { TransactionFactory, TRANSACTION_TYPES, TransactionType } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine Core: Deferred Transaction Semantics & Exhaustiveness', () => {
  it('DIVIDEND should not alter quantity and should be recorded in deferredEvents', () => {
    const buy = TransactionFactory.createBuy({
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    const div = TransactionFactory.createIncome({
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      type: 'DIVIDEND',
      amount: '50.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });

    const result = replayPortfolio({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: [buy, div],
    });

    expect(result.appliedTransactions).toHaveLength(1);
    expect(result.deferredEvents).toHaveLength(1);

    const deferred = result.deferredEvents[0];
    expect(deferred.transactionId).toBe(div.id);
    expect(deferred.type).toBe('DIVIDEND');
    expect(deferred.reason).toContain('Dividend payouts require cash ledger balance');

    // Quantity remains exactly 100
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('100');
  });

  it('SUBSCRIPTION should be recognized but deferred without modifying quantity', () => {
    const buy = TransactionFactory.createBuy({
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    const sub = TransactionFactory.createSubscription({
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      quantity: '20',
      unitPrice: '8.00',
      currency: 'BRL',
      tradeDate: '2026-01-20',
    });

    const result = replayPortfolio({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: [buy, sub],
    });

    expect(result.deferredEvents).toHaveLength(1);
    expect(result.deferredEvents[0].type).toBe('SUBSCRIPTION');
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('100');
  });

  it('Exhaustiveness Check: all 16 transaction types must be explicitly handled (8 applied, 8 deferred, never dropped)', () => {
    const commonProps = {
      portfolioId: String(PORTFOLIO_DEFAULT),
      accountId: String(ACCOUNT_XP),
      assetId: String(ASSET_PETR4),
      currency: 'BRL',
      tradeDate: '2026-01-10',
    };

    // Construct valid sequence so corporate actions have an active position to act upon
    const allTypeTransactions = [
      TransactionFactory.createBuy({ ...commonProps, quantity: '100', unitPrice: '10' }),
      TransactionFactory.createSplit({
        ...commonProps,
        type: 'SPLIT',
        factor: '2',
        tradeDate: '2026-01-11',
      }),
      TransactionFactory.createSplit({
        ...commonProps,
        type: 'REVERSE_SPLIT',
        factor: '2',
        tradeDate: '2026-01-12',
      }),
      TransactionFactory.createBonus({
        ...commonProps,
        quantity: '10',
        assignedCost: '50',
        tradeDate: '2026-01-13',
      }),
      TransactionFactory.createAmortization({
        ...commonProps,
        amount: '100',
        tradeDate: '2026-01-14',
      }),
      TransactionFactory.createSell({
        ...commonProps,
        quantity: '5',
        unitPrice: '10',
        tradeDate: '2026-01-15',
      }),
      TransactionFactory.createIncome({ ...commonProps, type: 'DIVIDEND', amount: '10' }),
      TransactionFactory.createIncome({ ...commonProps, type: 'JCP', amount: '10' }),
      TransactionFactory.createIncome({ ...commonProps, type: 'FII_INCOME', amount: '10' }),
      TransactionFactory.createSubscription({ ...commonProps, quantity: '5', unitPrice: '10' }),
      TransactionFactory.createTransfer({
        ...commonProps,
        type: 'TRANSFER_IN',
        quantity: '5',
        tradeDate: '2026-01-17',
      }),
      TransactionFactory.createTransfer({
        ...commonProps,
        type: 'TRANSFER_OUT',
        quantity: '2',
        tradeDate: '2026-01-16',
      }),
      TransactionFactory.createCashMovement({ ...commonProps, type: 'DEPOSIT', amount: '100' }),
      TransactionFactory.createCashMovement({ ...commonProps, type: 'WITHDRAWAL', amount: '50' }),
      TransactionFactory.createExpense({ ...commonProps, type: 'FEE', amount: '5' }),
      TransactionFactory.createExpense({ ...commonProps, type: 'TAX', amount: '5' }),
    ];

    expect(allTypeTransactions).toHaveLength(16);

    const handledTypes = new Set<TransactionType>();
    for (const tx of allTypeTransactions) {
      handledTypes.add(tx.type);
    }
    expect(handledTypes.size).toBe(TRANSACTION_TYPES.length);

    const result = replayPortfolio({
      portfolioId: PORTFOLIO_DEFAULT,
      transactions: allTypeTransactions,
    });

    // 8 types are applied: BUY, SPLIT, REVERSE_SPLIT, BONUS, AMORTIZATION, SELL, TRANSFER_IN, TRANSFER_OUT
    expect(result.appliedTransactions).toHaveLength(8);

    // 8 types are deferred:
    // DIVIDEND, JCP, FII_INCOME, SUBSCRIPTION, DEPOSIT, WITHDRAWAL, FEE, TAX
    expect(result.deferredEvents).toHaveLength(8);

    // Total must equal 16 (zero drops)
    expect(result.totalProcessedCount).toBe(16);
    expect(result.appliedTransactions.length + result.deferredEvents.length).toBe(16);
  });
});
