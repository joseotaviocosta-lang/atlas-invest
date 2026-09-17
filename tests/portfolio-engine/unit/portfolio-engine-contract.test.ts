import { describe, it, expect } from 'vitest';
import { TransactionFactory, TransactionType, Money, Quantity } from '@atlas/domain';
import {
  replayPortfolio,
  PortfolioReplayEngine,
  PORTFOLIO_ENGINE_VERSION,
  OversellError,
} from '@atlas/portfolio-engine';

describe('Portfolio Engine 1.0 Contract Freeze & Formal Specification', () => {
  const portfolioId = 'a1111111-1111-4000-8000-000000000001';
  const acc1 = 'b1111111-1111-4000-8000-000000000001';
  const acc2 = 'b2222222-2222-4000-8000-000000000002';
  const asset1 = 'c1111111-1111-4000-8000-000000000001';

  let txSeq = 0;
  function nextId(): string {
    txSeq++;
    return `f0000000-0000-4000-8000-${txSeq.toString().padStart(12, '0')}`;
  }

  it('Contract Freeze: Engine version is 1.0.0-rc.1', () => {
    expect(PORTFOLIO_ENGINE_VERSION).toBe('1.0.0-rc.1');
    const engine = new PortfolioReplayEngine();
    expect(engine.version).toBe('1.0.0-rc.1');
  });

  describe('Semantics Matrix for All 16 Transaction Types', () => {
    const allTypes: TransactionType[] = [
      'BUY',
      'SELL',
      'DIVIDEND',
      'JCP',
      'FII_INCOME',
      'SPLIT',
      'REVERSE_SPLIT',
      'BONUS',
      'SUBSCRIPTION',
      'AMORTIZATION',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'DEPOSIT',
      'WITHDRAWAL',
      'FEE',
      'TAX',
    ];

    it('has exactly 16 supported transaction types in specification', () => {
      expect(allTypes).toHaveLength(16);
    });

    it('BUY: increases quantity and total cost, neutral to income and realized P&L', () => {
      const tx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '25.00',
        fees: '5.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const { state } = replayPortfolio({ portfolioId, transactions: [tx] });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('2505.00', 'BRL'))).toBe(true);
      expect(state.realizedDisposals).toHaveLength(0);
      expect(state.incomeEvents).toHaveLength(0);
      expect(state.cashFlowEvents).toHaveLength(0); // Trade settlement does not produce external cash flow event
    });

    it('SELL: decreases quantity and total cost, produces realized disposal, neutral to income', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const sellTx = TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '40',
        unitPrice: '30.00',
        fees: '10.00',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });
      const { state } = replayPortfolio({ portfolioId, transactions: [buyTx, sellTx] });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('60'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('1200.00', 'BRL'))).toBe(true);
      expect(asset?.averageCost?.equals(Money.from('20.00', 'BRL'))).toBe(true);

      expect(state.realizedDisposals).toHaveLength(1);
      const disposal = state.realizedDisposals[0];
      expect(disposal.grossProceeds.equals(Money.from('1200.00', 'BRL'))).toBe(true);
      expect(disposal.netProceeds.equals(Money.from('1190.00', 'BRL'))).toBe(true);
      expect(disposal.costBasisRemoved?.equals(Money.from('800.00', 'BRL'))).toBe(true);
      expect(disposal.realizedGainLoss?.equals(Money.from('390.00', 'BRL'))).toBe(true);
      expect(state.incomeEvents).toHaveLength(0);
    });

    it('DIVIDEND, JCP, FII_INCOME: neutral to quantity and cost basis, produces income event', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const divTx = TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'DIVIDEND',
        amount: '100.00',
        currency: 'BRL',
        tradeDate: '2026-02-01',
      });
      const jcpTx = TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'JCP',
        amount: '85.00',
        currency: 'BRL',
        tradeDate: '2026-02-05',
      });
      const fiiTx = TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'FII_INCOME',
        amount: '50.00',
        currency: 'BRL',
        tradeDate: '2026-02-10',
      });

      const { state } = replayPortfolio({
        portfolioId,
        transactions: [buyTx, divTx, jcpTx, fiiTx],
      });

      const asset = state.assets.get(asset1);
      // Invariant: Income neutrality on position
      expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('2000.00', 'BRL'))).toBe(true);
      expect(asset?.averageCost?.equals(Money.from('20.00', 'BRL'))).toBe(true);

      expect(state.incomeEvents).toHaveLength(3);
      expect(state.realizedDisposals).toHaveLength(0);
    });

    it('SPLIT & REVERSE_SPLIT: transform quantity, preserve total cost, neutral to income and realized P&L', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const splitTx = TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'SPLIT',
        factor: '3.0',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });
      const revSplitTx = TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'REVERSE_SPLIT',
        factor: '3',
        currency: 'BRL',
        tradeDate: '2026-01-20',
      });

      const { state } = replayPortfolio({
        portfolioId,
        transactions: [buyTx, splitTx, revSplitTx],
      });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('3000.00', 'BRL'))).toBe(true);
      expect(asset?.averageCost?.equals(Money.from('30.00', 'BRL'))).toBe(true);
      expect(state.appliedCorporateActions).toHaveLength(2);
      expect(state.realizedDisposals).toHaveLength(0);
      expect(state.incomeEvents).toHaveLength(0);
    });

    it('BONUS: increases quantity, incorporates assigned cost, neutral to income and realized P&L', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const bonusTx = TransactionFactory.createBonus({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '20',
        assignedCost: '300.00',
        currency: 'BRL',
        tradeDate: '2026-01-20',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [buyTx, bonusTx] });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('120'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('2300.00', 'BRL'))).toBe(true);
      expect(state.appliedCorporateActions).toHaveLength(1);
      expect(state.realizedDisposals).toHaveLength(0);
    });

    it('SUBSCRIPTION: increases quantity and total cost, neutral to income and realized P&L', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const subTx = TransactionFactory.createSubscription({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '50',
        unitPrice: '15.00',
        currency: 'BRL',
        tradeDate: '2026-01-25',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [buyTx, subTx] });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('150'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('2750.00', 'BRL'))).toBe(true);
      expect(state.realizedDisposals).toHaveLength(0);
    });

    it('AMORTIZATION: reduces total cost, quantity unchanged, produces CAPITAL_RETURN cash flow', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '50.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const amortTx = TransactionFactory.createAmortization({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        amount: '1000.00',
        currency: 'BRL',
        tradeDate: '2026-02-01',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [buyTx, amortTx] });

      const asset = state.assets.get(asset1);
      expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
      expect(asset?.totalCost?.equals(Money.from('4000.00', 'BRL'))).toBe(true);
      expect(asset?.averageCost?.equals(Money.from('40.00', 'BRL'))).toBe(true);
      expect(state.appliedCorporateActions).toHaveLength(1);
      expect(state.cashFlowEvents).toHaveLength(1);
      expect(state.cashFlowEvents[0].category).toBe('CAPITAL_RETURN');
    });

    it('TRANSFER_OUT & TRANSFER_IN: moves quantity and carried cost across accounts, portfolio consolidated invariant', () => {
      const group = 'grp-001';
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '40.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const outTx = TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        type: 'TRANSFER_OUT',
        quantity: '60',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-20',
      });
      const inTx = TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: asset1,
        type: 'TRANSFER_IN',
        quantity: '60',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-20',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [buyTx, outTx, inTx] });

      // Account 1: 40 shares @ 40.00
      const acc1Pos = state.accounts.get(acc1)?.assets.get(asset1);
      expect(acc1Pos?.quantity.equals(Quantity.from('40'))).toBe(true);
      expect(acc1Pos?.totalCost?.equals(Money.from('1600.00', 'BRL'))).toBe(true);

      // Account 2: 60 shares @ 40.00
      const acc2Pos = state.accounts.get(acc2)?.assets.get(asset1);
      expect(acc2Pos?.quantity.equals(Quantity.from('60'))).toBe(true);
      expect(acc2Pos?.totalCost?.equals(Money.from('2400.00', 'BRL'))).toBe(true);

      // Consolidated: 100 shares @ 40.00
      const consPos = state.assets.get(asset1);
      expect(consPos?.quantity.equals(Quantity.from('100'))).toBe(true);
      expect(consPos?.totalCost?.equals(Money.from('4000.00', 'BRL'))).toBe(true);

      expect(state.appliedTransfers).toHaveLength(2);
      expect(state.realizedDisposals).toHaveLength(0);
      expect(state.cashFlowEvents).toHaveLength(0); // Transfer is internal custody, 0 external cash flow
    });

    it('DEPOSIT & WITHDRAWAL: external cash movements, neutral to positions and realized P&L', () => {
      const depTx = TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'DEPOSIT',
        amount: '20000.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });
      const withTx = TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'WITHDRAWAL',
        amount: '5000.00',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [depTx, withTx] });

      expect(state.assets.size).toBe(0);
      expect(state.cashFlowEvents).toHaveLength(2);
      const cfSummary = state.cashFlowSummary.get('BRL');
      expect(cfSummary?.totalExternalContributions.equals(Money.from('20000.00', 'BRL'))).toBe(
        true,
      );
      expect(cfSummary?.totalExternalWithdrawals.equals(Money.from('5000.00', 'BRL'))).toBe(true);
      expect(cfSummary?.netExternalFlow.equals(Money.from('15000.00', 'BRL'))).toBe(true);
    });

    it('FEE & TAX: expenses recorded in cash flows, neutral to positions and realized P&L', () => {
      const feeTx = TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'FEE',
        amount: '50.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });
      const taxTx = TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'TAX',
        amount: '120.00',
        currency: 'BRL',
        tradeDate: '2026-01-12',
      });

      const { state } = replayPortfolio({ portfolioId, transactions: [feeTx, taxTx] });

      expect(state.assets.size).toBe(0);
      expect(state.cashFlowEvents).toHaveLength(2);
      const cfSummary = state.cashFlowSummary.get('BRL');
      expect(cfSummary?.totalFees.equals(Money.from('50.00', 'BRL'))).toBe(true);
      expect(cfSummary?.totalTaxes.equals(Money.from('120.00', 'BRL'))).toBe(true);
    });
  });

  describe('Derived Results Matrix and Structural Containers', () => {
    it('guarantees presence and frozen status of all 12 structural containers', () => {
      const buyTx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '50',
        unitPrice: '10.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });
      const result = replayPortfolio({ portfolioId, transactions: [buyTx] });
      const { state } = result;

      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.assets)).toBe(true);
      expect(Object.isFrozen(state.accounts)).toBe(true);
      expect(Object.isFrozen(state.realizedDisposals)).toBe(true);
      expect(Object.isFrozen(state.realizedSummary)).toBe(true);
      expect(Object.isFrozen(state.appliedCorporateActions)).toBe(true);
      expect(Object.isFrozen(state.incomeEvents)).toBe(true);
      expect(Object.isFrozen(state.incomeSummary)).toBe(true);
      expect(Object.isFrozen(state.cashFlowEvents)).toBe(true);
      expect(Object.isFrozen(state.cashFlowSummary)).toBe(true);
      expect(Object.isFrozen(state.appliedTransfers)).toBe(true);
      expect(Object.isFrozen(result.appliedTransactions)).toBe(true);
      expect(Object.isFrozen(result.deferredEvents)).toBe(true);
    });
  });

  describe('Invariant Catalog Verification', () => {
    it('Invariant 1: Input array immutability', () => {
      const tx = TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: asset1,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });
      const input = [tx];
      const snapshot = [...input];

      replayPortfolio({ portfolioId, transactions: input });

      expect(input).toHaveLength(1);
      expect(input[0]).toBe(snapshot[0]);
    });

    it('Invariant 2: Deterministic replay identical across 100 runs', () => {
      const txs = [
        TransactionFactory.createBuy({
          id: nextId(),
          portfolioId,
          accountId: acc1,
          assetId: asset1,
          quantity: '100',
          unitPrice: '20.00',
          currency: 'BRL',
          tradeDate: '2026-01-01',
        }),
        TransactionFactory.createSell({
          id: nextId(),
          portfolioId,
          accountId: acc1,
          assetId: asset1,
          quantity: '50',
          unitPrice: '25.00',
          currency: 'BRL',
          tradeDate: '2026-01-05',
        }),
      ];

      const firstResult = replayPortfolio({ portfolioId, transactions: txs });

      for (let i = 0; i < 100; i++) {
        const nextResult = replayPortfolio({ portfolioId, transactions: txs });
        expect(nextResult.state.assets.get(asset1)?.quantity.value).toBe(
          firstResult.state.assets.get(asset1)?.quantity.value,
        );
        expect(nextResult.state.assets.get(asset1)?.totalCost?.amount).toBe(
          firstResult.state.assets.get(asset1)?.totalCost?.amount,
        );
        expect(nextResult.state.realizedDisposals[0].realizedGainLoss?.amount).toBe(
          firstResult.state.realizedDisposals[0].realizedGainLoss?.amount,
        );
      }
    });

    it('Invariant 3: Fail closed error atomicity (zero partial state on malformed ledger)', () => {
      const badTxs = [
        TransactionFactory.createSell({
          id: nextId(),
          portfolioId,
          accountId: acc1,
          assetId: asset1,
          quantity: '50',
          unitPrice: '25.00',
          currency: 'BRL',
          tradeDate: '2026-01-01',
        }),
      ];

      expect(() => replayPortfolio({ portfolioId, transactions: badTxs })).toThrow(OversellError);
    });
  });
});
