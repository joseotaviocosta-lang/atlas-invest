import Decimal from 'decimal.js';
import { DivisionByZeroError } from '../errors/domain-error';

// Configure global precision and rounding for decimal.js
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 40,
});

/**
 * Internal encapsulated wrapper over decimal.js.
 * NOT exposed publicly in @atlas/domain root exports.
 */
export class DecimalValue {
  private readonly _d: Decimal;

  private constructor(d: Decimal) {
    this._d = d;
  }

  static from(value: string | number | DecimalValue): DecimalValue {
    if (value instanceof DecimalValue) {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid numeric input for DecimalValue: ${value}`);
      }
      return new DecimalValue(new Decimal(value.toString()));
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      throw new Error('Cannot parse empty string as DecimalValue');
    }
    try {
      return new DecimalValue(new Decimal(trimmed));
    } catch {
      throw new Error(`Invalid decimal string: '${value}'`);
    }
  }

  static zero(): DecimalValue {
    return new DecimalValue(new Decimal(0));
  }

  add(other: DecimalValue): DecimalValue {
    return new DecimalValue(this._d.plus(other._d));
  }

  subtract(other: DecimalValue): DecimalValue {
    return new DecimalValue(this._d.minus(other._d));
  }

  multiply(other: DecimalValue): DecimalValue {
    return new DecimalValue(this._d.times(other._d));
  }

  divide(divisor: DecimalValue): DecimalValue {
    if (divisor.isZero()) {
      throw new DivisionByZeroError();
    }
    return new DecimalValue(this._d.dividedBy(divisor._d));
  }

  negate(): DecimalValue {
    return new DecimalValue(this._d.negated());
  }

  abs(): DecimalValue {
    return new DecimalValue(this._d.abs());
  }

  compare(other: DecimalValue): -1 | 0 | 1 {
    const cmp = this._d.comparedTo(other._d);
    return cmp as -1 | 0 | 1;
  }

  equals(other: DecimalValue): boolean {
    return this._d.equals(other._d);
  }

  isZero(): boolean {
    return this._d.isZero();
  }

  isPositive(): boolean {
    return this._d.isPositive() && !this._d.isZero();
  }

  isNegative(): boolean {
    return this._d.isNegative();
  }

  /**
   * Canonical string representation.
   */
  toString(): string {
    return this._d.toString();
  }

  /**
   * Formatted string with fixed decimal places.
   */
  toFixed(decimalPlaces: number): string {
    return this._d.toFixed(decimalPlaces);
  }
}
