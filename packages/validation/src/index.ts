export const VALIDATION_VERSION = '0.1.0';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: ValidationIssue[];
}

export function createValidator<T>(
  validateFn: (input: unknown) => ValidationResult<T>,
): (input: unknown) => ValidationResult<T> {
  return validateFn;
}
