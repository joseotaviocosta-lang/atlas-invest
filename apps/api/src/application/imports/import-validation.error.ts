import { DomainError } from '@atlas/domain';

/**
 * Phase 5K — import input failures (empty file, malformed CSV, missing
 * columns, oversized payload, unsupported source).
 *
 * A DomainError so the GlobalExceptionFilter maps it to
 * 400 / IMPORT.INVALID_INPUT without leaking file contents.
 */
export class ImportValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'IMPORT.INVALID_INPUT');
  }
}
