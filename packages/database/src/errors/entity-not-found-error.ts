import { PersistenceError } from './persistence-error';

export class EntityNotFoundError extends PersistenceError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id '${id}' was not found.`, 'PERSISTENCE.ENTITY_NOT_FOUND');
  }
}
