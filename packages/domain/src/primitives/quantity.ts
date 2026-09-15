import { DecimalValue } from './decimal-value';
import { InvalidQuantityError } from '../errors/domain-error';

export class Quantity {
  private readonly _value: DecimalValue;

  private constructor(value: DecimalValue) {
    this._value = value;
    Object.freeze(this);
  }

  get value(): string {
    return this._value.toString();
  }

  static from(value: string | number | { toString(): string }): Quantity {
    const str = typeof value === 'number' ? value.toString() : value.toString();
    try {
      const dec = DecimalValue.from(str);
      return new Quantity(dec);
    } catch (err) {
      throw new InvalidQuantityError(
        `Invalid quantity '${str}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  static zero(): Quantity {
    return new Quantity(DecimalValue.zero());
  }

  add(other: Quantity): Quantity {
    return new Quantity(this._value.add(other._value));
  }

  subtract(other: Quantity): Quantity {
    return new Quantity(this._value.subtract(other._value));
  }

  multiply(factor: Quantity | string | number): Quantity {
    const factorQ = factor instanceof Quantity ? factor : Quantity.from(factor);
    return new Quantity(this._value.multiply(factorQ._value));
  }

  divide(divisor: Quantity | string | number): Quantity {
    const divisorQ = divisor instanceof Quantity ? divisor : Quantity.from(divisor);
    return new Quantity(this._value.divide(divisorQ._value));
  }

  negate(): Quantity {
    return new Quantity(this._value.negate());
  }

  abs(): Quantity {
    return new Quantity(this._value.abs());
  }

  compare(other: Quantity): -1 | 0 | 1 {
    return this._value.compare(other._value);
  }

  equals(other: Quantity): boolean {
    return this._value.equals(other._value);
  }

  isZero(): boolean {
    return this._value.isZero();
  }

  isPositive(): boolean {
    return this._value.isPositive();
  }

  isNegative(): boolean {
    return this._value.isNegative();
  }

  toString(): string {
    return this._value.toString();
  }

  toJSON(): string {
    return this._value.toString();
  }

  static fromJSON(json: string): Quantity {
    return Quantity.from(json);
  }
}
