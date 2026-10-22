import { z } from 'zod';
import { B3TransportError } from './errors';

/**
 * Phase 5O-B — OAuth 2.0 client-credentials token handling.
 *
 * The grant flow (Client Credentials, v1.0) is confirmed by the official
 * Autenticação catalog; the token endpoint URL and field names come from
 * the CERT access package, so the response schema below follows the
 * OAuth 2.0 standard shape (RFC 6749 §4.4/§5.1) and is re-validated per
 * response. Tokens live in memory only, expire with clock skew, are never
 * logged, never persisted and never returned to any frontend.
 */
export const B3TokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().default('Bearer'),
    expires_in: z.number().int().positive(),
  })
  .describe(
    'OAuth2 RFC 6749 token response shape; B3 field mapping UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE',
  );

export type B3TokenResponse = z.infer<typeof B3TokenResponseSchema>;

export interface B3AcquiredToken {
  token: string;
  expiresAtMs: number;
}

export interface B3TokenCacheOptions {
  /** Safety margin before expiry. Defaults to 30_000 ms. */
  clockSkewMs?: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * In-memory token cache with single-flight acquisition: concurrent callers
 * share one in-flight token request. Failures are never cached. The token
 * value never leaves this module except as an Authorization header.
 */
export class B3TokenCache {
  private readonly clockSkewMs: number;
  private readonly now: () => number;
  private current: B3AcquiredToken | null = null;
  private inflight: Promise<B3AcquiredToken> | null = null;

  constructor(
    private readonly acquire: (signal?: AbortSignal) => Promise<B3AcquiredToken>,
    options: B3TokenCacheOptions = {},
  ) {
    this.clockSkewMs = options.clockSkewMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  async getToken(signal?: AbortSignal): Promise<string> {
    const live = this.current;
    if (live && live.expiresAtMs - this.clockSkewMs > this.now()) {
      return live.token;
    }
    if (!this.inflight) {
      this.inflight = this.acquire(signal).then(
        (token) => {
          this.current = token;
          this.inflight = null;
          return token;
        },
        (error) => {
          this.inflight = null;
          throw error instanceof B3TransportError
            ? error
            : new B3TransportError('AUTHENTICATION_FAILED', 'B3 token acquisition failed', {
                cause: error,
              });
        },
      );
    }
    const acquired = await this.inflight;
    return acquired.token;
  }

  /** Drops any cached token (e.g. after a 401 forces re-authentication). */
  invalidate(): void {
    this.current = null;
  }
}
