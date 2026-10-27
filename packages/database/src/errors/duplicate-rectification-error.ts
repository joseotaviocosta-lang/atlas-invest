import { PersistenceError } from './persistence-error';

export class DuplicateRectificationError extends PersistenceError {
  constructor(originalTransactionId: string) {
    super(
      `Transaction '${originalTransactionId}' has already been rectified.`,
      'RECTIFICATION.ALREADY_RECTIFIED',
    );
  }
}
