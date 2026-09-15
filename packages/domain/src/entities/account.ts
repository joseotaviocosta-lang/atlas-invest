import {
  AccountId,
  PortfolioId,
  InstitutionId,
  createAccountId,
  createPortfolioId,
  createInstitutionId,
} from '../primitives/domain-id';
import { Currency, assertValidCurrency } from '../primitives/currency';
import { AccountStatus } from '../ledger/types';
import { InvalidEntityError } from '../errors/domain-error';

export interface AccountProps {
  id: AccountId;
  portfolioId: PortfolioId;
  institutionId: InstitutionId;
  name: string;
  currency: Currency;
  status: AccountStatus;
}

export interface AccountJSON {
  id: string;
  portfolioId: string;
  institutionId: string;
  name: string;
  currency: string;
  status: AccountStatus;
}

export class Account {
  readonly id: AccountId;
  readonly portfolioId: PortfolioId;
  readonly institutionId: InstitutionId;
  readonly name: string;
  readonly currency: Currency;
  readonly status: AccountStatus;

  private constructor(props: AccountProps) {
    this.id = props.id;
    this.portfolioId = props.portfolioId;
    this.institutionId = props.institutionId;
    this.name = props.name;
    this.currency = props.currency;
    this.status = props.status;
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    portfolioId: string;
    institutionId: string;
    name: string;
    currency: string;
    status?: AccountStatus;
  }): Account {
    if (!props.name || props.name.trim() === '') {
      throw new InvalidEntityError('Account name cannot be empty');
    }
    const validCurrency = assertValidCurrency(props.currency);

    return new Account({
      id: createAccountId(props.id),
      portfolioId: createPortfolioId(props.portfolioId),
      institutionId: createInstitutionId(props.institutionId),
      name: props.name.trim(),
      currency: validCurrency,
      status: props.status ?? 'ACTIVE',
    });
  }

  equals(other: Account): boolean {
    if (!other || !(other instanceof Account)) {
      return false;
    }
    return this.id === other.id;
  }

  toJSON(): AccountJSON {
    return {
      id: this.id,
      portfolioId: this.portfolioId,
      institutionId: this.institutionId,
      name: this.name,
      currency: this.currency,
      status: this.status,
    };
  }
}
