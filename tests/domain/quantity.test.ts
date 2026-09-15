import { describe, it, expect } from 'vitest';
import { Quantity, InvalidQuantityError } from '../../packages/domain/src/index';

describe('Domain: Quantity Primitive', () => {
  it('should support integer, fractional, zero, and negative quantities', () => {
    const zero = Quantity.zero();
    expect(zero.isZero()).toBe(true);
    expect(zero.value).toBe('0');

    const integerQty = Quantity.from('100');
    expect(integerQty.value).toBe('100');

    const fractionalQty = Quantity.from('123.456789');
    expect(fractionalQty.value).toBe('123.456789');

    const negativeQty = Quantity.from('-25.5');
    expect(negativeQty.isNegative()).toBe(true);
    expect(negativeQty.value).toBe('-25.5');
  });

  it('should accurately calculate arithmetic operations without floating-point errors', () => {
    const q1 = Quantity.from('0.1');
    const q2 = Quantity.from('0.2');
    const sum = q1.add(q2);

    expect(sum.value).toBe('0.3');
    expect(sum.equals(Quantity.from('0.3'))).toBe(true);

    const diff = Quantity.from('10').subtract(Quantity.from('2.5'));
    expect(diff.value).toBe('7.5');

    const product = Quantity.from('2.5').multiply(Quantity.from('4'));
    expect(product.value).toBe('10');

    const quotient = Quantity.from('10').divide(Quantity.from('4'));
    expect(quotient.value).toBe('2.5');
  });

  it('should reject invalid quantity inputs', () => {
    expect(() => Quantity.from('not-a-quantity')).toThrow(InvalidQuantityError);
    expect(() => Quantity.from('')).toThrow(InvalidQuantityError);
  });

  it('should properly serialize to JSON and deserialize back via round-trip', () => {
    const original = Quantity.from('987.654321');
    const json = original.toJSON();

    expect(json).toBe('987.654321');

    const parsed = Quantity.fromJSON(json);
    expect(parsed.equals(original)).toBe(true);
    expect(parsed.value).toBe('987.654321');
  });

  it('should be strictly immutable', () => {
    const q = Quantity.from('50');
    expect(Object.isFrozen(q)).toBe(true);
  });
});
