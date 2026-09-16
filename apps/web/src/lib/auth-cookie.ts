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

export function getRefreshCookieOptions(
  isProduction = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export function getLoggedInCookieOptions(
  isProduction = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export function getClearedCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
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
