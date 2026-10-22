/**
 * Phase 5O-B — stable transport error taxonomy.
 *
 * External HTTP realities (status codes, timeouts, TLS failures, malformed
 * payloads) are translated once, at the transport boundary, into these codes.
 * Raw B3 bodies never travel past the boundary; the safe technical diagnosis
 * (`status`, `endpoint`, `retryAfterMs`) may be logged, user copy comes from
 * the presentation layer, never from here.
 */
export const B3_TRANSPORT_ERROR_CODES = [
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_REVOKED',
  'RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'INVALID_UPSTREAM_PAYLOAD',
  'CERTIFICATE_ERROR',
  'CONFIGURATION_ERROR',
  'PARTIAL_DATA',
] as const;
export type B3TransportErrorCode = (typeof B3_TRANSPORT_ERROR_CODES)[number];

export class B3TransportError extends Error {
  readonly code: B3TransportErrorCode;
  /** Upstream HTTP status when one was received, for diagnostics only. */
  readonly status: number | null;
  /** Server-advertised backoff in milliseconds (e.g. from Retry-After). */
  readonly retryAfterMs: number | null;

  constructor(
    code: B3TransportErrorCode,
    message: string,
    options?: {
      status?: number | null;
      retryAfterMs?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'B3TransportError';
    this.code = code;
    this.status = options?.status ?? null;
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }
}

/**
 * Maps a received HTTP status to the stable taxonomy. 4xx client errors are
 * never retried: 401/403 stop the sync and force an authorization review,
 * 400/404 indicate a broken request contract (fix forward, fail closed).
 */
export function translateHttpStatusToB3Error(status: number, endpoint: string): B3TransportError {
  if (status === 401) {
    return new B3TransportError(
      'AUTHENTICATION_FAILED',
      `B3 rejected application credentials for ${endpoint}`,
      { status },
    );
  }
  if (status === 403) {
    return new B3TransportError(
      'AUTHORIZATION_REVOKED',
      `B3 refused access for ${endpoint}: re-check investor authorization`,
      { status },
    );
  }
  if (status === 429) {
    return new B3TransportError('RATE_LIMITED', `B3 rate limit hit on ${endpoint}`, { status });
  }
  if (status >= 500) {
    return new B3TransportError(
      'UPSTREAM_UNAVAILABLE',
      `B3 upstream failure on ${endpoint} (HTTP ${status})`,
      { status },
    );
  }
  return new B3TransportError(
    'CONFIGURATION_ERROR',
    `Unexpected B3 response on ${endpoint} (HTTP ${status}): fix the request contract`,
    { status },
  );
}

const CERTIFICATE_MESSAGE_PATTERN =
  /certificate|CERTIFICATE|unable to verify|self.signed|handshake|mTLS|mutual/i;

/**
 * Classifies a transport-level thrown value. `AbortError` (our own timeout)
 * is a timeout; certificate-like messages are certificate errors; anything
 * else is an unavailable upstream. `B3TransportError` instances pass through
 * untouched so mappers keep their precise codes.
 */
export function classifyThrownB3Error(error: unknown, endpoint: string): B3TransportError {
  if (error instanceof B3TransportError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new B3TransportError('UPSTREAM_TIMEOUT', `B3 request timed out on ${endpoint}`, {
      cause: error,
    });
  }
  if (CERTIFICATE_MESSAGE_PATTERN.test(message)) {
    return new B3TransportError(
      'CERTIFICATE_ERROR',
      `B3 TLS/mTLS failure on ${endpoint}: check the client certificate`,
      { cause: error },
    );
  }
  return new B3TransportError(
    'UPSTREAM_UNAVAILABLE',
    `B3 request failed on ${endpoint}: ${message}`,
    { cause: error },
  );
}
