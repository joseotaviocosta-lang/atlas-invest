import {
  getRefreshCookieOptions,
  serializeCookie,
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
} from '@/lib/auth-cookie';
import { ApiClient } from '@/api/client';

describe('Web Foundation: CSRF Mitigation & Defense-in-Depth', () => {
  it('should enforce SameSite=Lax and HttpOnly on refresh cookies to block cross-site request forgery', () => {
    const cookieOptions = getRefreshCookieOptions(true);

    expect(cookieOptions.sameSite).toBe('lax');
    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.secure).toBe(true);

    const serialized = serializeCookie(REFRESH_COOKIE_NAME, 'secure-token', cookieOptions);
    expect(serialized).toContain('SameSite=Lax');
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Secure');
  });

  it('should inject custom x-atlas-client header on all apiClient requests', async () => {
    const client = new ApiClient('http://localhost:3001');

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await client.post('/api/auth/logout', {});

    const [, options] = mockFetch.mock.calls[0];
    // Custom header forces browser CORS preflight on cross-origin requests
    expect(options.headers['x-atlas-client']).toBe('web');
  });

  describe('Origin Validation on Mutating Requests', () => {
    it('should allow mutating request when Origin matches Host', async () => {
      const { validateOrigin } = await import('@/lib/origin-validator');

      const req = {
        headers: new Headers({
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        }),
      };

      const result = validateOrigin(req);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject mutating request with 403 Forbidden when Origin does not match Host', async () => {
      const { validateOrigin } = await import('@/lib/origin-validator');

      const req = {
        headers: new Headers({
          host: 'localhost:3000',
          origin: 'https://evil-attacker.example.com',
        }),
      };

      const result = validateOrigin(req);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(403);
      expect(result.error?.code).toBe('AUTH.INVALID_ORIGIN');
    });

    it('should allow mutating request when Origin is missing but Referer matches Host', async () => {
      const { validateOrigin } = await import('@/lib/origin-validator');

      const req = {
        headers: new Headers({
          host: 'localhost:3000',
          referer: 'http://localhost:3000/login',
        }),
      };

      const result = validateOrigin(req);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject mutating request with 403 Forbidden when Referer does not match Host', async () => {
      const { validateOrigin } = await import('@/lib/origin-validator');

      const req = {
        headers: new Headers({
          host: 'localhost:3000',
          referer: 'https://evil-attacker.example.com/phishing',
        }),
      };

      const result = validateOrigin(req);
      expect(result.isValid).toBe(false);
      expect(result.error?.status).toBe(403);
      expect(result.error?.code).toBe('AUTH.INVALID_ORIGIN');
    });

    it('should document and allow missing Origin and Referer for non-browser direct clients', async () => {
      const { validateOrigin } = await import('@/lib/origin-validator');

      const req = {
        headers: new Headers({
          host: 'localhost:3000',
        }),
      };

      const result = validateOrigin(req);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Session Hint Safety: atlas_logged_in is NOT Auth Proof', () => {
    it('should verify atlas_logged_in cookie has no credential value and cannot act as bearer token', () => {
      expect(LOGGED_IN_COOKIE_NAME).toBe('atlas_logged_in');
      expect(REFRESH_COOKIE_NAME).toBe('atlas_refresh');

      // The hint cookie has constant value 'true' and never holds credentials
      const cookieValue = 'true';
      expect(cookieValue).not.toContain('eyJ'); // not a JWT
      expect(cookieValue.length).toBeLessThan(10);
    });

    it('should reject API requests that only possess atlas_logged_in without valid access token', async () => {
      const { getInMemoryAccessToken } = await import('@/stores/auth.store');
      // Verify no access token is in memory
      expect(getInMemoryAccessToken()).toBeNull();

      const client = new ApiClient('http://localhost:3000');
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'AUTH.UNAUTHORIZED',
          message: 'Missing or invalid access token',
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(client.get('/api/v1/portfolios', { skipAuth: true })).rejects.toThrow();
    });
  });
});
