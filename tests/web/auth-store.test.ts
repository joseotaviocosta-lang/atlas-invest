import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore, getInMemoryAccessToken } from '@/stores/auth.store';
import { queryClient } from '@/lib/react-query';
import { AuthUser } from '@/api/types';

describe('Web Foundation: Zustand Auth Store Lifecycle & Cache Purge', () => {
  const mockUser: AuthUser = {
    id: 'user-123',
    name: 'Investor One',
    email: 'investor@atlas.dev',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    baseCurrency: 'BRL',
  };

  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('should initialize with unauthenticated/unknown state and null token', () => {
    useAuthStore.setState({ status: 'unknown', user: null, accessToken: null });
    const state = useAuthStore.getState();

    expect(state.status).toBe('unknown');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
  });

  it('should transition to authenticated and set in-memory token on setSession', () => {
    useAuthStore.getState().setSession(mockUser, 'access-jwt-xyz');
    const state = useAuthStore.getState();

    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('access-jwt-xyz');
    expect(getInMemoryAccessToken()).toBe('access-jwt-xyz');
  });

  it('should update access token in-memory and state on setAccessToken', () => {
    useAuthStore.getState().setSession(mockUser, 'token-initial');
    useAuthStore.getState().setAccessToken('token-refreshed');

    expect(useAuthStore.getState().accessToken).toBe('token-refreshed');
    expect(getInMemoryAccessToken()).toBe('token-refreshed');
  });

  it('should purge query cache and nullify access token on clearSession', () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');

    useAuthStore.getState().setSession(mockUser, 'token-to-purge');
    expect(getInMemoryAccessToken()).toBe('token-to-purge');

    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('should successfully restore session from /api/auth/refresh and /api/auth/me', async () => {
    // Mock global fetch
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { accessToken: 'new-restored-token', expiresIn: 900 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockUser,
        }),
      });

    global.fetch = mockFetch as unknown as typeof fetch;

    const restored = await useAuthStore.getState().restoreSession();

    expect(restored).toBe(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().accessToken).toBe('new-restored-token');
    expect(getInMemoryAccessToken()).toBe('new-restored-token');
  });

  it('should handle restore session failure by clearing session', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'No cookie' }),
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    const restored = await useAuthStore.getState().restoreSession();

    expect(restored).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
  });
});
