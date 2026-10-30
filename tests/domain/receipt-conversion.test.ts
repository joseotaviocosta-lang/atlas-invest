import { describe, it, expect } from 'vitest';
import {
  TransactionFactory,
  InvalidTransactionError,
  serializeTransaction,
  CONVERSION_TYPES,
} from '../../packages/domain/src/index';

describe('Domain: RECEIPT_CONVERSION canonical event', () => {
  const common = {
    portfolioId: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    assetId: '33333333-3333-4333-8333-333333333333',
    targetAssetId: '44444444-4444-4444-8444-444444444444',
    currency: 'BRL',
    tradeDate: '2026-09-15',
  };
  const valid = {
    ...common,
    quantity: '200',
    targetQuantity: '200',
    conversionRatio: '1',
    conversionType: 'SUBSCRIPTION_RECEIPT',
  };

  it('creates a valid 1:1 conversion with frozen object identity', () => {
    const tx = TransactionFactory.createReceiptConversion(valid);
    expect(tx.type).toBe('RECEIPT_CONVERSION');
    expect(tx.quantity.value).toBe('200');
    expect(tx.targetQuantity.value).toBe('200');
    expect(tx.conversionRatio.value).toBe('1');
    expect(tx.conversionType).toBe('SUBSCRIPTION_RECEIPT');
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('accepts non-1:1 ratios with exact decimal consistency', () => {
    const tx = TransactionFactory.createReceiptConversion({
      ...common,
      quantity: '100',
      targetQuantity: '200',
      conversionRatio: '2',
      conversionType: 'SUBSCRIPTION_RECEIPT',
    });
    expect(tx.targetQuantity.value).toBe('200');
  });

  it('rejects identical source and target assets', () => {
    expect(() =>
      TransactionFactory.createReceiptConversion({ ...valid, targetAssetId: common.assetId }),
    ).toThrow(/must differ/);
  });

  it('rejects non-positive quantities and ratio', () => {
    expect(() => TransactionFactory.createReceiptConversion({ ...valid, quantity: '0' })).toThrow(
      InvalidTransactionError,
    );
    expect(() =>
      TransactionFactory.createReceiptConversion({ ...valid, targetQuantity: '-5' }),
    ).toThrow(InvalidTransactionError);
    expect(() =>
      TransactionFactory.createReceiptConversion({ ...valid, conversionRatio: '0' }),
    ).toThrow(InvalidTransactionError);
  });

  it('rejects unknown conversion types', () => {
    expect(() =>
      TransactionFactory.createReceiptConversion({ ...valid, conversionType: 'MERGER' }),
    ).toThrow(/unknown conversionType/);
    expect(CONVERSION_TYPES).toEqual(['SUBSCRIPTION_RECEIPT']);
  });

  it('rejects ratio inconsistency without float math', () => {
    expect(() =>
      TransactionFactory.createReceiptConversion({ ...valid, targetQuantity: '201' }),
    ).toThrow(/CONVERSION_RATIO_MISMATCH/);
    // 0.1 + 0.2 style traps: exact decimal comparison, never binary float.
    expect(() =>
      TransactionFactory.createReceiptConversion({
        ...valid,
        quantity: '0.3',
        targetQuantity: '0.30000000000000004',
        conversionRatio: '1',
      }),
    ).toThrow(/CONVERSION_RATIO_MISMATCH/);
  });

  it('serializes dual-asset references losslessly', () => {
    const json = serializeTransaction(TransactionFactory.createReceiptConversion(valid));
    expect(json.targetAssetId).toBe(common.targetAssetId);
    expect(json.targetQuantity).toBe('200');
    expect(json.conversionRatio).toBe('1');
    expect(json.conversionType).toBe('SUBSCRIPTION_RECEIPT');
    expect(json.unitPrice).toBeUndefined();
    expect(json.amount).toBeUndefined();
  });
});
