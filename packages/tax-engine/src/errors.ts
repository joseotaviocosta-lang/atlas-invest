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

/** Raised when a federal tax deadline entry is structurally invalid (ADR-263). */
export class InvalidTaxDeadlineEntryError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaxDeadlineEntryError';
  }
}

/** Raised when a calendar year is outside allowed range or invalid. */
export class InvalidCalendarYearError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCalendarYearError';
  }
}

/** Raised when a declaration exercise year is outside allowed range or invalid. */
export class InvalidDeclarationExerciseError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDeclarationExerciseError';
  }
}

/** Raised when an annual tax period cannot be constructed or is invalid. */
export class InvalidAnnualTaxPeriodError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnnualTaxPeriodError';
  }
}

/** Raised when an annual opening position input is structurally or semantically invalid. */
export class InvalidAnnualOpeningPositionError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnnualOpeningPositionError';
  }
}

/** Raised when an annual position computation is blocked due to incomplete data. */
export class AnnualPositionBlockedError extends TaxEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'AnnualPositionBlockedError';
  }
}
