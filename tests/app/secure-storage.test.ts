import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriSecureTokenStorage } from '../../apps/atlas-app/src/auth/tauri-secure-token-storage';
import { resolveTokenStorage } from '../../apps/atlas-app/src/lib/api';
import { MemorySecureTokenStorage, SessionManager, ApiClient } from '@atlas/api-client';

describe('Native Secure Token Storage Adapter (APP-4)', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let storage: TauriSecureTokenStorage;

  beforeEach(() => {
    mockInvoke = vi.fn();
    storage = new TauriSecureTokenStorage(mockInvoke);
  });

  describe('Storage Resolution Strategy', () => {
    it('resolves MemorySecureTokenStorage when not running inside Tauri', () => {
      const resolved = resolveTokenStorage(false);
      expect(resolved).toBeInstanceOf(MemorySecureTokenStorage);
    });

    it('strictly resolves TauriSecureTokenStorage when running in Tauri native runtime', () => {
      const resolved = resolveTokenStorage(true);
      expect(resolved).toBeInstanceOf(TauriSecureTokenStorage);
    });
  });

  describe('TauriSecureTokenStorage Operations', () => {
    it('returns null when no refresh token is stored in native credential manager', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const token = await storage.getRefreshToken();
      expect(token).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('storage_get_refresh_token');
    });

    it('returns the stored token when credential manager contains valid entry', async () => {
      mockInvoke.mockResolvedValueOnce('native-refresh-token-xyz');

      const token = await storage.getRefreshToken();
      expect(token).toBe('native-refresh-token-xyz');
      expect(mockInvoke).toHaveBeenCalledWith('storage_get_refresh_token');
    });

    it('persists a new token through native Tauri IPC invoke', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await storage.setRefreshToken('new-rotated-token-123');
      expect(mockInvoke).toHaveBeenCalledWith('storage_set_refresh_token', {
        token: 'new-rotated-token-123',
      });
    });

    it('clears stored credential through native Tauri IPC invoke', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await storage.clearRefreshToken();
      expect(mockInvoke).toHaveBeenCalledWith('storage_clear_refresh_token');
    });

    it('rejects empty or whitespace-only tokens before calling native bridge', async () => {
      await expect(storage.setRefreshToken('')).rejects.toThrow('Invalid token');
      await expect(storage.setRefreshToken('   ')).rejects.toThrow('Invalid token');
      // @ts-expect-error test invalid type
      await expect(storage.setRefreshToken(null)).rejects.toThrow('Invalid token');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('Failure Safety & Error Sanitization', () => {
    it('wraps and sanitizes read errors without leaking sensitive token data', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Access denied to OS credential store'));

      await expect(storage.getRefreshToken()).rejects.toThrow(
        '[SecureStorage] Failed to read refresh token: Access denied to OS credential store'
      );
    });

    it('wraps write errors without echoing the attempted token value', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('OS key store quota exceeded'));

      const sensitiveToken = 'very-secret-token-abc-999';
      let caughtError: Error | null = null;
      try {
        await storage.setRefreshToken(sensitiveToken);
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.message).toContain('[SecureStorage] Failed to persist refresh token: OS key store quota exceeded');
      // Invariant: The token value MUST NEVER appear in the error message
      expect(caughtError?.message).not.toContain(sensitiveToken);
    });

    it('wraps clear errors safely', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Keyring lock contention'));

      await expect(storage.clearRefreshToken()).rejects.toThrow(
        '[SecureStorage] Failed to clear refresh token: Keyring lock contention'
      );
    });
  });

  describe('SessionManager Lifecycle with Native Storage', () => {
    it('clears native storage upon user logout even if remote API fails', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const client = new ApiClient({
        baseUrl: 'http://localhost:3001',
        fetchFn: vi.fn().mockRejectedValue(new Error('Network offline')),
      });

      const session = new SessionManager({
        client,
        storage,
      });

      await session.logout();

      expect(mockInvoke).toHaveBeenCalledWith('storage_clear_refresh_token');
      expect(session.getAccessToken()).toBeNull();
      expect(session.getAuthState().status).toBe('anonymous');
    });

    it('does not store access token in native storage or any Web storage', async () => {
      const mockStorage = new MemorySecureTokenStorage();
      const client = new ApiClient({ baseUrl: 'http://localhost:3001' });
      const session = new SessionManager({ client, storage: mockStorage });

      expect(session.getAccessToken()).toBeNull();
      expect(await mockStorage.getRefreshToken()).toBeNull();
    });
  });
});
