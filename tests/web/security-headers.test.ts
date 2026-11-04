import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSecurityHeaders,
  shouldDisableHsts,
  BASE_SECURITY_HEADERS,
  HSTS_HEADER_KEY,
  HSTS_HEADER_VALUE,
} from '@/lib/security-headers';
import { sanitizeManifestHeaders } from '../../apps/web/docker-entrypoint.js';
import { shouldSecureAuthCookies, getRefreshCookieOptions } from '@/lib/auth-cookie';

describe('Web Foundation: Security Headers & Staging HSTS Policy (ADR-290)', () => {
  const originalHstsEnv = process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
  });

  afterEach(() => {
    if (originalHstsEnv === undefined) {
      delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
    } else {
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = originalHstsEnv;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('1. shouldDisableHsts() predicate', () => {
    it('returns false by default when DISABLE_HSTS_FOR_HTTP_STAGING is unset', () => {
      delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
      expect(shouldDisableHsts()).toBe(false);
    });

    it('returns false when DISABLE_HSTS_FOR_HTTP_STAGING is "false"', () => {
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'false';
      expect(shouldDisableHsts()).toBe(false);
    });

    it('returns false for arbitrary non-true values', () => {
      for (const val of ['', '0', 'no', 'disabled', 'undefined', 'null']) {
        process.env.DISABLE_HSTS_FOR_HTTP_STAGING = val;
        expect(shouldDisableHsts()).toBe(false);
      }
    });

    it('does not infer relaxation merely from NODE_ENV', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
      expect(shouldDisableHsts()).toBe(false);

      process.env.NODE_ENV = 'test';
      expect(shouldDisableHsts()).toBe(false);

      process.env.NODE_ENV = 'production';
      expect(shouldDisableHsts()).toBe(false);
    });

    it('returns true strictly and exclusively when DISABLE_HSTS_FOR_HTTP_STAGING === "true"', () => {
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'true';
      expect(shouldDisableHsts()).toBe(true);
    });
  });

  describe('2. getSecurityHeaders() header composition', () => {
    it('preserves HSTS and all baseline security headers by default (production/HTTPS)', () => {
      delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
      const headers = getSecurityHeaders();

      // Exactly 5 headers
      expect(headers).toHaveLength(5);

      // Baseline headers present
      expect(headers).toEqual(
        expect.arrayContaining([
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: HSTS_HEADER_KEY, value: HSTS_HEADER_VALUE },
        ]),
      );

      // Verify specific HSTS header values
      const hsts = headers.find((h) => h.key === HSTS_HEADER_KEY);
      expect(hsts).toBeDefined();
      expect(hsts?.value).toBe('max-age=63072000; includeSubDomains; preload');
    });

    it('omits HSTS exclusively when DISABLE_HSTS_FOR_HTTP_STAGING === "true"', () => {
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'true';
      const headers = getSecurityHeaders();

      // Exactly 4 baseline headers
      expect(headers).toHaveLength(4);

      // HSTS header is strictly absent
      const hsts = headers.find((h) => h.key.toLowerCase() === 'strict-transport-security');
      expect(hsts).toBeUndefined();

      // All 4 baseline security headers are preserved intact
      expect(headers).toEqual([...BASE_SECURITY_HEADERS]);
      expect(headers).toEqual([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ]);
    });

    it('re-enables HSTS immediately when flag is toggled back to false', () => {
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'true';
      expect(getSecurityHeaders().some((h) => h.key === HSTS_HEADER_KEY)).toBe(false);

      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'false';
      expect(getSecurityHeaders().some((h) => h.key === HSTS_HEADER_KEY)).toBe(true);
    });
  });

  describe('3. Docker standalone runtime manifest sanitization', () => {
    it('strips Strict-Transport-Security from routes-manifest headers array', () => {
      const mockManifest = {
        version: 3,
        headers: [
          {
            source: '/:path*',
            headers: [
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
              { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
            ],
          },
        ],
      };

      const modified = sanitizeManifestHeaders(mockManifest);
      expect(modified).toBe(true);

      const headers = mockManifest.headers[0].headers;
      expect(headers).toHaveLength(4);
      expect(headers.some((h) => h.key.toLowerCase() === 'strict-transport-security')).toBe(false);
      expect(headers.map((h) => h.key)).toEqual([
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]);
    });

    it('returns false and does not mutate if HSTS is not present', () => {
      const mockManifest = {
        version: 3,
        headers: [
          {
            source: '/:path*',
            headers: [
              { key: 'X-Content-Type-Options', value: 'nosniff' },
            ],
          },
        ],
      };

      const modified = sanitizeManifestHeaders(mockManifest);
      expect(modified).toBe(false);
      expect(mockManifest.headers[0].headers).toHaveLength(1);
    });

    it('handles malformed manifests gracefully without throwing', () => {
      expect(sanitizeManifestHeaders(null)).toBe(false);
      expect(sanitizeManifestHeaders(undefined)).toBe(false);
      expect(sanitizeManifestHeaders({})).toBe(false);
      expect(sanitizeManifestHeaders({ headers: 'not-array' })).toBe(false);
    });
  });

  describe('4. Independence & Non-Regression of Auth Cookies', () => {
    it('ensures DISABLE_HSTS_FOR_HTTP_STAGING does not alter auth cookie security', () => {
      // Default: secure cookies
      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
      delete process.env.DISABLE_HSTS_FOR_HTTP_STAGING;
      expect(shouldSecureAuthCookies(true)).toBe(true);

      // Setting DISABLE_HSTS_FOR_HTTP_STAGING has zero effect on auth cookie policy
      process.env.DISABLE_HSTS_FOR_HTTP_STAGING = 'true';
      expect(shouldSecureAuthCookies(true)).toBe(true);
      expect(getRefreshCookieOptions(true).secure).toBe(true);

      // Only ALLOW_INSECURE_HTTP_AUTH_COOKIES affects auth cookie policy
      process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES = 'true';
      expect(shouldSecureAuthCookies(true)).toBe(false);
      expect(getRefreshCookieOptions(true).secure).toBe(false);

      delete process.env.ALLOW_INSECURE_HTTP_AUTH_COOKIES;
    });
  });
});
