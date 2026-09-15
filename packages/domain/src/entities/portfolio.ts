import { PortfolioId, UserId, createPortfolioId, createUserId } from '../primitives/domain-id';
import { Currency, assertValidCurrency } from '../primitives/currency';
import { PortfolioType, PortfolioStatus } from '../ledger/types';
import { InvalidEntityError } from '../errors/domain-error';

export interface PortfolioProps {
  id: PortfolioId;
  userId: UserId;
  name: string;
  baseCurrency: Currency;
  type: PortfolioType;
  status: PortfolioStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioJSON {
  id: string;
  userId: string;
  name: string;
  baseCurrency: string;
  type: PortfolioType;
  status: PortfolioStatus;
  createdAt: string;
  updatedAt: string;
}

export class Portfolio {
  readonly id: PortfolioId;
  readonly userId: UserId;
  readonly name: string;
  readonly baseCurrency: Currency;
  readonly type: PortfolioType;
  readonly status: PortfolioStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: PortfolioProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.baseCurrency = props.baseCurrency;
    this.type = props.type;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    userId: string;
    name: string;
    baseCurrency: string;
    type?: PortfolioType;
    status?: PortfolioStatus;
    createdAt?: Date;
    updatedAt?: Date;
  }): Portfolio {
    if (!props.name || props.name.trim() === '') {
      throw new InvalidEntityError('Portfolio name cannot be empty');
    }
    const validCurrency = assertValidCurrency(props.baseCurrency);
    const now = new Date();

    return new Portfolio({
      id: createPortfolioId(props.id),
      userId: createUserId(props.userId),
      name: props.name.trim(),
      baseCurrency: validCurrency,
      type: props.type ?? 'PERSONAL',
      status: props.status ?? 'ACTIVE',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  equals(other: Portfolio): boolean {
    if (!other || !(other instanceof Portfolio)) {
      return false;
    }
    return this.id === other.id;
  }

  toJSON(): PortfolioJSON {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      baseCurrency: this.baseCurrency,
      type: this.type,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
