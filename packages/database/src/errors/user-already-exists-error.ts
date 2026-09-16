import { PersistenceError } from './persistence-error';

export class UserAlreadyExistsError extends PersistenceError {
  constructor(email: string) {
    super(`User with email '${email}' already exists.`, 'AUTH.EMAIL_ALREADY_EXISTS');
    this.name = 'UserAlreadyExistsError';
  }
}
