import { PersistenceError } from './persistence-error';

export class DuplicateExternalTransactionError extends PersistenceError {
  constructor(portfolioId: string, provider: string, externalId: string) {
    super(
      `Transaction with provider '${provider}' and externalId '${externalId}' already exists in portfolio '${portfolioId}'.`,
      'PERSISTENCE.DUPLICATE_EXTERNAL_TRANSACTION',
    );
  }
}
