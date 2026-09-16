import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, ApiError } from '../../apps/mobile/src/api/client';
import { useAuthStore, getInMemoryAccessToken } from '../../apps/mobile/src/stores/auth.store';
import { secureStorage } from '../../apps/mobile/src/storage/secure-store';
import { clearMockSecureStore } from './setup';

describe('Mobile API Client: Single-Flight Refresh & Token Interceptors', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    clearMockSecureStore();
    await useAuthStore.getState().logout();
    apiClient.setBaseUrl('http://localhost:3001');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Single-Flight Refresh: should merge 5 concurrent 401s into a single refresh call and retry all successfully', async () => {
    // 1. Initial State: Valid session with access token and refresh token
    await useAuthStore.getState().setSession(
      {
        id: 'usr-1',
        email: 'singleflight@atlas.dev',
        name: 'Single Flight User',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
      'expired-access-token',
      'valid-refresh-token',
    );

    let refreshCallCount = 0;
    const requestCalls: string[] = [];

    // Mock global fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      // Handle refresh endpoint
      if (url.includes('/api/v1/auth/refresh')) {
        refreshCallCount++;
        return new Response(
          JSON.stringify({
            data: {
              accessToken: 'brand-new-rotated-access-token',
              refreshToken: 'brand-new-rotated-refresh-token',
              expiresIn: 900,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Handle resource requests
      const headers = new Headers(init?.headers);
      const authHeader = headers.get('Authorization');

      requestCalls.push(`${url} with [${authHeader}]`);

      if (authHeader === 'Bearer expired-access-token') {
        // Return 401 to trigger refresh
        return new Response(
          JSON.stringify({
            statusCode: 401,
            message: 'Access token expired',
            code: 'AUTH.TOKEN_EXPIRED',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (authHeader === 'Bearer brand-new-rotated-access-token') {
        // Return success for retried request
        return new Response(
          JSON.stringify({
            data: { resourceUrl: url, status: 'ok' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Unauthorized', { status: 401 });
    });

    // Fire 5 concurrent requests while token is expired
    const endpoints = [
      '/api/v1/portfolios',
      '/api/v1/portfolios/1',
      '/api/v1/portfolios/2',
      '/api/v1/institutions',
      '/api/v1/assets',
    ];

    const results = await Promise.all(
      endpoints.map((ep) => apiClient.get<{ data: { resourceUrl: string; status: string } }>(ep)),
    );

    // Assert: Exactly ONE refresh was triggered across all 5 concurrent calls!
    expect(refreshCallCount).toBe(1);

    // All 5 requests succeeded with the new token
    expect(results).toHaveLength(5);
    results.forEach((res, index) => {
      expect(res.data.status).toBe('ok');
      expect(res.data.resourceUrl).toContain(endpoints[index]);
    });

    // In-memory token updated in authStore
    expect(getInMemoryAccessToken()).toBe('brand-new-rotated-access-token');

    // Secure storage updated with new rotated refresh token
    expect(await secureStorage.getRefreshToken()).toBe('brand-new-rotated-refresh-token');
  });

  it('Loop Prevention: should never loop infinitely if retried request still returns 401', async () => {
    await useAuthStore.getState().setSession(
      {
        id: 'usr-2',
        email: 'noloop@atlas.dev',
        name: 'No Loop',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
      'bad-token',
      'refresh-token',
    );

    let refreshCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes('/api/v1/auth/refresh')) {
        refreshCount++;
        return new Response(
          JSON.stringify({
            data: {
              accessToken: 'new-token-that-is-still-rejected',
              refreshToken: 'new-refresh-token',
              expiresIn: 900,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Always return 401
      return new Response(JSON.stringify({ statusCode: 401, message: 'Always unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(apiClient.get('/api/v1/portfolios')).rejects.toThrow(ApiError);

    // Refresh must be called at most once (no loop!)
    expect(refreshCount).toBe(1);
  });

  it('Session Revocation: should logout user and clear storage when refresh fails with 401', async () => {
    await useAuthStore.getState().setSession(
      {
        id: 'usr-3',
        email: 'revoked@atlas.dev',
        name: 'Revoked User',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
      'expired-access-token',
      'invalid-or-reused-refresh-token',
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes('/api/v1/auth/refresh')) {
        return new Response(
          JSON.stringify({
            statusCode: 401,
            message: 'Refresh token reuse detected. Session has been revoked.',
            code: 'AUTH.INVALID_REFRESH_TOKEN',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Expired access token', { status: 401 });
    });

    await expect(apiClient.get('/api/v1/portfolios')).rejects.toThrow(ApiError);

    // State must be cleared and logged out
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });

  it('Offline Detection: should detect network failures and return isOffline flag', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      await apiClient.get('/api/v1/portfolios');
      expect.unreachable('Should have thrown ApiError');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.isOffline).toBe(true);
      expect(apiError.code).toBe('COMMON.NETWORK_ERROR');
    }
  });
});
