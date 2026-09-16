export class NotFoundError extends Error {
  readonly code: string;

  constructor(entityName: string, id: string) {
    super(`${entityName} with id '${id}' not found`);
    this.name = 'NotFoundError';
    this.code = `${entityName.toUpperCase()}.NOT_FOUND`;
  }
}
