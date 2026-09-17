import { describe, it, expect } from 'vitest';
import {
  replayPortfolio,
  CrossPortfolioTransactionError,
  DuplicateTransactionError,
  NegativePositionError,
  CurrencyMismatchError,
  InvalidCorporateActionFactorError,
  AmortizationExceedsCostError,
  IncompleteAmortizationCostError,
  EmptyPositionCorporateActionError,
  TransferPairMismatchError,
  DuplicateTransferLegError,
  InvalidTransferGroupError,
  CrossAssetTransferError,
} from '@atlas/portfolio-engine';
import { TransactionFactory } from '@atlas/domain';

describe('Portfolio Engine: Malformed Ledger & Fail-Closed Hardening (Phase 1H)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const otherPortfolioId = 'c0000000-0000-4000-8000-000000000002';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const accountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

  let txSeq = 0;
  function makeTxId(): string {
    txSeq++;
    return `f0000000-0000-4000-8000-${txSeq.toString().padStart(12, '0')}`;
  }

  describe('1. Oversell and Negative Position Violations (Long-Only Invariant)', () => {
    it('fails closed when SELL is attempted before any ownership (empty position)', () => {
      const sellTx = TransactionFactory.createSell({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '50',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [sellTx] });
      }).toThrow(NegativePositionError);
    });

    it('fails closed when SELL quantity strictly exceeds current open position', () => {
      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const oversellTx = TransactionFactory.createSell({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100.000000000000000001',
        unitPrice: '35.00',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, oversellTx] });
      }).toThrow(NegativePositionError);
    });

    it('fails closed when TRANSFER_OUT is attempted on empty position', () => {
      const transferOut = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '20',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [transferOut] });
      }).toThrow(NegativePositionError);
    });

    it('fails closed when TRANSFER_OUT quantity exceeds current open position', () => {
      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '50',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const transferOut = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '60',
        currency: 'BRL',
        tradeDate: '2026-01-12',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, transferOut] });
      }).toThrow(NegativePositionError);
    });
  });

  describe('2. Ledger Integrity & Isolation Violations', () => {
    it('fails closed when duplicate transaction IDs exist in input collection', () => {
      const dupId = makeTxId();
      const buy1 = TransactionFactory.createBuy({
        id: dupId,
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const buy2 = TransactionFactory.createBuy({
        id: dupId, // duplicate ID
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '50',
        unitPrice: '32.00',
        currency: 'BRL',
        tradeDate: '2026-01-12',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buy1, buy2] });
      }).toThrow(DuplicateTransactionError);
    });

    it('fails closed when a transaction belongs to another portfolio (cross-portfolio isolation)', () => {
      const validTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const foreignTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId: otherPortfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '50',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-12',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [validTx, foreignTx] });
      }).toThrow(CrossPortfolioTransactionError);
    });

    it('fails closed when transactions for the same position have conflicting currencies', () => {
      const buyBrl = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const buyUsd = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '50',
        unitPrice: '5.00',
        currency: 'USD',
        tradeDate: '2026-01-12',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyBrl, buyUsd] });
      }).toThrow(CurrencyMismatchError);
    });
  });

  describe('3. Corporate Action Integrity Violations', () => {
    it('fails closed when SPLIT factor is <= 0 or exactly 1 (no-op)', () => {
      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      // Factor = 1 (no-op corporate action)
      const noopSplit = TransactionFactory.createSplit({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'SPLIT',
        factor: '1',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, noopSplit] });
      }).toThrow(InvalidCorporateActionFactorError);
    });

    it('fails closed when REVERSE_SPLIT factor is <= 0 or exactly 1 (no-op)', () => {
      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
      });

      const noopRevSplit = TransactionFactory.createSplit({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'REVERSE_SPLIT',
        factor: '1',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, noopRevSplit] });
      }).toThrow(InvalidCorporateActionFactorError);
    });

    it('fails closed when corporate action is attempted on an empty position', () => {
      const splitTx = TransactionFactory.createSplit({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'SPLIT',
        factor: '2',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [splitTx] });
      }).toThrow(EmptyPositionCorporateActionError);
    });

    it('fails closed when BONUS has quantity <= 0', () => {
      expect(() => {
        TransactionFactory.createBonus({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetPetr4,
          quantity: '0',
          currency: 'BRL',
          tradeDate: '2026-01-15',
        });
      }).toThrow();
    });

    it('fails closed when AMORTIZATION is attempted on an empty position', () => {
      const amortTx = TransactionFactory.createAmortization({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        amount: '100.00',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [amortTx] });
      }).toThrow(EmptyPositionCorporateActionError);
    });

    it('fails closed when AMORTIZATION amount exceeds current carried total cost', () => {
      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '10',
        unitPrice: '10.00', // Total cost = 100.00
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const excessiveAmort = TransactionFactory.createAmortization({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        amount: '150.00', // Exceeds 100.00
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, excessiveAmort] });
      }).toThrow(AmortizationExceedsCostError);
    });

    it('fails closed when AMORTIZATION is attempted on a position with INCOMPLETE cost basis', () => {
      // Unmatched TRANSFER_IN leaves position with INCOMPLETE cost basis
      const unmatchedIn = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_IN',
        quantity: '100',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const amortTx = TransactionFactory.createAmortization({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        amount: '50.00',
        currency: 'BRL',
        tradeDate: '2026-01-15',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [unmatchedIn, amortTx] });
      }).toThrow(IncompleteAmortizationCostError);
    });
  });

  describe('4. Transfer Group Linking & Pairing Violations', () => {
    it('fails closed when transfer group links different assets (cross-asset transfer)', () => {
      const group = `tg-${makeTxId()}`;

      const tout = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '100',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      const tin = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId2,
        assetId: assetVale3, // Different asset!
        type: 'TRANSFER_IN',
        quantity: '100',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [tout, tin] });
      }).toThrow(CrossAssetTransferError);
    });

    it('fails closed when transfer group links mismatched quantities between legs', () => {
      const group = `tg-${makeTxId()}`;

      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const tout = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      const tin = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId2,
        assetId: assetPetr4,
        type: 'TRANSFER_IN',
        quantity: '60', // Mismatched quantity (50 vs 60)
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, tout, tin] });
      }).toThrow(TransferPairMismatchError);
    });

    it('fails closed when duplicate legs of same direction share the same transferGroupId', () => {
      const group = `tg-${makeTxId()}`;

      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const tout1 = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      const tout2 = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT', // Duplicate OUT leg
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, tout1, tout2] });
      }).toThrow(DuplicateTransferLegError);
    });

    it('fails closed when transfer group specifies same account as origin and destination (self-transfer)', () => {
      const group = `tg-${makeTxId()}`;

      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const tout = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      const tin = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1, // Self-transfer: same account
        assetId: assetPetr4,
        type: 'TRANSFER_IN',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, tout, tin] });
      }).toThrow(InvalidTransferGroupError);
    });

    it('fails closed when transfer group has causal inversion (IN tradeDate < OUT tradeDate)', () => {
      const group = `tg-${makeTxId()}`;

      const buyTx = TransactionFactory.createBuy({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '100',
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-01',
      });

      const tout = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        type: 'TRANSFER_OUT',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-15', // Later date
      });

      const tin = TransactionFactory.createTransfer({
        id: makeTxId(),
        portfolioId,
        accountId: accountId2,
        assetId: assetPetr4,
        type: 'TRANSFER_IN',
        quantity: '50',
        currency: 'BRL',
        transferGroupId: group,
        tradeDate: '2026-01-10', // Causal inversion: IN before OUT
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [buyTx, tout, tin] });
      }).toThrow(InvalidTransferGroupError);
    });
  });

  describe('5. Error Atomicity & Fail-Closed Guarantee', () => {
    it('guarantees that an invalid transaction anywhere in the ledger prevents returning any partial valid state', () => {
      // 5 valid transactions followed by 1 fatal oversell
      const validTxs = [
        TransactionFactory.createCashMovement({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          type: 'DEPOSIT',
          amount: '10000.00',
          currency: 'BRL',
          tradeDate: '2026-01-01',
        }),
        TransactionFactory.createBuy({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetPetr4,
          quantity: '100',
          unitPrice: '30.00',
          currency: 'BRL',
          tradeDate: '2026-01-05',
        }),
        TransactionFactory.createIncome({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetPetr4,
          type: 'DIVIDEND',
          amount: '150.00',
          currency: 'BRL',
          tradeDate: '2026-01-15',
        }),
        TransactionFactory.createSplit({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetPetr4,
          type: 'SPLIT',
          factor: '2',
          currency: 'BRL',
          tradeDate: '2026-01-20',
        }),
        TransactionFactory.createSell({
          id: makeTxId(),
          portfolioId,
          accountId: accountId1,
          assetId: assetPetr4,
          quantity: '50',
          unitPrice: '20.00',
          currency: 'BRL',
          tradeDate: '2026-01-25',
        }),
      ];

      const fatalTx = TransactionFactory.createSell({
        id: makeTxId(),
        portfolioId,
        accountId: accountId1,
        assetId: assetPetr4,
        quantity: '500', // Exceeds remaining 150 shares
        unitPrice: '20.00',
        currency: 'BRL',
        tradeDate: '2026-01-28',
      });

      expect(() => {
        replayPortfolio({ portfolioId, transactions: [...validTxs, fatalTx] });
      }).toThrow(NegativePositionError);
    });
  });
});
