/**
 * Security Headers Configuration for Project Atlas Web Application (ADR-290)
 *
 * Implements strict security standards:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: camera=(), microphone=(), geolocation=()
 * - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload (default in production/HTTPS)
 *
 * Staging HTTP override:
 * HSTS is omitted ONLY when DISABLE_HSTS_FOR_HTTP_STAGING === 'true'.
 * In all other cases (false, undefined, empty, arbitrary values), HSTS is preserved.
 * Relaxation is NEVER inferred merely from NODE_ENV.
 */

export const HSTS_HEADER_KEY = 'Strict-Transport-Security';
export const HSTS_HEADER_VALUE = 'max-age=63072000; includeSubDomains; preload';

export interface SecurityHeader {
  key: string;
  value: string;
}

export const BASE_SECURITY_HEADERS: readonly SecurityHeader[] = Object.freeze([
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]);

/**
 * Determines whether HSTS should be disabled for plain HTTP/IP staging.
 *
 * Invariants:
 * 1. Default is secure: ausente/false/outro -> returns false (HSTS enabled).
 * 2. Staging HTTP override: returns true ONLY when DISABLE_HSTS_FOR_HTTP_STAGING === 'true'.
 * 3. Does not infer insecure behavior merely from NODE_ENV.
 */
export function shouldDisableHsts(): boolean {
  return process.env.DISABLE_HSTS_FOR_HTTP_STAGING === 'true';
}

/**
 * Returns the active security headers array for Next.js configuration.
 */
export function getSecurityHeaders(): SecurityHeader[] {
  if (shouldDisableHsts()) {
    return [...BASE_SECURITY_HEADERS];
  }
  return [
    ...BASE_SECURITY_HEADERS,
    { key: HSTS_HEADER_KEY, value: HSTS_HEADER_VALUE },
  ];
}
