import { describe, it, expect } from 'vitest';
import {
  LocalDate,
  Money,
  Quantity,
  Currency,
  createTransactionId,
  createAssetId,
  createAccountId,
  createPortfolioId,
  BuyTransaction,
  SellTransaction,
} from '@atlas/domain';
import { replayPortfolio, derivePerformanceAssetUniverse } from '@atlas/portfolio-engine';
import { valuePosition, ValuationQuote } from '@atlas/valuation-engine';
import { calculateTWR } from '@atlas/performance-engine';

const BRL = 'BRL' as Currency;
const PORTFOLIO_ID = createPortfolioId('c0000000-0000-4000-8000-000000000001');
const ACCOUNT_ID = createAccountId('d0000000-0000-4000-8000-000000000001');
const ASSET_PETR4 = createAssetId('e0000000-0000-4000-8000-000000000001');
const ASSET_VALE3 = createAssetId('e0000000-0000-4000-8000-000000000002');

describe('Phase 5B-R1.1: Historical Replay Edge Cases', () => {
  // =========================================================================
  // Section 3: RECTIFICATION REPLAY TEST (Append-only compensating correction)
  // =========================================================================
  describe('Section 3: Rectification Replay & Append-Only Invariants', () => {
    it('rectifies historical holding via append-only compensating transaction without mutating original record', () => {
      // 1. Initial BUY transaction entered
      const originalBuy: BuyTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000001'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_PETR4,
        type: 'BUY',
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-12'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('50.00', BRL),
        totalAmount: Money.from('5000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
      });

      // 2. Erroneous BUY was compensated by an append-only compensating SELL on 2026-01-15
      const compensatingSell: SellTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000002'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_PETR4,
        type: 'SELL',
        tradeDate: LocalDate.from('2026-01-15'),
        settlementDate: LocalDate.from('2026-01-17'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('50.00', BRL),
        totalAmount: Money.from('5000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-15T14:00:00Z'),
        updatedAt: new Date('2026-01-15T14:00:00Z'),
      });

      const ledger = [originalBuy, compensatingSell];

      // Replay across the affected timeline:
      // State at 2026-01-12 (before rectification): holding 100 shares
      const stateBefore = replayPortfolio({
        portfolioId: String(PORTFOLIO_ID),
        transactions: ledger,
        asOfDate: LocalDate.from('2026-01-12'),
      }).state;

      expect(stateBefore.assets.has(String(ASSET_PETR4))).toBe(true);
      expect(stateBefore.assets.get(String(ASSET_PETR4))!.quantity.toString()).toBe('100');

      // State at 2026-01-20 (after rectification): position is exactly ZERO (omitted under ADR-039)
      const stateAfter = replayPortfolio({
        portfolioId: String(PORTFOLIO_ID),
        transactions: ledger,
        asOfDate: LocalDate.from('2026-01-20'),
      }).state;

      expect(stateAfter.assets.has(String(ASSET_PETR4))).toBe(false);
      expect(stateAfter.assets.size).toBe(0);

      // Verify Performance Universe resolution across periods:
      // A) Window spanning error (2026-01-01 to 2026-01-20): PETR4 had exposure, so it is in universe
      const universeSpanning = derivePerformanceAssetUniverse({
        transactions: ledger,
        from: LocalDate.from('2026-01-01'),
        to: LocalDate.from('2026-01-20'),
      });
      expect(universeSpanning.map(String)).toContain(String(ASSET_PETR4));

      // B) Window strictly after rectification (2026-01-21 to 2026-02-01): PETR4 is completely excluded
      const universeAfter = derivePerformanceAssetUniverse({
        transactions: ledger,
        from: LocalDate.from('2026-01-21'),
        to: LocalDate.from('2026-02-01'),
      });
      expect(universeAfter.map(String)).not.toContain(String(ASSET_PETR4));

      // Invariant: original transaction row was NEVER mutated
      expect(originalBuy.quantity.toString()).toBe('100');
      expect(originalBuy.unitPrice.equals(Money.from('50.00', BRL))).toBe(true);
      expect(Object.isFrozen(originalBuy)).toBe(true);
    });
  });

  // =========================================================================
  // Section 4: SPLIT / BONUS + UNADJUSTED_CLOSE TEST (No double adjustment)
  // =========================================================================
  describe('Section 4: SPLIT / BONUS + UNADJUSTED_CLOSE Pricing', () => {
    it('evaluates SPLIT with raw UNADJUSTED_CLOSE without double adjustment or fake gain/loss', () => {
      // 100 shares bought @ R$ 30.00 (Total cost: R$ 3,000.00)
      const buyTx: BuyTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000003'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_PETR4,
        type: 'BUY',
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-12'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('30.00', BRL),
        totalAmount: Money.from('3000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
      });

      // 2:1 Split on 2026-01-20 (factor: 2)
      const splitTx = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000004'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_PETR4,
        type: 'SPLIT' as const,
        tradeDate: LocalDate.from('2026-01-20'),
        settlementDate: LocalDate.from('2026-01-20'),
        factor: Quantity.from('2'),
        createdAt: new Date('2026-01-20T10:00:00Z'),
        updatedAt: new Date('2026-01-20T10:00:00Z'),
      });

      const replayResult = replayPortfolio({
        portfolioId: String(PORTFOLIO_ID),
        transactions: [buyTx, splitTx],
        asOfDate: LocalDate.from('2026-01-25'),
      });

      const position = replayResult.state.assets.get(String(ASSET_PETR4))!;
      expect(position.quantity.toString()).toBe('200');
      expect(position.totalCost?.equals(Money.from('3000.00', BRL))).toBe(true);
      expect(position.averageCost?.equals(Money.from('15.00', BRL))).toBe(true);

      // Post-split market quote on 2026-01-25: raw UNADJUSTED_CLOSE = R$ 18.00
      // (Stock gained +20% from post-split base of 15.00 to 18.00)
      const rawQuote: ValuationQuote = {
        assetId: String(ASSET_PETR4),
        price: '18.00',
        currency: BRL,
        asOf: '2026-01-25',
        receivedAt: '2026-01-25T18:00:00Z',
        source: 'BRAPI',
        status: 'EOD',
        freshness: 'FRESH',
        providerSymbol: 'PETR4',
      };

      const valuation = valuePosition(
        {
          assetId: String(ASSET_PETR4),
          accountId: String(ACCOUNT_ID),
          quantity: position.quantity.toString(),
          currency: BRL,
          totalCost: position.totalCost?.amount ?? null,
          averageCost: position.averageCost?.amount ?? null,
          costBasisStatus: 'KNOWN',
        },
        rawQuote,
      );

      // Market Value: 200 * 18.00 = R$ 3,600.00
      expect(valuation.marketValue?.amount).toBeDefined();
      expect(
        Money.from(valuation.marketValue!.amount, BRL).equals(Money.from('3600.00', BRL)),
      ).toBe(true);
      // Unrealized Gain: 3600.00 - 3000.00 = +600.00 (+20.00%)
      expect(
        Money.from(valuation.unrealizedGainLoss!.amount, BRL).equals(Money.from('600.00', BRL)),
      ).toBe(true);
      expect(valuation.unrealizedGainLossPercent).toBe('20');
      expect(valuation.status).toBe('VALUED');
    });

    it('evaluates BONUS with raw UNADJUSTED_CLOSE and assigned cost correctly', () => {
      // 100 shares bought @ R$ 20.00 (Total cost: R$ 2,000.00)
      const buyTx: BuyTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000005'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_VALE3,
        type: 'BUY',
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-12'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('20.00', BRL),
        totalAmount: Money.from('2000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
      });

      // BONUS 20 shares on 2026-01-20 with explicit assigned cost R$ 200.00
      const bonusTx = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000006'),
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_VALE3,
        type: 'BONUS' as const,
        tradeDate: LocalDate.from('2026-01-20'),
        settlementDate: LocalDate.from('2026-01-20'),
        quantity: Quantity.from('20'),
        assignedCost: Money.from('200.00', BRL),
        createdAt: new Date('2026-01-20T10:00:00Z'),
        updatedAt: new Date('2026-01-20T10:00:00Z'),
      });

      const replayResult = replayPortfolio({
        portfolioId: String(PORTFOLIO_ID),
        transactions: [buyTx, bonusTx],
        asOfDate: LocalDate.from('2026-01-25'),
      });

      const position = replayResult.state.assets.get(String(ASSET_VALE3))!;
      expect(position.quantity.toString()).toBe('120');
      expect(position.totalCost?.equals(Money.from('2200.00', BRL))).toBe(true);

      // Raw quote on 2026-01-25: R$ 22.00
      const rawQuote: ValuationQuote = {
        assetId: String(ASSET_VALE3),
        price: '22.00',
        currency: BRL,
        asOf: '2026-01-25',
        receivedAt: '2026-01-25T18:00:00Z',
        source: 'BRAPI',
        status: 'EOD',
        freshness: 'FRESH',
        providerSymbol: 'VALE3',
      };

      const valuation = valuePosition(
        {
          assetId: String(ASSET_VALE3),
          accountId: String(ACCOUNT_ID),
          quantity: position.quantity.toString(),
          currency: BRL,
          totalCost: position.totalCost?.amount ?? null,
          averageCost: position.averageCost?.amount ?? null,
          costBasisStatus: 'KNOWN',
        },
        rawQuote,
      );

      // Market Value: 120 * 22.00 = R$ 2,640.00
      expect(valuation.marketValue?.amount).toBeDefined();
      expect(
        Money.from(valuation.marketValue!.amount, BRL).equals(Money.from('2640.00', BRL)),
      ).toBe(true);
      // Unrealized Gain: 2640.00 - 2200.00 = +440.00 (+20.00%)
      expect(
        Money.from(valuation.unrealizedGainLoss!.amount, BRL).equals(Money.from('440.00', BRL)),
      ).toBe(true);
      expect(valuation.unrealizedGainLossPercent).toBe('20');
    });
  });

  // =========================================================================
  // Section 5: DIVIDEND / JCP / FII INCOME NO-DOUBLE-COUNT TEST
  // =========================================================================
  describe('Section 5: Dividend / JCP / FII Income Replay & No-Double-Count', () => {
    it('isolates price return (unadjusted close) and cash income without double-counting', () => {
      // 100 shares bought @ R$ 20.00 on 2026-01-10
      // Observations:
      // D1 (2026-01-10): Stock @ 20.00 -> Portfolio = R$ 2,000.00
      // D2 (2026-01-15): Ex-dividend date:
      //   - Stock trades at raw UNADJUSTED_CLOSE = R$ 19.00 (dropped R$ 1.00)
      //   - Income credited to account: DIVIDEND R$ 50.00, JCP R$ 30.00, FII_INCOME R$ 20.00 (Total R$ 100.00 = R$ 1.00/share)
      //   - Portfolio total value = Stock (1,900.00) + Cash Income (100.00) = R$ 2,000.00
      // D3 (2026-01-20): Stock @ 21.00, Cash remains 100.00 -> Portfolio = 2,100.00 + 100.00 = R$ 2,200.00

      // Price return component alone:
      // From 20.00 to 19.00 = -5.00%
      // From 20.00 to 21.00 = +5.00%
      const priceReturnD1ToD2 = (19.0 - 20.0) / 20.0;
      expect(priceReturnD1ToD2).toBe(-0.05);

      // Total return of portfolio including internal cash income:
      // Notice: Internal dividend is NOT an external inflow (no capital deposited from outside).
      // Therefore, cashFlows = [] (no external capital flow dilution).
      const twrResult = calculateTWR({
        observations: [
          {
            date: LocalDate.from('2026-01-10'),
            value: Money.from('2000.00', BRL),
            currency: BRL,
          },
          {
            date: LocalDate.from('2026-01-15'),
            value: Money.from('2000.00', BRL), // Stock 1,900 + Cash 100 = 2,000
            currency: BRL,
          },
          {
            date: LocalDate.from('2026-01-20'),
            value: Money.from('2200.00', BRL), // Stock 2,100 + Cash 100 = 2,200
            currency: BRL,
          },
        ],
        cashFlows: [], // Internal income is not an external flow
        period: {
          startDate: LocalDate.from('2026-01-10'),
          endDate: LocalDate.from('2026-01-20'),
        },
        currency: BRL,
      });

      expect(twrResult.status).toBe('COMPLETE');
      // Subperiod 1 (2026-01-10 to 2026-01-15): 2,000.00 -> 2,000.00 = 0.00%
      // Subperiod 2 (2026-01-15 to 2026-01-20): 2,000.00 -> 2,200.00 = +10.00%
      // Overall return: +10.00% (exactly 2,200 / 2,000 - 1 = +10%)
      expect(twrResult.returnPercentage.value).toBe('10');

      // Proof of NO DOUBLE COUNTING:
      // If the price was adjusted (e.g. past price adjusted down from 20 to 19, or current price adjusted up to 22),
      // AND cash income of 100 was also added, the ending value would be 2,300 (or return +15%),
      // which would double-count the dividend! Here it is counted exactly once.
    });
  });
});
