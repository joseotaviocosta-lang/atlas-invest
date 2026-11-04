import { describe, it, expect, afterEach } from 'vitest';
import {
  parseCookies,
  serializeCookie,
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
  getClearedCookieOptions,
  shouldSecureAuthCookies,
  getAuthCookieSecurityOptions,
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

  describe('Staging HTTP Compatibility Hotfix (ADR-290 / Staging IP-Only)', () => {
    const originalEnv = process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      } else {
        process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = originalEnv;
      }
    });

    it('1. default/produção segura: ALLOW_INSECURE_HTTP_AUTH_COOKIES ausente -> Secure=true', () => {
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;

      expect(shouldSecureAuthCookies()).toBe(true);
      expect(shouldSecureAuthCookies(true)).toBe(true);

      const security = getAuthCookieSecurityOptions();
      expect(security.secure).toBe(true);

      const refreshOptions = getRefreshCookieOptions(true);
      expect(refreshOptions.secure).toBe(true);

      const loggedInOptions = getLoggedInCookieOptions(true);
      expect(loggedInOptions.secure).toBe(true);

      const clearedOptions = getClearedCookieOptions(true);
      expect(clearedOptions.secure).toBe(true);
    });

    it('1b. produção segura: ALLOW_INSECURE_HTTP_AUTH_COOKIES=false -> Secure=true', () => {
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'false';

      expect(shouldSecureAuthCookies()).toBe(true);
      expect(shouldSecureAuthCookies(true)).toBe(true);
      expect(getRefreshCookieOptions(true).secure).toBe(true);
      expect(getLoggedInCookieOptions(true).secure).toBe(true);
      expect(getClearedCookieOptions(true).secure).toBe(true);
    });

    it('2. staging HTTP explícito: ALLOW_INSECURE_HTTP_AUTH_COOKIES=true -> Secure=false', () => {
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';

      expect(shouldSecureAuthCookies()).toBe(false);
      expect(shouldSecureAuthCookies(true)).toBe(false);

      const security = getAuthCookieSecurityOptions();
      expect(security.secure).toBe(false);

      const refreshOptions = getRefreshCookieOptions(true);
      expect(refreshOptions.secure).toBe(false);

      const loggedInOptions = getLoggedInCookieOptions(true);
      expect(loggedInOptions.secure).toBe(false);

      const clearedOptions = getClearedCookieOptions(true);
      expect(clearedOptions.secure).toBe(false);
    });

    it('3. HttpOnly preservado tanto em modo seguro quanto em staging HTTP', () => {
      // In staging HTTP (ALLOW_INSECURE_HTTP_AUTH_COOKIES=true)
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';
      expect(getRefreshCookieOptions(true).httpOnly).toBe(true);
      expect(getLoggedInCookieOptions(true).httpOnly).toBe(false);
      expect(getClearedCookieOptions(true).httpOnly).toBe(true);

      // In production (ALLOW_INSECURE_HTTP_AUTH_COOKIES absent)
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      expect(getRefreshCookieOptions(true).httpOnly).toBe(true);
      expect(getLoggedInCookieOptions(true).httpOnly).toBe(false);
      expect(getClearedCookieOptions(true).httpOnly).toBe(true);
    });

    it('4. SameSite=lax preservado tanto em modo seguro quanto em staging HTTP', () => {
      // In staging HTTP
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';
      expect(getRefreshCookieOptions(true).sameSite).toBe('lax');
      expect(getLoggedInCookieOptions(true).sameSite).toBe('lax');
      expect(getClearedCookieOptions(true).sameSite).toBe('lax');

      // In production
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      expect(getRefreshCookieOptions(true).sameSite).toBe('lax');
      expect(getLoggedInCookieOptions(true).sameSite).toBe('lax');
      expect(getClearedCookieOptions(true).sameSite).toBe('lax');
    });

    it('5. logout/expiração dos cookies segue a mesma política de secure', () => {
      // Default prod
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      const clearedProd = getClearedCookieOptions(true);
      expect(clearedProd.secure).toBe(true);
      expect(clearedProd.maxAge).toBe(0);
      expect(clearedProd.path).toBe('/');

      // Staging HTTP
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';
      const clearedStaging = getClearedCookieOptions(true);
      expect(clearedStaging.secure).toBe(false);
      expect(clearedStaging.maxAge).toBe(0);
      expect(clearedStaging.path).toBe('/');
    });

    it('6. refresh cookie e logged-in cookie permanecem coerentes em suas opções de segurança', () => {
      // Default prod
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      const prodRefresh = getRefreshCookieOptions(true);
      const prodLoggedIn = getLoggedInCookieOptions(true);
      expect(prodRefresh.secure).toBe(prodLoggedIn.secure);
      expect(prodRefresh.sameSite).toBe(prodLoggedIn.sameSite);
      expect(prodRefresh.path).toBe(prodLoggedIn.path);

      // Staging HTTP
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';
      const stagingRefresh = getRefreshCookieOptions(true);
      const stagingLoggedIn = getLoggedInCookieOptions(true);
      expect(stagingRefresh.secure).toBe(stagingLoggedIn.secure);
      expect(stagingRefresh.sameSite).toBe(stagingLoggedIn.sameSite);
      expect(stagingRefresh.path).toBe(stagingLoggedIn.path);
    });
  });
});
