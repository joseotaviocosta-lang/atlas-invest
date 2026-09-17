import { describe, it, expect } from 'vitest';
import { TransactionFactory, TRANSACTION_TYPES, TransactionType } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine Core: Exhaustive Transaction Semantics & Zero Drops', () => {
  it('DIVIDEND should not alter quantity and should generate IncomeEvent (applied, 0 deferred)', () => {
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

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    expect(result.state.incomeEvents).toHaveLength(1);
    const inc = result.state.incomeEvents[0];
    expect(inc.transactionId).toBe(div.id);
    expect(inc.type).toBe('DIVIDEND');
    expect(inc.amount.amount).toBe('50');

    // Quantity remains exactly 100
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('100');
  });

  it('SUBSCRIPTION should be applied and increase position quantity and carried cost', () => {
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

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.state.assets.get(String(ASSET_PETR4))?.quantity.value).toBe('120');
    // 1000 + 160 = 1160
    expect(result.state.assets.get(String(ASSET_PETR4))?.totalCost?.amount).toBe('1160');
  });

  it('Exhaustiveness Check: all 16 transaction types must be explicitly handled and applied (16 applied, 0 deferred, never dropped)', () => {
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
      TransactionFactory.createIncome({
        ...commonProps,
        type: 'DIVIDEND',
        amount: '10',
        tradeDate: '2026-01-15',
      }),
      TransactionFactory.createIncome({
        ...commonProps,
        type: 'JCP',
        amount: '10',
        tradeDate: '2026-01-15',
      }),
      TransactionFactory.createIncome({
        ...commonProps,
        type: 'FII_INCOME',
        amount: '10',
        tradeDate: '2026-01-15',
      }),
      TransactionFactory.createSubscription({
        ...commonProps,
        quantity: '5',
        unitPrice: '10',
        tradeDate: '2026-01-16',
      }),
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
      TransactionFactory.createCashMovement({
        ...commonProps,
        type: 'DEPOSIT',
        amount: '100',
        tradeDate: '2026-01-18',
      }),
      TransactionFactory.createCashMovement({
        ...commonProps,
        type: 'WITHDRAWAL',
        amount: '50',
        tradeDate: '2026-01-19',
      }),
      TransactionFactory.createExpense({
        ...commonProps,
        type: 'FEE',
        amount: '5',
        tradeDate: '2026-01-20',
      }),
      TransactionFactory.createExpense({
        ...commonProps,
        type: 'TAX',
        amount: '5',
        tradeDate: '2026-01-21',
      }),
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

    // In Phase 1E, ALL 16 types are applied
    expect(result.appliedTransactions).toHaveLength(16);
    expect(result.deferredEvents).toHaveLength(0);

    // Total must equal 16 (zero drops)
    expect(result.totalProcessedCount).toBe(16);
    expect(result.appliedTransactions.length + result.deferredEvents.length).toBe(16);
  });
});
