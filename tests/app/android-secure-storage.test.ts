import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AndroidSecureTokenStorage } from '../../apps/atlas-app/src/auth/android-secure-token-storage';
import { TauriSecureTokenStorage } from '../../apps/atlas-app/src/auth/tauri-secure-token-storage';
import { resolveTokenStorage } from '../../apps/atlas-app/src/lib/api';
import {
  createInstalledSession,
  MemorySecureTokenStorage,
  type AuthUser,
  type SecureTokenStorage,
} from '@atlas/api-client';

describe('Android Native Secure Token Storage Adapter (APP-10)', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let androidStorage: AndroidSecureTokenStorage;
  let simulatedKeystore: string | null = null;
  const originalUserAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const originalFetch = global.fetch;

  const mockUser: AuthUser = {
    id: 'user-123',
    email: 'investor@atlas.com',
    name: 'Investor',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    baseCurrency: 'BRL',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    simulatedKeystore = null;

    mockInvoke = vi.fn().mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'storage_get_refresh_token') {
        return Promise.resolve(simulatedKeystore);
      }
      if (cmd === 'storage_set_refresh_token') {
        simulatedKeystore = (args?.token as string) ?? null;
        return Promise.resolve(undefined);
      }
      if (cmd === 'storage_clear_refresh_token') {
        simulatedKeystore = null;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(null);
    });

    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    androidStorage = new AndroidSecureTokenStorage(mockInvoke);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
    }
    vi.restoreAllMocks();
  });

  describe('PARTE N1..N3: Runtime Storage Resolution Strategy', () => {
    it('1. Android runtime resolves AndroidSecureTokenStorage when in Tauri on Android', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 14; Redmi 12 Build/UKQ1.230917.001) AppleWebKit/537.36',
        configurable: true,
      });

      const resolved = resolveTokenStorage(true);
      expect(resolved).toBeInstanceOf(AndroidSecureTokenStorage);
    });

    it('2. Windows runtime resolves TauriSecureTokenStorage (DPAPI)', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true,
      });

      const resolved = resolveTokenStorage(true);
      expect(resolved).toBeInstanceOf(TauriSecureTokenStorage);
    });

    it('3. Browser test harness resolves MemorySecureTokenStorage when isTauri=false', () => {
      const resolved = resolveTokenStorage(false);
      expect(resolved).toBeInstanceOf(MemorySecureTokenStorage);
    });
  });

  describe('PARTE N4..N7: Basic Operations (get, set, overwrite, clear, read missing)', () => {
    it('4. set and get token through native Android bridge', async () => {
      await androidStorage.setRefreshToken('android-test-refresh-token-123');
      expect(mockInvoke).toHaveBeenCalledWith('storage_set_refresh_token', {
        token: 'android-test-refresh-token-123',
      });

      const retrieved = await androidStorage.getRefreshToken();
      expect(retrieved).toBe('android-test-refresh-token-123');
      expect(mockInvoke).toHaveBeenCalledWith('storage_get_refresh_token');
    });

    it('5. overwrite existing token updates Keystore without error', async () => {
      await androidStorage.setRefreshToken('initial-token');
      await androidStorage.setRefreshToken('overwritten-token');

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'storage_set_refresh_token', {
        token: 'initial-token',
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'storage_set_refresh_token', {
        token: 'overwritten-token',
      });

      const finalToken = await androidStorage.getRefreshToken();
      expect(finalToken).toBe('overwritten-token');
    });

    it('6. clear removes token from native Android Keystore', async () => {
      await androidStorage.setRefreshToken('token-to-delete');
      await androidStorage.clearRefreshToken();
      expect(mockInvoke).toHaveBeenCalledWith('storage_clear_refresh_token');

      const retrieved = await androidStorage.getRefreshToken();
      expect(retrieved).toBeNull();
    });

    it('7. read missing token returns null gracefully', async () => {
      const token = await androidStorage.getRefreshToken();
      expect(token).toBeNull();
    });
  });

  describe('PARTE N8..N10: Error Sanitization (write, read, clear)', () => {
    it('8. write error is sanitized and never leaks the attempted token value', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Keystore key generation failed'));
      const secretToken = 'ultra-secret-refresh-token-xyz';

      let caught: Error | null = null;
      try {
        await androidStorage.setRefreshToken(secretToken);
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).not.toBeNull();
      expect(caught?.message).toContain('[AndroidSecureStorage] Failed to persist refresh token');
      expect(caught?.message).toContain('Keystore key generation failed');
      expect(caught?.message).not.toContain(secretToken);
    });

    it('9. read error is sanitized without throwing raw unhandled exceptions', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Android KeyStore integrity failure'));

      await expect(androidStorage.getRefreshToken()).rejects.toThrow(
        '[AndroidSecureStorage] Failed to read refresh token: Android KeyStore integrity failure'
      );
    });

    it('10. clear error is sanitized safely', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Disk I/O error on SharedPreferences commit'));

      await expect(androidStorage.clearRefreshToken()).rejects.toThrow(
        '[AndroidSecureStorage] Failed to clear refresh token: Disk I/O error on SharedPreferences commit'
      );
    });
  });

  describe('PARTE N11..N12: Plaintext Leak Prevention', () => {
    it('11. access token is NEVER sent to secure storage (only refresh token)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            user: mockUser,
            accessToken: 'jwt-access-token-transient',
            refreshToken: 'opaque-refresh-token-persisted',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: androidStorage,
      });

      await session.login({
        email: 'investor@atlas.com',
        password: 'ValidPass123!',
      });

      // Verify that setRefreshToken was called with ONLY the refresh token, NOT the access token
      expect(mockInvoke).toHaveBeenCalledWith('storage_set_refresh_token', {
        token: 'opaque-refresh-token-persisted',
      });
      expect(mockInvoke).not.toHaveBeenCalledWith('storage_set_refresh_token', {
        token: 'jwt-access-token-transient',
      });
      // Access token is held in-memory only
      expect(session.getAccessToken()).toBe('jwt-access-token-transient');
    });

    it('12. refresh token is never logged to console or logger', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const secret = 'super-secret-token-to-verify-no-logs';

      await androidStorage.setRefreshToken(secret);

      for (const call of consoleSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
      for (const call of errorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    });
  });

  describe('PARTE N13..N17: Session Restoration, Offline, Logout, and Rotation Fail-Closed', () => {
    it('13. restoreSession succeeds when valid refresh token is stored in Android Keystore', async () => {
      // 1. Initial stored refresh token in Android Keystore
      simulatedKeystore = 'valid-persisted-token-v1';

      // 2. Refresh endpoint response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'restored-access-jwt',
            refreshToken: 'rotated-refresh-token-v2',
            expiresIn: 900,
          },
        }),
      });

      // 3. /me endpoint response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: mockUser,
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: androidStorage,
      });

      const restoredUser = await session.restoreSession();

      expect(restoredUser).toEqual(mockUser);
      expect(session.getAuthState().status).toBe('authenticated');
      expect(session.getAccessToken()).toBe('restored-access-jwt');
      expect(mockInvoke).toHaveBeenCalledWith('storage_set_refresh_token', {
        token: 'rotated-refresh-token-v2',
      });
      // Rotated token is now in Keystore
      expect(simulatedKeystore).toBe('rotated-refresh-token-v2');
    });

    it('14. restoreSession with invalid/revoked token clears Android Keystore and stays anonymous', async () => {
      // Stored token exists initially
      simulatedKeystore = 'revoked-refresh-token';

      // Server rejects refresh with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          code: 'AUTH.SESSION_EXPIRED',
          message: 'Session revoked or expired',
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: androidStorage,
      });

      const restored = await session.restoreSession();

      expect(restored).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
      expect(session.getAccessToken()).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('storage_clear_refresh_token');
      expect(simulatedKeystore).toBeNull();
    });

    it('15. restoreSession with network error preserves the stored token (does not log out permanently)', async () => {
      simulatedKeystore = 'persisted-offline-token';

      // Network failure
      mockFetch.mockRejectedValueOnce(new Error('Network offline / connection timeout'));

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: androidStorage,
      });

      const restored = await session.restoreSession();

      expect(restored).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
      // Invariant: Network failures must NOT wipe the stored refresh token!
      expect(mockInvoke).not.toHaveBeenCalledWith('storage_clear_refresh_token');
      expect(simulatedKeystore).toBe('persisted-offline-token');
    });

    it('16. logout completely clears Android Keystore storage and revokes session', async () => {
      simulatedKeystore = 'active-token-for-logout';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: androidStorage,
      });

      await session.logout();

      expect(session.getAuthState().status).toBe('anonymous');
      expect(session.getAccessToken()).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('storage_clear_refresh_token');
      expect(simulatedKeystore).toBeNull();
    });

    it('17. rotation persistence failure triggers fail-closed (clears access token, halts loop)', async () => {
      // Simulate storage write failure during token rotation
      const failingStorage: SecureTokenStorage = {
        getRefreshToken: vi.fn().mockResolvedValue('old-refresh-token'),
        setRefreshToken: vi.fn().mockRejectedValue(new Error('Keystore hardware fault')),
        clearRefreshToken: vi.fn().mockResolvedValue(undefined),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'transient-access-token',
            refreshToken: 'new-unpersistable-token',
            expiresIn: 900,
          },
        }),
      });

      const { session } = createInstalledSession({
        baseUrl: 'https://api.atlasinvest.com.br',
        storage: failingStorage,
      });

      // Attempting to refresh with a storage that fails to persist the new token
      await expect(session.refresh()).rejects.toThrow('Failed to securely persist rotated refresh token');
      // Invariant: Must fail closed, access token must not be active with unpersisted refresh token
      expect(session.getAccessToken()).toBeNull();
    });
  });
});
