/**
 * Authentication Cookie Configuration & Utilities for Project Atlas BFF
 *
 * Implements strict security standards:
 * - Refresh tokens are stored exclusively in HttpOnly, SameSite=Lax, Secure cookies.
 * - Browser JavaScript NEVER has access to the refresh token.
 * - An atlas_logged_in hint cookie provides instant session state for Edge Middleware.
 */

export const REFRESH_COOKIE_NAME = 'atlas_refresh';
export const LOGGED_IN_COOKIE_NAME = 'atlas_logged_in';

// 30 days in seconds
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

/**
 * Determines whether authentication cookies must require the Secure attribute.
 *
 * Invariants:
 * 1. Default is secure: ausente/false -> secure: true
 * 2. Staging HTTP override: Secure=false ONLY when ALLOW_INSECURE_HTTP_AUTH_COOKIES === 'true'.
 * 3. Does not infer insecure behavior merely from NODE_ENV.
 * 4. Explicit non-production override (isProduction = false) honored for local dev/testing.
 */
export function shouldSecureAuthCookies(isProduction = true): boolean {
  const allowInsecure = process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES === 'true';
  if (allowInsecure) {
    return false;
  }
  return isProduction;
}

/**
 * Centralized security options helper for auth cookies.
 */
export function getAuthCookieSecurityOptions(
  isProduction = true,
): { secure: boolean; sameSite: 'lax' } {
  return {
    secure: shouldSecureAuthCookies(isProduction),
    sameSite: 'lax',
  };
}

export function getRefreshCookieOptions(isProduction = true): CookieOptions {
  const security = getAuthCookieSecurityOptions(isProduction);
  return {
    httpOnly: true,
    secure: security.secure,
    sameSite: security.sameSite,
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export function getLoggedInCookieOptions(isProduction = true): CookieOptions {
  const security = getAuthCookieSecurityOptions(isProduction);
  return {
    httpOnly: false,
    secure: security.secure,
    sameSite: security.sameSite,
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export function getClearedCookieOptions(isProduction = true): CookieOptions {
  const security = getAuthCookieSecurityOptions(isProduction);
  return {
    httpOnly: true,
    secure: security.secure,
    sameSite: security.sameSite,
    path: '/',
    maxAge: 0,
  };
}

/**
 * Parse a raw Cookie header into key-value pairs
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, cookieStr) => {
    const trimmed = cookieStr.trim();
    if (!trimmed) return acc;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return acc;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    acc[key] = decodeURIComponent(val);
    return acc;
  }, {});
}

/**
 * Serialize a cookie name, value, and options into a Set-Cookie header string
 */
export function serializeCookie(
  name: string,
  value: string,
  options: Partial<CookieOptions> = {},
): string {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  const path = options.path ?? '/';
  parts.push(`Path=${path}`);

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  if (options.sameSite) {
    const capitalized =
      options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase();
    parts.push(`SameSite=${capitalized}`);
  }

  return parts.join('; ');
}
