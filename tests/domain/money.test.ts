import { describe, it, expect } from 'vitest';
import {
  Money,
  CurrencyMismatchError,
  DivisionByZeroError,
  InvalidMoneyError,
} from '../../packages/domain/src/index';

describe('Domain: Money Financial Primitive', () => {
  it('must strictly satisfy 0.1 + 0.2 = 0.3 without binary floating point inaccuracy', () => {
    const a = Money.from('0.1', 'BRL');
    const b = Money.from('0.2', 'BRL');
    const sum = a.add(b);

    expect(sum.amount).toBe('0.3');
    expect(sum.equals(Money.from('0.3', 'BRL'))).toBe(true);
    // Crucial check: 0.1 + 0.2 in JS float is 0.30000000000000004
    expect(sum.amount).not.toBe((0.1 + 0.2).toString());
  });

  it('must preserve extreme high precision (123456789.123456789) without silent truncation', () => {
    const highPrecision = Money.from('123456789.123456789', 'BRL');
    expect(highPrecision.amount).toBe('123456789.123456789');

    const tiny = Money.from('0.00000001', 'BRL');
    expect(tiny.amount).toBe('0.00000001');

    const sum = highPrecision.add(tiny);
    expect(sum.amount).toBe('123456789.123456799');
  });

  it('should support subtraction, multiplication by scalar and division', () => {
    const m = Money.from('10.50', 'BRL');

    const diff = m.subtract(Money.from('0.50', 'BRL'));
    expect(diff.amount).toBe('10');

    const multiplied = m.multiply('3');
    expect(multiplied.amount).toBe('31.5');

    const divided = m.divide('2');
    expect(divided.amount).toBe('5.25');
  });

  it('should support zero, negate, and abs', () => {
    const zero = Money.zero('USD');
    expect(zero.isZero()).toBe(true);
    expect(zero.isPositive()).toBe(false);
    expect(zero.isNegative()).toBe(false);

    const pos = Money.from('15.00', 'BRL');
    expect(pos.isPositive()).toBe(true);

    const neg = pos.negate();
    expect(neg.isNegative()).toBe(true);
    expect(neg.amount).toBe('-15');

    expect(neg.abs().amount).toBe('15');
  });

  it('should throw CurrencyMismatchError on arithmetic or comparisons between different currencies', () => {
    const brl = Money.from('100.00', 'BRL');
    const usd = Money.from('100.00', 'USD');

    expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.compare(usd)).toThrow(CurrencyMismatchError);
    expect(brl.equals(usd)).toBe(false);
  });

  it('should throw DivisionByZeroError when dividing by zero', () => {
    const m = Money.from('50.00', 'BRL');
    expect(() => m.divide('0')).toThrow(DivisionByZeroError);
  });

  it('should reject invalid decimal strings', () => {
    expect(() => Money.from('invalid-number', 'BRL')).toThrow(InvalidMoneyError);
    expect(() => Money.from('', 'BRL')).toThrow(InvalidMoneyError);
  });

  it('should properly serialize to JSON and deserialize back via round-trip', () => {
    const original = Money.from('1234.56', 'BRL');
    const json = original.toJSON();

    expect(json).toEqual({
      amount: '1234.56',
      currency: 'BRL',
    });

    const parsed = Money.fromJSON(json);
    expect(parsed.equals(original)).toBe(true);
    expect(parsed.amount).toBe('1234.56');
    expect(parsed.currency).toBe('BRL');
  });

  it('should be strictly immutable', () => {
    const m = Money.from('100', 'BRL');
    expect(Object.isFrozen(m)).toBe(true);
  });
});
