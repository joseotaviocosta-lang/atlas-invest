import { PersistenceError } from './persistence-error';

export class PersistenceMappingError extends PersistenceError {
  constructor(message: string) {
    super(`Persistence mapping error: ${message}`, 'PERSISTENCE.MAPPING_ERROR');
  }
}
