import { describe, it, expect } from 'vitest';
import {
  parseCookies,
  serializeCookie,
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
  getClearedCookieOptions,
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE,
} from '@/lib/auth-cookie';

describe('Web Foundation: Auth Cookie Security & Serialization', () => {
  it('should generate secure HttpOnly cookie options for refresh token', () => {
    const prodOptions = getRefreshCookieOptions(true);
    expect(prodOptions.httpOnly).toBe(true);
    expect(prodOptions.secure).toBe(true);
    expect(prodOptions.sameSite).toBe('lax');
    expect(prodOptions.path).toBe('/');
    expect(prodOptions.maxAge).toBe(REFRESH_COOKIE_MAX_AGE);

    const devOptions = getRefreshCookieOptions(false);
    expect(devOptions.httpOnly).toBe(true);
    expect(devOptions.secure).toBe(false);
  });

  it('should generate accessible session hint options for logged_in cookie', () => {
    const options = getLoggedInCookieOptions(true);
    expect(options.httpOnly).toBe(false);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(REFRESH_COOKIE_MAX_AGE);
  });

  it('should generate cleared cookie options with Max-Age 0', () => {
    const cleared = getClearedCookieOptions();
    expect(cleared.maxAge).toBe(0);
    expect(cleared.path).toBe('/');
  });

  it('should serialize cookie with proper attributes and url-encoding', () => {
    const serialized = serializeCookie(REFRESH_COOKIE_NAME, 'raw-token-123==', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    });

    expect(serialized).toContain(`${REFRESH_COOKIE_NAME}=raw-token-123%3D%3D`);
    expect(serialized).toContain('Max-Age=3600');
    expect(serialized).toContain('Path=/');
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Secure');
    expect(serialized).toContain('SameSite=Lax');
  });

  it('should parse raw cookie header into key-value map', () => {
    const header = `${REFRESH_COOKIE_NAME}=token_abc; ${LOGGED_IN_COOKIE_NAME}=true; other=foo%20bar`;
    const parsed = parseCookies(header);

    expect(parsed[REFRESH_COOKIE_NAME]).toBe('token_abc');
    expect(parsed[LOGGED_IN_COOKIE_NAME]).toBe('true');
    expect(parsed['other']).toBe('foo bar');
  });

  it('should safely handle null, undefined, or empty cookie headers', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies('   ')).toEqual({});
  });
});
