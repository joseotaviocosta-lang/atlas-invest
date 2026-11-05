export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly isOffline?: boolean;
  readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    details?: unknown,
    isOffline = false,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOffline = isOffline;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
