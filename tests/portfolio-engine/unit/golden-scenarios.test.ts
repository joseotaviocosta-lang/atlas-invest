import { describe, it, expect } from 'vitest';
import { Transaction, TransactionFactory, Money, Quantity } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';

describe('Portfolio Engine 1.0 — Golden Scenarios', () => {
  const portfolioId = 'a1111111-1111-4000-8000-000000000001';
  const acc1 = 'b1111111-1111-4000-8000-000000000001';
  const acc2 = 'b2222222-2222-4000-8000-000000000002';
  const acc3 = 'b3333333-3333-4000-8000-000000000003';

  const assetPetr = 'c1111111-1111-4000-8000-000000000001';
  const assetVale = 'c2222222-2222-4000-8000-000000000002';
  const assetHglg = 'c3333333-3333-4000-8000-000000000003';
  const assetAapl = 'c5555555-5555-4000-8000-000000000005';

  let txSeq = 0;
  function nextId(): string {
    txSeq++;
    return `f0000000-0000-4000-8000-${txSeq.toString().padStart(12, '0')}`;
  }

  it('Scenario 1: 5-year retail investor multi-asset lifecycle', () => {
    const txs: Transaction[] = [];

    // Year 1 (2021): Regular deposits and buys
    txs.push(
      TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'DEPOSIT',
        amount: '10000.00',
        currency: 'BRL',
        tradeDate: '2021-01-10',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '200',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2021-01-15',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetVale,
        quantity: '100',
        unitPrice: '50.00',
        currency: 'BRL',
        tradeDate: '2021-02-15',
      }),
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'DIVIDEND',
        amount: '150.00',
        currency: 'BRL',
        tradeDate: '2021-06-15',
      }),
    );

    // Year 2 (2022): Split and additional buys
    txs.push(
      TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'SPLIT',
        factor: '2.0',
        currency: 'BRL',
        tradeDate: '2022-03-01',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetHglg,
        quantity: '50',
        unitPrice: '160.00',
        currency: 'BRL',
        tradeDate: '2022-04-10',
      }),
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetHglg,
        type: 'FII_INCOME',
        amount: '55.00',
        currency: 'BRL',
        tradeDate: '2022-05-15',
      }),
    );

    // Year 3 (2023): Partial sale of Vale at profit, JCP from Petr
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetVale,
        quantity: '40',
        unitPrice: '70.00',
        fees: '10.00',
        currency: 'BRL',
        tradeDate: '2023-08-20',
      }),
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'JCP',
        amount: '200.00',
        currency: 'BRL',
        tradeDate: '2023-09-15',
      }),
    );

    // Year 4 (2024): Fees and taxes, bonus shares
    txs.push(
      TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'FEE',
        amount: '25.00',
        currency: 'BRL',
        tradeDate: '2024-01-05',
      }),
      TransactionFactory.createBonus({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetVale,
        quantity: '6',
        assignedCost: '300.00',
        currency: 'BRL',
        tradeDate: '2024-06-01',
      }),
      TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'TAX',
        amount: '45.00',
        currency: 'BRL',
        tradeDate: '2024-12-20',
      }),
    );

    // Year 5 (2025): Amortization on FII, final buy
    txs.push(
      TransactionFactory.createAmortization({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetHglg,
        amount: '500.00',
        currency: 'BRL',
        tradeDate: '2025-05-10',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2025-10-15',
      }),
    );

    const { state } = replayPortfolio({ portfolioId, transactions: txs });

    // PETR: initial 200 @ 20.00 (cost 4000) -> split 2:1 -> 400 shares (cost 4000, avg 10) -> buy 100 @ 30 (cost 3000) -> total 500 shares, totalCost = 7000, avg = 14.00
    const petrPos = state.assets.get(assetPetr);
    expect(petrPos).toBeDefined();
    expect(petrPos?.quantity.equals(Quantity.from('500'))).toBe(true);
    expect(petrPos?.totalCost?.equals(Money.from('7000.00', 'BRL'))).toBe(true);
    expect(petrPos?.averageCost?.equals(Money.from('14.00', 'BRL'))).toBe(true);
    expect(petrPos?.costBasisStatus).toBe('KNOWN');

    // VALE: buy 100 @ 50 (cost 5000) -> sell 40 @ 70 (cost removed 2000, realized gain = 40*70 - 10 - 2000 = 790) -> remaining 60 shares (cost 3000, avg 50) -> bonus 6 with assigned cost 300 -> 66 shares, total cost 3300, avg 50.00
    const valePos = state.assets.get(assetVale);
    expect(valePos).toBeDefined();
    expect(valePos?.quantity.equals(Quantity.from('66'))).toBe(true);
    expect(valePos?.totalCost?.equals(Money.from('3300.00', 'BRL'))).toBe(true);
    expect(valePos?.averageCost?.equals(Money.from('50.00', 'BRL'))).toBe(true);

    // HGLG: buy 50 @ 160 (cost 8000) -> amortization 500 -> total cost 7500, avg 150.00, shares 50
    const hglgPos = state.assets.get(assetHglg);
    expect(hglgPos).toBeDefined();
    expect(hglgPos?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(hglgPos?.totalCost?.equals(Money.from('7500.00', 'BRL'))).toBe(true);
    expect(hglgPos?.averageCost?.equals(Money.from('150.00', 'BRL'))).toBe(true);

    // Realized P&L checks
    expect(state.realizedDisposals).toHaveLength(1);
    expect(state.realizedDisposals[0].realizedGainLoss?.equals(Money.from('790.00', 'BRL'))).toBe(
      true,
    );

    // Income summary checks
    expect(state.incomeEvents).toHaveLength(3); // DIVIDEND (150), FII_INCOME (55), JCP (200)
    const incomeTotal = state.incomeEvents.reduce((sum, e) => sum + Number(e.amount.amount), 0);
    expect(incomeTotal).toBe(405.0);

    // Cash flow summary verification
    const cfSummary = state.cashFlowSummary.get('BRL');
    expect(cfSummary).toBeDefined();
    expect(cfSummary?.totalExternalContributions.equals(Money.from('10000.00', 'BRL'))).toBe(true);
    expect(cfSummary?.totalCapitalReturns.equals(Money.from('500.00', 'BRL'))).toBe(true);
    expect(cfSummary?.totalFees.equals(Money.from('25.00', 'BRL'))).toBe(true);
    expect(cfSummary?.totalTaxes.equals(Money.from('45.00', 'BRL'))).toBe(true);
  });

  it('Scenario 2: Multi-broker (3+ accounts) with matched transfers and consolidation', () => {
    const txs: Transaction[] = [];
    const transferGroup1 = 'g1111111-1111-4000-8000-000000000001';
    const transferGroup2 = 'g2222222-2222-4000-8000-000000000002';

    // Account 1 (XP): Buy 100 PETR4 @ 30.00 = 3000.00
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2024-01-10',
      }),
    );

    // Account 2 (BTG): Buy 200 PETR4 @ 36.00 = 7200.00
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        quantity: '200',
        unitPrice: '36.00',
        currency: 'BRL',
        tradeDate: '2024-01-12',
      }),
    );

    // Transfer 1: 50 shares from Account 1 to Account 3 (Clear)
    // Cost transferred: 50 * 30 = 1500.00
    txs.push(
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'TRANSFER_OUT',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: transferGroup1,
        tradeDate: '2024-02-01',
      }),
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc3,
        assetId: assetPetr,
        type: 'TRANSFER_IN',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: transferGroup1,
        tradeDate: '2024-02-01',
      }),
    );

    // Transfer 2: 100 shares from Account 2 to Account 3
    // Cost transferred: 100 * 36 = 3600.00
    txs.push(
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        type: 'TRANSFER_OUT',
        quantity: '100',
        currency: 'BRL',
        transferGroupId: transferGroup2,
        tradeDate: '2024-02-05',
      }),
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc3,
        assetId: assetPetr,
        type: 'TRANSFER_IN',
        quantity: '100',
        currency: 'BRL',
        transferGroupId: transferGroup2,
        tradeDate: '2024-02-05',
      }),
    );

    // Account 3 now has: 50 shares @ 30 (1500) + 100 shares @ 36 (3600) = 150 shares, total cost 5100, avg 34.00
    // Sell 50 shares from Account 3 @ 40.00
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc3,
        assetId: assetPetr,
        quantity: '50',
        unitPrice: '40.00',
        currency: 'BRL',
        tradeDate: '2024-03-01',
      }),
    );

    const { state } = replayPortfolio({ portfolioId, transactions: txs });

    // Account 1: 50 remaining @ 30.00 = 1500.00
    const acc1Pos = state.accounts.get(acc1)?.assets.get(assetPetr);
    expect(acc1Pos?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(acc1Pos?.totalCost?.equals(Money.from('1500.00', 'BRL'))).toBe(true);
    expect(acc1Pos?.averageCost?.equals(Money.from('30.00', 'BRL'))).toBe(true);

    // Account 2: 100 remaining @ 36.00 = 3600.00
    const acc2Pos = state.accounts.get(acc2)?.assets.get(assetPetr);
    expect(acc2Pos?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(acc2Pos?.totalCost?.equals(Money.from('3600.00', 'BRL'))).toBe(true);
    expect(acc2Pos?.averageCost?.equals(Money.from('36.00', 'BRL'))).toBe(true);

    // Account 3: 150 - 50 = 100 remaining @ 34.00 = 3400.00
    const acc3Pos = state.accounts.get(acc3)?.assets.get(assetPetr);
    expect(acc3Pos?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(acc3Pos?.totalCost?.equals(Money.from('3400.00', 'BRL'))).toBe(true);
    expect(acc3Pos?.averageCost?.equals(Money.from('34.00', 'BRL'))).toBe(true);

    // Consolidated: 50 + 100 + 100 = 250 shares, total cost = 1500 + 3600 + 3400 = 8500.00, avg = 34.00
    const consPos = state.assets.get(assetPetr);
    expect(consPos?.quantity.equals(Quantity.from('250'))).toBe(true);
    expect(consPos?.totalCost?.equals(Money.from('8500.00', 'BRL'))).toBe(true);
    expect(consPos?.averageCost?.equals(Money.from('34.00', 'BRL'))).toBe(true);

    // Realized gain on Account 3 sell: 50 * (40 - 34) = 300.00
    expect(state.realizedDisposals).toHaveLength(1);
    expect(state.realizedDisposals[0].realizedGainLoss?.equals(Money.from('300.00', 'BRL'))).toBe(
      true,
    );
    expect(state.realizedDisposals[0].costBasisRemoved?.equals(Money.from('1700.00', 'BRL'))).toBe(
      true,
    );
    expect(state.realizedDisposals[0].netProceeds.equals(Money.from('2000.00', 'BRL'))).toBe(true);
  });

  it('Scenario 3: Incomplete history degradation via unmatched transfer', () => {
    const txs: Transaction[] = [];

    // Initial buy in acc1
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetVale,
        quantity: '100',
        unitPrice: '50.00',
        currency: 'BRL',
        tradeDate: '2024-01-01',
      }),
    );

    // Unmatched TRANSFER_IN to acc2 (no corresponding TRANSFER_OUT)
    txs.push(
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetVale,
        type: 'TRANSFER_IN',
        quantity: '50',
        currency: 'BRL',
        tradeDate: '2024-01-10',
      }),
    );

    // Subsequent BUY in acc2
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetVale,
        quantity: '50',
        unitPrice: '60.00',
        currency: 'BRL',
        tradeDate: '2024-01-15',
      }),
    );

    // SELL in acc2: 30 shares
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetVale,
        quantity: '30',
        unitPrice: '70.00',
        currency: 'BRL',
        tradeDate: '2024-02-01',
      }),
    );

    const { state } = replayPortfolio({ portfolioId, transactions: txs });

    // Acc1 has complete history: 100 shares @ 50.00
    const acc1Pos = state.accounts.get(acc1)?.assets.get(assetVale);
    expect(acc1Pos?.costBasisStatus).toBe('KNOWN');
    expect(acc1Pos?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(acc1Pos?.totalCost?.equals(Money.from('5000.00', 'BRL'))).toBe(true);

    // Acc2 has incomplete history due to unmatched TRANSFER_IN:
    const acc2Pos = state.accounts.get(acc2)?.assets.get(assetVale);
    expect(acc2Pos?.costBasisStatus).toBe('INCOMPLETE');
    expect(acc2Pos?.quantity.equals(Quantity.from('70'))).toBe(true);
    expect(acc2Pos?.totalCost).toBeUndefined();
    expect(acc2Pos?.averageCost).toBeUndefined();

    // Consolidated position is also tainted:
    const consPos = state.assets.get(assetVale);
    expect(consPos?.costBasisStatus).toBe('INCOMPLETE');
    expect(consPos?.quantity.equals(Quantity.from('170'))).toBe(true);
    expect(consPos?.totalCost).toBeUndefined();
    expect(consPos?.averageCost).toBeUndefined();

    // The SELL event in acc2 must have undefined costBasisRemoved and undefined realizedGainLoss
    expect(state.realizedDisposals).toHaveLength(1);
    const sellEvent = state.realizedDisposals[0];
    expect(sellEvent.status).toBe('INCOMPLETE');
    expect(sellEvent.costBasisRemoved).toBeUndefined();
    expect(sellEvent.realizedGainLoss).toBeUndefined();
    expect(sellEvent.netProceeds.equals(Money.from('2100.00', 'BRL'))).toBe(true);
  });

  it('Scenario 4: Corporate action heavy sequence (Split -> Bonus -> Reverse Split -> Amortization)', () => {
    const txs: Transaction[] = [];

    // Step 1: BUY 1000 @ 20.00
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '1000',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2024-01-01',
      }),
    );

    // Step 2: SPLIT 2:1 (factor 2.0) -> 2000 @ 10.00, totalCost 20000.00
    txs.push(
      TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'SPLIT',
        factor: '2.0',
        currency: 'BRL',
        tradeDate: '2024-02-01',
      }),
    );

    // Step 3: BONUS 200 shares with assigned cost 2000.00 (avg remains 10.00) -> 2200 shares, totalCost 22000.00
    txs.push(
      TransactionFactory.createBonus({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '200',
        assignedCost: '2000.00',
        currency: 'BRL',
        tradeDate: '2024-03-01',
      }),
    );

    // Step 4: REVERSE_SPLIT 10:1 (factor 10) -> 220 shares, totalCost 22000.00, avg 100.00
    txs.push(
      TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'REVERSE_SPLIT',
        factor: '10',
        currency: 'BRL',
        tradeDate: '2024-04-01',
      }),
    );

    // Step 5: AMORTIZATION 2200.00 -> reduces totalCost to 19800.00, shares stay 220, avg 90.00
    txs.push(
      TransactionFactory.createAmortization({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        amount: '2200.00',
        currency: 'BRL',
        tradeDate: '2024-05-01',
      }),
    );

    // Step 6: Partial SELL of 20 shares @ 120.00 -> net proceeds 2400.00, cost removed 20 * 90 = 1800.00, gain 600.00
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '20',
        unitPrice: '120.00',
        currency: 'BRL',
        tradeDate: '2024-06-01',
      }),
    );

    const { state } = replayPortfolio({ portfolioId, transactions: txs });

    const pos = state.assets.get(assetPetr);
    expect(pos?.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(pos?.totalCost?.equals(Money.from('19800.00', 'BRL'))).toBe(false); // After 20 shares sold (1800 cost removed), 18000 remains
    expect(pos?.totalCost?.equals(Money.from('18000.00', 'BRL'))).toBe(true);
    expect(pos?.averageCost?.equals(Money.from('90.00', 'BRL'))).toBe(true);

    expect(state.realizedDisposals).toHaveLength(1);
    expect(state.realizedDisposals[0].netProceeds.equals(Money.from('2400.00', 'BRL'))).toBe(true);
    expect(state.realizedDisposals[0].costBasisRemoved?.equals(Money.from('1800.00', 'BRL'))).toBe(
      true,
    );
    expect(state.realizedDisposals[0].realizedGainLoss?.equals(Money.from('600.00', 'BRL'))).toBe(
      true,
    );

    // Verify amortization generated cash flow
    const amortFlow = state.cashFlowEvents.find((cf) => cf.type === 'AMORTIZATION');
    expect(amortFlow).toBeDefined();
    expect(amortFlow?.amount.equals(Money.from('2200.00', 'BRL'))).toBe(true);
  });

  it('Scenario 5: Multi-currency segregation (BRL + USD)', () => {
    const txs: Transaction[] = [];

    // BRL Account
    txs.push(
      TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'DEPOSIT',
        amount: '50000.00',
        currency: 'BRL',
        tradeDate: '2024-01-01',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2024-01-05',
      }),
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'DIVIDEND',
        amount: '200.00',
        currency: 'BRL',
        tradeDate: '2024-02-01',
      }),
    );

    // USD Account
    txs.push(
      TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        type: 'DEPOSIT',
        amount: '10000.00',
        currency: 'USD',
        tradeDate: '2024-01-01',
      }),
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetAapl,
        quantity: '50',
        unitPrice: '150.00',
        currency: 'USD',
        tradeDate: '2024-01-10',
      }),
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetAapl,
        type: 'DIVIDEND',
        amount: '50.00',
        currency: 'USD',
        tradeDate: '2024-02-15',
      }),
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetAapl,
        quantity: '20',
        unitPrice: '180.00',
        currency: 'USD',
        tradeDate: '2024-03-01',
      }),
    );

    const { state } = replayPortfolio({ portfolioId, transactions: txs });

    // Cash flow segregation
    const brlCf = state.cashFlowSummary.get('BRL');
    expect(brlCf?.totalExternalContributions.equals(Money.from('50000.00', 'BRL'))).toBe(true);

    const usdCf = state.cashFlowSummary.get('USD');
    expect(usdCf?.totalExternalContributions.equals(Money.from('10000.00', 'USD'))).toBe(true);

    // Positions segregation
    const petrPos = state.assets.get(assetPetr);
    expect(petrPos?.currency).toBe('BRL');
    expect(petrPos?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(petrPos?.totalCost?.equals(Money.from('3000.00', 'BRL'))).toBe(true);

    const aaplPos = state.assets.get(assetAapl);
    expect(aaplPos?.currency).toBe('USD');
    expect(aaplPos?.quantity.equals(Quantity.from('30'))).toBe(true);
    expect(aaplPos?.totalCost?.equals(Money.from('4500.00', 'USD'))).toBe(true);
    expect(aaplPos?.averageCost?.equals(Money.from('150.00', 'USD'))).toBe(true);

    // Realized P&L in USD only
    expect(state.realizedDisposals).toHaveLength(1);
    const usdRealized = state.realizedDisposals[0];
    expect(usdRealized.currency).toBe('USD');
    expect(usdRealized.netProceeds.equals(Money.from('3600.00', 'USD'))).toBe(true);
    expect(usdRealized.costBasisRemoved?.equals(Money.from('3000.00', 'USD'))).toBe(true);
    expect(usdRealized.realizedGainLoss?.equals(Money.from('600.00', 'USD'))).toBe(true);
  });

  it('Scenario 6: Full 16-action lifecycle (Deposit -> Buy -> Income -> Corporate Actions -> Sell -> Withdraw)', () => {
    const txs: Transaction[] = [];
    const transferGroup = 'g9999999-9999-4000-8000-000000000099';

    // 1. DEPOSIT
    txs.push(
      TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'DEPOSIT',
        amount: '100000.00',
        currency: 'BRL',
        tradeDate: '2024-01-01',
      }),
    );

    // 2. BUY: 500 @ 40.00 (cost 20000.00)
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '500',
        unitPrice: '40.00',
        currency: 'BRL',
        tradeDate: '2024-01-10',
      }),
    );

    // 3. DIVIDEND: 500.00
    txs.push(
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'DIVIDEND',
        amount: '500.00',
        currency: 'BRL',
        tradeDate: '2024-01-20',
      }),
    );

    // 4. SPLIT 2:1 -> 1000 shares @ 20.00 (cost 20000.00)
    txs.push(
      TransactionFactory.createSplit({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'SPLIT',
        factor: '2.0',
        currency: 'BRL',
        tradeDate: '2024-02-01',
      }),
    );

    // 5. TRANSFER_OUT / TRANSFER_IN: 400 shares to acc2
    // Cost transferred: 400 * 20 = 8000.00. Remaining in acc1: 600 @ 20 (cost 12000.00)
    txs.push(
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        type: 'TRANSFER_OUT',
        quantity: '400',
        currency: 'BRL',
        transferGroupId: transferGroup,
        tradeDate: '2024-02-10',
      }),
      TransactionFactory.createTransfer({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        type: 'TRANSFER_IN',
        quantity: '400',
        currency: 'BRL',
        transferGroupId: transferGroup,
        tradeDate: '2024-02-10',
      }),
    );

    // 6. JCP: 300.00 on acc2
    txs.push(
      TransactionFactory.createIncome({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        type: 'JCP',
        amount: '300.00',
        currency: 'BRL',
        tradeDate: '2024-02-20',
      }),
    );

    // 7. SUBSCRIPTION: 100 @ 18.00 in acc2 -> 500 shares in acc2, cost = 8000 + 1800 = 9800.00, avg 19.60
    txs.push(
      TransactionFactory.createSubscription({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        quantity: '100',
        unitPrice: '18.00',
        currency: 'BRL',
        tradeDate: '2024-03-01',
      }),
    );

    // 8. BONUS: 50 shares with assigned cost 500.00 in acc2 -> 550 shares, cost = 10300.00, avg ~18.72727273
    txs.push(
      TransactionFactory.createBonus({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        quantity: '50',
        assignedCost: '500.00',
        currency: 'BRL',
        tradeDate: '2024-03-15',
      }),
    );

    // 9. AMORTIZATION: 550.00 in acc2 -> cost reduced to 9750.00
    txs.push(
      TransactionFactory.createAmortization({
        id: nextId(),
        portfolioId,
        accountId: acc2,
        assetId: assetPetr,
        amount: '550.00',
        currency: 'BRL',
        tradeDate: '2024-04-01',
      }),
    );

    // 10. Partial SELL in acc1: 300 of 600 @ 25.00
    // Cost basis = 300 * 20 = 6000.00. Proceeds = 7500.00. Realized gain = 1500.00. Remaining in acc1: 300 @ 20
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '300',
        unitPrice: '25.00',
        currency: 'BRL',
        tradeDate: '2024-04-15',
      }),
    );

    // 11. FEE & 12. TAX
    txs.push(
      TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'FEE',
        amount: '30.00',
        currency: 'BRL',
        tradeDate: '2024-04-20',
      }),
      TransactionFactory.createExpense({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'TAX',
        amount: '150.00',
        currency: 'BRL',
        tradeDate: '2024-04-25',
      }),
    );

    // 13. Full SELL of remaining 300 in acc1 @ 30.00 -> Acc1 position closed (0 omitted)
    txs.push(
      TransactionFactory.createSell({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '300',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2024-05-01',
      }),
    );

    // 14. BUY again in acc1: 50 @ 28.00 (cost 1400.00)
    txs.push(
      TransactionFactory.createBuy({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        assetId: assetPetr,
        quantity: '50',
        unitPrice: '28.00',
        currency: 'BRL',
        tradeDate: '2024-05-15',
      }),
    );

    // 15. WITHDRAWAL in acc1
    txs.push(
      TransactionFactory.createCashMovement({
        id: nextId(),
        portfolioId,
        accountId: acc1,
        type: 'WITHDRAWAL',
        amount: '10000.00',
        currency: 'BRL',
        tradeDate: '2024-06-01',
      }),
    );

    const result = replayPortfolio({ portfolioId, transactions: txs });
    const { state } = result;

    // Acc1 has 50 shares @ 28.00
    const acc1Pos = state.accounts.get(acc1)?.assets.get(assetPetr);
    expect(acc1Pos?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(acc1Pos?.totalCost?.equals(Money.from('1400.00', 'BRL'))).toBe(true);
    expect(acc1Pos?.averageCost?.equals(Money.from('28.00', 'BRL'))).toBe(true);

    // Acc2 has 550 shares, total cost 9750.00
    const acc2Pos = state.accounts.get(acc2)?.assets.get(assetPetr);
    expect(acc2Pos?.quantity.equals(Quantity.from('550'))).toBe(true);
    expect(acc2Pos?.totalCost?.equals(Money.from('9750.00', 'BRL'))).toBe(true);

    // Consolidated: 600 shares, total cost 11150.00
    const consPos = state.assets.get(assetPetr);
    expect(consPos?.quantity.equals(Quantity.from('600'))).toBe(true);
    expect(consPos?.totalCost?.equals(Money.from('11150.00', 'BRL'))).toBe(true);

    // Applied transactions count matches
    expect(result.appliedTransactions).toHaveLength(txs.length);
    expect(result.deferredEvents).toHaveLength(0);
  });
});
