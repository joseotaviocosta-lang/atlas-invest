import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore, getInMemoryAccessToken } from '../../apps/mobile/src/stores/auth.store';
import { secureStorage } from '../../apps/mobile/src/storage/secure-store';
import { clearMockSecureStore } from './setup';

describe('Mobile Auth: Zustand Auth Store & Session Lifecycle', () => {
  beforeEach(async () => {
    clearMockSecureStore();
    await useAuthStore.getState().logout();
  });

  it('should initialize with unauthenticated state after clean logout', () => {
    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
  });

  it('should save session, store refresh token in secureStorage and keep access token in memory', async () => {
    const mockUser = {
      id: 'usr-123',
      email: 'investor@atlas.dev',
      name: 'Investor',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      baseCurrency: 'BRL',
    };

    await useAuthStore
      .getState()
      .setSession(mockUser, 'in-memory-access-token-xyz', 'secure-refresh-token-abc');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('in-memory-access-token-xyz');
    expect(getInMemoryAccessToken()).toBe('in-memory-access-token-xyz');

    // SecureStore must have the refresh token
    expect(await secureStorage.getRefreshToken()).toBe('secure-refresh-token-abc');
  });

  it('should restore session successfully when valid refresh token is present in storage', async () => {
    await secureStorage.setRefreshToken('existing-refresh-token');

    const mockOnRefresh = vi.fn().mockResolvedValue({
      accessToken: 'new-rotated-access-token',
      refreshToken: 'new-rotated-refresh-token',
      user: {
        id: 'usr-123',
        email: 'restored@atlas.dev',
        name: 'Restored User',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
    });

    const success = await useAuthStore.getState().restoreSession(mockOnRefresh);

    expect(success).toBe(true);
    expect(mockOnRefresh).toHaveBeenCalledWith('existing-refresh-token');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('new-rotated-access-token');
    expect(getInMemoryAccessToken()).toBe('new-rotated-access-token');
    expect(state.user?.email).toBe('restored@atlas.dev');

    // Rotated token saved to SecureStore
    expect(await secureStorage.getRefreshToken()).toBe('new-rotated-refresh-token');
  });

  it('should clear storage and transition to unauthenticated when restoreSession fails', async () => {
    await secureStorage.setRefreshToken('stale-or-revoked-token');

    const mockOnRefresh = vi.fn().mockRejectedValue(new Error('Session revoked'));

    const success = await useAuthStore.getState().restoreSession(mockOnRefresh);

    expect(success).toBe(false);
    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();

    // Secure storage must have been cleared
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });

  it('should clear all in-memory and secure tokens on explicit logout', async () => {
    await useAuthStore.getState().setSession(
      {
        id: 'usr-456',
        email: 'logout@atlas.dev',
        name: 'Logout User',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        baseCurrency: 'BRL',
      },
      'access-token',
      'refresh-token',
    );

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });
});
