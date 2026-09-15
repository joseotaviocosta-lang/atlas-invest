import { describe, it, expect } from 'vitest';
import {
  TransactionFactory,
  InvalidTransactionError,
  InvalidLocalDateError,
} from '../../packages/domain/src/index';

describe('Domain: Transaction Ledger Invariants', () => {
  const common = {
    portfolioId: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    assetId: '33333333-3333-4333-8333-333333333333',
    currency: 'BRL',
    tradeDate: '2026-09-15',
  };

  describe('BUY', () => {
    it('should create valid BUY transaction', () => {
      const tx = TransactionFactory.createBuy({
        ...common,
        quantity: '100',
        unitPrice: '25.50',
        fees: '5.00',
      });

      expect(tx.type).toBe('BUY');
      expect(tx.quantity.value).toBe('100');
      expect(tx.unitPrice.amount).toBe('25.5');
      expect(tx.fees?.amount).toBe('5');
    });

    it('should reject BUY with quantity <= 0 or unitPrice < 0', () => {
      expect(() =>
        TransactionFactory.createBuy({
          ...common,
          quantity: '0',
          unitPrice: '25.50',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createBuy({
          ...common,
          quantity: '-10',
          unitPrice: '25.50',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createBuy({
          ...common,
          quantity: '100',
          unitPrice: '-1',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('SELL', () => {
    it('should create valid SELL transaction', () => {
      const tx = TransactionFactory.createSell({
        ...common,
        quantity: '50',
        unitPrice: '30.00',
      });

      expect(tx.type).toBe('SELL');
      expect(tx.quantity.value).toBe('50');
      expect(tx.unitPrice.amount).toBe('30');
    });

    it('should reject SELL with quantity <= 0 or unitPrice < 0', () => {
      expect(() =>
        TransactionFactory.createSell({
          ...common,
          quantity: '0',
          unitPrice: '30.00',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createSell({
          ...common,
          quantity: '-5',
          unitPrice: '30.00',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('Income: DIVIDEND, JCP, FII_INCOME', () => {
    it('should create valid income transaction for positive amounts', () => {
      const div = TransactionFactory.createIncome({
        ...common,
        type: 'DIVIDEND',
        amount: '150.00',
      });
      expect(div.type).toBe('DIVIDEND');
      expect(div.amount.amount).toBe('150');

      const jcp = TransactionFactory.createIncome({
        ...common,
        type: 'JCP',
        amount: '75.25',
      });
      expect(jcp.type).toBe('JCP');

      const fii = TransactionFactory.createIncome({
        ...common,
        type: 'FII_INCOME',
        amount: '200.00',
      });
      expect(fii.type).toBe('FII_INCOME');
    });

    it('should reject income transactions with non-positive amount', () => {
      expect(() =>
        TransactionFactory.createIncome({
          ...common,
          type: 'DIVIDEND',
          amount: '0',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createIncome({
          ...common,
          type: 'JCP',
          amount: '-50',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('Expense: FEE and TAX', () => {
    it('must require positive magnitude for fees and taxes (direction is defined by transaction type)', () => {
      const fee = TransactionFactory.createExpense({
        ...common,
        type: 'FEE',
        amount: '12.50',
      });
      expect(fee.amount.amount).toBe('12.5');

      const tax = TransactionFactory.createExpense({
        ...common,
        type: 'TAX',
        amount: '35.00',
      });
      expect(tax.amount.amount).toBe('35');
    });

    it('should reject negative amounts for fees and taxes to avoid double inversion', () => {
      expect(() =>
        TransactionFactory.createExpense({
          ...common,
          type: 'FEE',
          amount: '-10.00',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createExpense({
          ...common,
          type: 'TAX',
          amount: '-25.00',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('SPLIT and REVERSE_SPLIT', () => {
    it('should create SPLIT and REVERSE_SPLIT with factor > 0', () => {
      const split = TransactionFactory.createSplit({
        ...common,
        type: 'SPLIT',
        factor: '2',
      });
      expect(split.factor.value).toBe('2');

      const revSplit = TransactionFactory.createSplit({
        ...common,
        type: 'REVERSE_SPLIT',
        factor: '0.1',
      });
      expect(revSplit.factor.value).toBe('0.1');
    });

    it('should reject factor <= 0', () => {
      expect(() =>
        TransactionFactory.createSplit({
          ...common,
          type: 'SPLIT',
          factor: '0',
        }),
      ).toThrow(InvalidTransactionError);

      expect(() =>
        TransactionFactory.createSplit({
          ...common,
          type: 'REVERSE_SPLIT',
          factor: '-1',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('BONUS, TRANSFER, CASH MOVEMENTS', () => {
    it('BONUS requires quantity > 0', () => {
      const bonus = TransactionFactory.createBonus({
        ...common,
        quantity: '10',
      });
      expect(bonus.quantity.value).toBe('10');

      expect(() =>
        TransactionFactory.createBonus({
          ...common,
          quantity: '0',
        }),
      ).toThrow(InvalidTransactionError);
    });

    it('TRANSFER requires quantity > 0', () => {
      const transferIn = TransactionFactory.createTransfer({
        ...common,
        type: 'TRANSFER_IN',
        quantity: '50',
      });
      expect(transferIn.quantity.value).toBe('50');

      expect(() =>
        TransactionFactory.createTransfer({
          ...common,
          type: 'TRANSFER_OUT',
          quantity: '-5',
        }),
      ).toThrow(InvalidTransactionError);
    });

    it('Cash movements (DEPOSIT, WITHDRAWAL) require amount > 0', () => {
      const deposit = TransactionFactory.createCashMovement({
        portfolioId: common.portfolioId,
        accountId: common.accountId,
        currency: common.currency,
        tradeDate: common.tradeDate,
        type: 'DEPOSIT',
        amount: '5000',
      });
      expect(deposit.amount.amount).toBe('5000');

      expect(() =>
        TransactionFactory.createCashMovement({
          portfolioId: common.portfolioId,
          accountId: common.accountId,
          currency: common.currency,
          tradeDate: common.tradeDate,
          type: 'WITHDRAWAL',
          amount: '0',
        }),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('Metadata validation', () => {
    it('should reject invalid LocalDate and invalid source', () => {
      expect(() =>
        TransactionFactory.createBuy({
          ...common,
          quantity: '10',
          unitPrice: '10',
          tradeDate: 'invalid-date',
        }),
      ).toThrow(InvalidLocalDateError);

      expect(() =>
        TransactionFactory.createBuy({
          ...common,
          quantity: '10',
          unitPrice: '10',
          source: 'INVALID_SOURCE',
        }),
      ).toThrow(InvalidTransactionError);
    });

    it('should store idempotency metadata (provider, externalId)', () => {
      const tx = TransactionFactory.createBuy({
        ...common,
        quantity: '10',
        unitPrice: '10',
        provider: 'B3_CEI',
        externalId: 'ext_trade_998877',
      });

      expect(tx.provider).toBe('B3_CEI');
      expect(tx.externalId).toBe('ext_trade_998877');
    });
  });
});
