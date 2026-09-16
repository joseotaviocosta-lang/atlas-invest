import { describe, it, expect } from 'vitest';
import { getRefreshCookieOptions, serializeCookie, REFRESH_COOKIE_NAME } from '@/lib/auth-cookie';
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
});
