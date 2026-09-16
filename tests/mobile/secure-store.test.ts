import { describe, it, expect, beforeEach } from 'vitest';
import { secureStorage, REFRESH_TOKEN_KEY } from '../../apps/mobile/src/storage/secure-store';
import { clearMockSecureStore, inMemorySecureStore } from './setup';

describe('Mobile Storage: Secure Store Foundation', () => {
  beforeEach(() => {
    clearMockSecureStore();
  });

  it('should store and retrieve refresh token using secure storage', async () => {
    expect(await secureStorage.getRefreshToken()).toBeNull();

    await secureStorage.setRefreshToken('atlas-test-refresh-token-12345');
    expect(await secureStorage.getRefreshToken()).toBe('atlas-test-refresh-token-12345');

    expect(inMemorySecureStore.get(REFRESH_TOKEN_KEY)).toBe('atlas-test-refresh-token-12345');
  });

  it('should delete refresh token upon logout / session invalidation', async () => {
    await secureStorage.setRefreshToken('token-to-delete');
    expect(await secureStorage.getRefreshToken()).toBe('token-to-delete');

    await secureStorage.deleteRefreshToken();
    expect(await secureStorage.getRefreshToken()).toBeNull();
    expect(inMemorySecureStore.has(REFRESH_TOKEN_KEY)).toBe(false);
  });

  it('Security Invariant: access token and password keys must NEVER exist in SecureStore', async () => {
    await secureStorage.setRefreshToken('valid-refresh-token');

    expect(inMemorySecureStore.has('accessToken')).toBe(false);
    expect(inMemorySecureStore.has('atlas.access-token')).toBe(false);
    expect(inMemorySecureStore.has('password')).toBe(false);
    expect(inMemorySecureStore.size).toBe(1);
  });
});
