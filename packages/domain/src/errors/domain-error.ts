/**
 * Base class for all domain errors within Project Atlas.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_MONEY');
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(currencyA: string, currencyB: string) {
    super(
      `Cannot perform operations between different currencies: '${currencyA}' and '${currencyB}'`,
      'DOMAIN.CURRENCY_MISMATCH',
    );
  }
}

export class DivisionByZeroError extends DomainError {
  constructor(message = 'Division by zero is not allowed') {
    super(message, 'DOMAIN.DIVISION_BY_ZERO');
  }
}

export class InvalidQuantityError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_QUANTITY');
  }
}

export class InvalidLocalDateError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_LOCAL_DATE');
  }
}

export class InvalidDomainIdError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_DOMAIN_ID');
  }
}

export class InvalidEntityError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_ENTITY');
  }
}

export class InvalidTransactionError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_TRANSACTION');
  }
}

export class InvalidCostEvidenceError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.INVALID_COST_EVIDENCE');
  }
}

export class CostEvidenceOverCoverageError extends DomainError {
  constructor(message: string) {
    super(message, 'DOMAIN.COST_EVIDENCE_OVER_COVERAGE');
  }
}
