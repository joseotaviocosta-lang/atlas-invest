/**
 * Tax Engine domain errors. Pure — no I/O, no framework.
 */
export class TaxEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxEngineError';
  }
}

/** Raised when a rule registry contains overlapping effective periods (ADR-237). */
export class TaxRuleOverlapError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'TaxRuleOverlapError';
  }
}

/** Raised when a rule set has an invalid effective period. */
export class InvalidTaxRuleSetError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaxRuleSetError';
  }
}

/** Raised when a fiscal competence string is not a valid civil YYYY-MM. */
export class InvalidFiscalCompetenceError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFiscalCompetenceError';
  }
}

/** Raised for unsupported tax engine operations. */
export class UnsupportedTaxOperationError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedTaxOperationError';
  }
}
