export class PersistenceError extends Error {
  readonly code: string;

  constructor(message: string, code = 'PERSISTENCE.ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
