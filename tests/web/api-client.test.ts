import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { queryClient } from '@/lib/react-query';

describe('Web Foundation: ApiClient & Single-Flight Refresh Mutex', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3001');
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('should include Authorization header and x-atlas-client: web on authenticated requests', async () => {
    useAuthStore.getState().setSession(
      {
        id: '1',
        name: 'A',
        email: 'a@a.com',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'test-token-123',
    );

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await client.get('/api/v1/portfolios');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-token-123');
    expect(options.headers['x-atlas-client']).toBe('web');
  });

  it('should parse non-ok responses into ApiError with status and code', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        code: 'VALIDATION.INVALID_INPUT',
        message: 'Name is required',
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(client.post('/api/v1/portfolios', {})).rejects.toThrow(ApiError);
  });

  it('should detect offline status and throw OFFLINE ApiError without making network request', async () => {
    // Mock browser environment with offline state
    (global as unknown as { window?: unknown }).window = {};
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });

    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(client.get('/api/v1/portfolios')).rejects.toMatchObject({
      code: 'OFFLINE',
      isOffline: true,
    });
    expect(mockFetch).not.toHaveBeenCalled();

    // Restore
    delete (global as unknown as { window?: unknown }).window;
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
  });

  it('should execute single-flight refresh on concurrent 401s and retry original requests', async () => {
    useAuthStore.getState().setSession(
      {
        id: '1',
        name: 'A',
        email: 'a@a.com',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'expired-token',
    );

    let refreshCallCount = 0;

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      // 1. Initial requests receive 401
      if (url.includes('/api/v1/portfolios') && !url.includes('new-access-token')) {
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const reqOptions = lastCall?.[1] as RequestInit | undefined;
        const headers = reqOptions?.headers as Record<string, string> | undefined;
        if (headers?.['Authorization'] === 'Bearer expired-token') {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ message: 'Token expired' }),
          });
        }
        // Retried requests with new token succeed
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'p1', name: 'Main' }] }),
        });
      }

      // 2. Refresh endpoint
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: { accessToken: 'new-access-token', expiresIn: 900 },
          }),
        });
      }

      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    // Fire 2 concurrent requests that both trigger 401
    const [res1, res2] = await Promise.all([
      client.get<{ data: Array<Record<string, unknown>> }>('/api/v1/portfolios'),
      client.get<{ data: Array<Record<string, unknown>> }>('/api/v1/portfolios'),
    ]);

    expect(res1.data).toHaveLength(1);
    expect(res2.data).toHaveLength(1);

    // Assert that /api/auth/refresh was called EXACTLY ONCE (single-flight mutex!)
    expect(refreshCallCount).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('new-access-token');
  });

  it('should purge query cache and clear store if refresh fails on 401', async () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');

    useAuthStore.getState().setSession(
      {
        id: '1',
        name: 'A',
        email: 'a@a.com',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'expired-token',
    );

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/portfolios')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ message: 'Token expired' }),
        });
      }
      if (url === '/api/auth/refresh') {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ code: 'AUTH.SESSION_REVOKED', message: 'Session revoked' }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(client.get('/api/v1/portfolios')).rejects.toThrow(ApiError);

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(clearSpy).toHaveBeenCalled();
  });

  it('should return raw text when content-type is text/csv or text/plain', async () => {
    const csvContent = 'ticker;quantity;cost\nPETR4;200;4404.90';
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv; charset=utf-8' }),
      text: async () => csvContent,
      json: async () => {
        throw new Error('Unexpected JSON parse on CSV content');
      },
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await client.get<string>('/api/v1/fiscal/annual/2026/reporting/export', {
      headers: { Accept: 'text/csv' },
    });

    expect(res).toBe(csvContent);
  });
});
