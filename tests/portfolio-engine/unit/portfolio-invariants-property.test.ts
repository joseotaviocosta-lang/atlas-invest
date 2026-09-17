import { describe, it, expect } from 'vitest';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { TransactionFactory, Money, Quantity } from '@atlas/domain';

// Linear Congruential Generator with fixed seed
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextDecimal(min: number, max: number, decimals = 2): string {
    const val = this.next() * (max - min) + min;
    return val.toFixed(decimals);
  }
}

describe('Portfolio Engine: Property-Style Invariant Catalog (Phase 1H)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const accountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetId1 = 'e0000000-0000-4000-8000-000000000001';
  const assetId2 = 'e0000000-0000-4000-8000-000000000002';

  let txSeq = 0;
  function makeTxId(): string {
    txSeq++;
    return `f0000000-0000-4000-8000-${txSeq.toString().padStart(12, '0')}`;
  }

  const SEEDS = [42, 1337, 20260917];

  for (const seed of SEEDS) {
    describe(`Seeded Invariant Runs (Seed: ${seed})`, () => {
      it('PROPERTY: Matched Transfer Quantity and Cost Conservation', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 500);
        const buyPrice = prng.nextDecimal(20, 80, 2);
        const transferQty = prng.nextInt(10, buyQty - 10);
        const transferGroup = `tg-${seed}-${makeTxId()}`;

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        // State before transfer
        const stateBefore = replayPortfolio({ portfolioId, transactions: [buyTx] });
        const posBefore = stateBefore.state.assets.get(assetId1)!;

        const tout = TransactionFactory.createTransfer({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          type: 'TRANSFER_OUT',
          quantity: String(transferQty),
          currency: 'BRL',
          transferGroupId: transferGroup,
          tradeDate: '2026-01-10',
        });

        const tin = TransactionFactory.createTransfer({
          id: makeTxId(),
          portfolioId,
          accountId: accountId2,
          assetId: assetId1,
          type: 'TRANSFER_IN',
          quantity: String(transferQty),
          currency: 'BRL',
          transferGroupId: transferGroup,
          tradeDate: '2026-01-10',
        });

        // State after transfer
        const stateAfter = replayPortfolio({ portfolioId, transactions: [buyTx, tout, tin] });
        const posAfter = stateAfter.state.assets.get(assetId1)!;

        // Conservation invariants:
        // 1. Consolidated quantity before == after
        expect(posAfter.quantity.equals(posBefore.quantity)).toBe(true);
        // 2. Consolidated cost before == after
        expect(posAfter.totalCost!.equals(posBefore.totalCost!)).toBe(true);
        // 3. Zero economic realization
        expect(stateAfter.state.realizedDisposals).toHaveLength(0);
        // 4. Zero income emitted
        expect(stateAfter.state.incomeEvents).toHaveLength(0);
        // 5. Zero external cash flow
        expect(stateAfter.state.cashFlowEvents).toHaveLength(0);
      });

      it('PROPERTY: SELL Identity (netProceeds - costBasisRemoved = realizedGainLoss) & Average Cost Invariance', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 300);
        const buyPrice = prng.nextDecimal(20, 50, 2);
        const sellQty = prng.nextInt(10, buyQty - 10);
        const sellPrice = prng.nextDecimal(10, 100, 2);
        const sellCosts = prng.nextDecimal(1, 10, 2);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const sellTx = TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(sellQty),
          unitPrice: sellPrice,
          fees: sellCosts,
          currency: 'BRL',
          tradeDate: '2026-01-15',
        });

        const res = replayPortfolio({ portfolioId, transactions: [buyTx, sellTx] });
        const disposal = res.state.realizedDisposals[0];

        // 1. Exact SELL identity
        const netMinusCost = disposal.netProceeds.subtract(disposal.costBasisRemoved!);
        expect(disposal.realizedGainLoss!.equals(netMinusCost)).toBe(true);

        // 2. Average cost invariance: remaining position has exact same average cost as pre-sale
        const posRemaining = res.state.assets.get(assetId1)!;
        const expectedRemainingQty = Quantity.from(String(buyQty)).subtract(
          Quantity.from(String(sellQty)),
        );
        expect(posRemaining.quantity.equals(expectedRemainingQty)).toBe(true);

        const buyTxCost = Money.from(buyPrice, 'BRL');
        expect(posRemaining.averageCost!.equals(buyTxCost)).toBe(true);
      });

      it('PROPERTY: Position Zero Omission Invariant on Full Liquidation', () => {
        const prng = new SeededRandom(seed);
        const qty = prng.nextInt(50, 200);
        const price = prng.nextDecimal(10, 50, 2);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(qty),
          unitPrice: price,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const sellTx = TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(qty),
          unitPrice: price,
          currency: 'BRL',
          tradeDate: '2026-01-10',
        });

        const res = replayPortfolio({ portfolioId, transactions: [buyTx, sellTx] });

        // Zero positions must be omitted from both account and consolidated assets
        expect(res.state.assets.has(assetId1)).toBe(false);
        const accState = res.state.accounts.get(accountId1);
        if (accState) {
          expect(accState.assets.has(assetId1)).toBe(false);
        }
      });

      it('PROPERTY: Income Neutrality (Δquantity = 0, Δcost = 0)', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 300);
        const buyPrice = prng.nextDecimal(20, 50, 2);
        const divAmount = prng.nextDecimal(50, 200, 2);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const preState = replayPortfolio({ portfolioId, transactions: [buyTx] });
        const prePos = preState.state.assets.get(assetId1)!;

        const divTx = TransactionFactory.createIncome({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          type: 'DIVIDEND',
          amount: divAmount,
          currency: 'BRL',
          tradeDate: '2026-01-15',
        });

        const postState = replayPortfolio({ portfolioId, transactions: [buyTx, divTx] });
        const postPos = postState.state.assets.get(assetId1)!;

        // Invariants: quantity and cost basis are strictly unchanged
        expect(postPos.quantity.equals(prePos.quantity)).toBe(true);
        expect(postPos.totalCost!.equals(prePos.totalCost!)).toBe(true);
        expect(postPos.averageCost!.equals(prePos.averageCost!)).toBe(true);

        // Zero realized disposals
        expect(postState.state.realizedDisposals).toHaveLength(0);
        // Income event emitted
        expect(postState.state.incomeEvents).toHaveLength(1);
        expect(postState.state.incomeEvents[0].amount.equals(Money.from(divAmount, 'BRL'))).toBe(
          true,
        );
      });

      it('PROPERTY: Cash Flow Neutrality on Positions (Δposition = 0)', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 300);
        const buyPrice = prng.nextDecimal(20, 50, 2);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const preState = replayPortfolio({ portfolioId, transactions: [buyTx] });
        const prePos = preState.state.assets.get(assetId1)!;

        const depTx = TransactionFactory.createCashMovement({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          type: 'DEPOSIT',
          amount: '10000.00',
          currency: 'BRL',
          tradeDate: '2026-01-10',
        });

        const withTx = TransactionFactory.createCashMovement({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          type: 'WITHDRAWAL',
          amount: '2000.00',
          currency: 'BRL',
          tradeDate: '2026-01-12',
        });

        const feeTx = TransactionFactory.createExpense({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          type: 'FEE',
          amount: '15.00',
          currency: 'BRL',
          tradeDate: '2026-01-14',
        });

        const postState = replayPortfolio({
          portfolioId,
          transactions: [buyTx, depTx, withTx, feeTx],
        });
        const postPos = postState.state.assets.get(assetId1)!;

        // Position quantity and cost basis strictly unchanged by cash movements
        expect(postPos.quantity.equals(prePos.quantity)).toBe(true);
        expect(postPos.totalCost!.equals(prePos.totalCost!)).toBe(true);
      });

      it('PROPERTY: Split Total Cost Invariance (totalCost_before == totalCost_after)', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 300);
        const buyPrice = prng.nextDecimal(20, 50, 2);
        const factorInt = prng.nextInt(2, 5);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const preState = replayPortfolio({ portfolioId, transactions: [buyTx] });
        const prePos = preState.state.assets.get(assetId1)!;

        const splitTx = TransactionFactory.createSplit({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          type: 'SPLIT',
          factor: String(factorInt),
          currency: 'BRL',
          tradeDate: '2026-01-15',
        });

        const postState = replayPortfolio({ portfolioId, transactions: [buyTx, splitTx] });
        const postPos = postState.state.assets.get(assetId1)!;

        // 1. Total cost preserved bit for bit
        expect(postPos.totalCost!.equals(prePos.totalCost!)).toBe(true);
        // 2. Quantity scaled by factor
        const expectedQty = prePos.quantity.multiply(String(factorInt));
        expect(postPos.quantity.equals(expectedQty)).toBe(true);
        // 3. Average price scaled inversely
        const expectedAvg = postPos.totalCost!.divide(postPos.quantity);
        expect(postPos.averageCost!.equals(expectedAvg)).toBe(true);
      });

      it('PROPERTY: Amortization Quantity Invariance & Cost Reduction (Dual Dimension)', () => {
        const prng = new SeededRandom(seed);
        const buyQty = prng.nextInt(100, 200);
        const buyPrice = '50.00'; // Total cost = buyQty * 50
        const amortPerShare = prng.nextDecimal(1, 10, 2);
        const totalAmort = (Number(amortPerShare) * buyQty).toFixed(2);

        const buyTx = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: String(buyQty),
          unitPrice: buyPrice,
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const preState = replayPortfolio({ portfolioId, transactions: [buyTx] });
        const prePos = preState.state.assets.get(assetId1)!;

        const amortTx = TransactionFactory.createAmortization({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          amount: totalAmort,
          currency: 'BRL',
          tradeDate: '2026-01-15',
        });

        const postState = replayPortfolio({ portfolioId, transactions: [buyTx, amortTx] });
        const postPos = postState.state.assets.get(assetId1)!;

        // 1. Quantity strictly unchanged
        expect(postPos.quantity.equals(prePos.quantity)).toBe(true);
        // 2. Total cost reduced exactly by amortization amount
        const expectedCost = prePos.totalCost!.subtract(Money.from(totalAmort, 'BRL'));
        expect(postPos.totalCost!.equals(expectedCost)).toBe(true);
        // 3. Cash flow event emitted with category CAPITAL_RETURN
        expect(postState.state.cashFlowEvents).toHaveLength(1);
        expect(postState.state.cashFlowEvents[0].category).toBe('CAPITAL_RETURN');
        expect(postState.state.cashFlowEvents[0].amount.equals(Money.from(totalAmort, 'BRL'))).toBe(
          true,
        );
      });

      it('PROPERTY: Segregated Multi-Currency Isolation (Zero Cross-Currency Pollution)', () => {
        const buyBrl = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: '100',
          unitPrice: '30.00',
          currency: 'BRL',
          tradeDate: '2026-01-01',
        });

        const buyUsd = TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId2,
          assetId: assetId2,
          quantity: '50',
          unitPrice: '150.00',
          currency: 'USD',
          tradeDate: '2026-01-02',
        });

        const sellBrl = TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetId1,
          quantity: '50',
          unitPrice: '40.00',
          currency: 'BRL',
          tradeDate: '2026-01-10',
        });

        const sellUsd = TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: accountId2,
          assetId: assetId2,
          quantity: '20',
          unitPrice: '180.00',
          currency: 'USD',
          tradeDate: '2026-01-12',
        });

        const res = replayPortfolio({
          portfolioId,
          transactions: [buyBrl, buyUsd, sellBrl, sellUsd],
        });

        // Realized summaries are strictly segregated by currency key
        const brlSummary = res.state.realizedSummary.get('BRL');
        const usdSummary = res.state.realizedSummary.get('USD');

        expect(brlSummary).toBeDefined();
        expect(usdSummary).toBeDefined();

        expect(brlSummary?.currency).toBe('BRL');
        expect(brlSummary?.disposalCount).toBe(1);
        expect(brlSummary?.netProceeds.equals(Money.from('2000.00', 'BRL'))).toBe(true);
        expect(brlSummary?.costBasisRemoved?.equals(Money.from('1500.00', 'BRL'))).toBe(true);
        expect(brlSummary?.realizedGainLoss?.equals(Money.from('500.00', 'BRL'))).toBe(true);

        expect(usdSummary?.currency).toBe('USD');
        expect(usdSummary?.disposalCount).toBe(1);
        expect(usdSummary?.netProceeds.equals(Money.from('3600.00', 'USD'))).toBe(true);
        expect(usdSummary?.costBasisRemoved?.equals(Money.from('3000.00', 'USD'))).toBe(true);
        expect(usdSummary?.realizedGainLoss?.equals(Money.from('600.00', 'USD'))).toBe(true);
      });
    });
  }
});
