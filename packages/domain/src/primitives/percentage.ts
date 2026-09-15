import { DecimalValue } from './decimal-value';
import { DomainError } from '../errors/domain-error';

export class InvalidPercentageError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_PERCENTAGE');
  }
}

export class Percentage {
  private readonly _value: DecimalValue;

  private constructor(value: DecimalValue) {
    this._value = value;
    Object.freeze(this);
  }

  get value(): string {
    return this._value.toString();
  }

  /**
   * Creates a Percentage where 10% is represented as Percentage.from("10").
   */
  static from(value: string | number | { toString(): string }): Percentage {
    const str = typeof value === 'number' ? value.toString() : value.toString();
    try {
      const dec = DecimalValue.from(str);
      return new Percentage(dec);
    } catch (err) {
      throw new InvalidPercentageError(
        `Invalid percentage '${str}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Returns decimal fraction representation (e.g. 10% -> "0.1").
   */
  toFraction(): string {
    return this._value.divide(DecimalValue.from('100')).toString();
  }

  equals(other: Percentage): boolean {
    return this._value.equals(other._value);
  }

  toString(): string {
    return `${this._value.toString()}%`;
  }

  toJSON(): string {
    return this._value.toString();
  }

  static fromJSON(json: string): Percentage {
    return Percentage.from(json);
  }
}
