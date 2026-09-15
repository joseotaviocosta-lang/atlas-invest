import { DomainError } from '../errors/domain-error';

export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export class InvalidCurrencyError extends DomainError {
  constructor(invalidCurrency: string) {
    super(
      `Invalid currency '${invalidCurrency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`,
      'DOMAIN.INVALID_CURRENCY',
    );
  }
}

export function isValidCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function assertValidCurrency(value: string): Currency {
  if (!isValidCurrency(value)) {
    throw new InvalidCurrencyError(value);
  }
  return value;
}
