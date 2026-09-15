import { Currency, assertValidCurrency } from './currency';
import { DecimalValue } from './decimal-value';
import { CurrencyMismatchError, InvalidMoneyError } from '../errors/domain-error';

export interface MoneyJSON {
  amount: string;
  currency: Currency;
}

export class Money {
  private readonly _value: DecimalValue;
  readonly currency: Currency;

  private constructor(value: DecimalValue, currency: Currency) {
    this._value = value;
    this.currency = currency;
    Object.freeze(this);
  }

  get amount(): string {
    return this._value.toString();
  }

  static from(amount: string, currency: string): Money {
    const validCurrency = assertValidCurrency(currency);
    try {
      const val = DecimalValue.from(amount);
      return new Money(val, validCurrency);
    } catch (err) {
      throw new InvalidMoneyError(
        `Invalid money amount '${amount}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  static zero(currency: string): Money {
    const validCurrency = assertValidCurrency(currency);
    return new Money(DecimalValue.zero(), validCurrency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._value.add(other._value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._value.subtract(other._value), this.currency);
  }

  /**
   * Multiplies Money by a scalar factor (string, Quantity or number).
   * Money * Money is dimensionally invalid and rejected.
   */
  multiply(factor: string | number | { toString(): string }): Money {
    const factorStr = typeof factor === 'number' ? factor.toString() : factor.toString();
    try {
      const factorVal = DecimalValue.from(factorStr);
      return new Money(this._value.multiply(factorVal), this.currency);
    } catch (err) {
      throw new InvalidMoneyError(
        `Invalid multiplication factor '${factorStr}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Divides Money by a scalar divisor (string, Quantity or number).
   */
  divide(divisor: string | number | { toString(): string }): Money {
    const divisorStr = typeof divisor === 'number' ? divisor.toString() : divisor.toString();
    try {
      const divisorVal = DecimalValue.from(divisorStr);
      return new Money(this._value.divide(divisorVal), this.currency);
    } catch (err) {
      if (err instanceof Error && err.name === 'DivisionByZeroError') {
        throw err;
      }
      throw new InvalidMoneyError(
        `Invalid divisor '${divisorStr}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  negate(): Money {
    return new Money(this._value.negate(), this.currency);
  }

  abs(): Money {
    return new Money(this._value.abs(), this.currency);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) {
      return false;
    }
    return this._value.equals(other._value);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this._value.compare(other._value);
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
    return `${this.amount} ${this.currency}`;
  }

  toJSON(): MoneyJSON {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  static fromJSON(json: MoneyJSON): Money {
    return Money.from(json.amount, json.currency);
  }
}
