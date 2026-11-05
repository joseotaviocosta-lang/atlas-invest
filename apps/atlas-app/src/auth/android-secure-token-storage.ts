import { invoke } from '@tauri-apps/api/core';
import type { SecureTokenStorage } from '@atlas/api-client';

export type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Android Native Secure Token Storage Adapter for Project Atlas (Phase APP-10).
 * Delegates credential storage to Tauri IPC backed by Android Keystore and
 * EncryptedSharedPreferences (AES-256 GCM).
 *
 * Guarantees:
 * 1. Refresh token is persisted securely in hardware-backed Android Keystore.
 * 2. Token values are never reflected in error messages, console logs, or stack traces.
 * 3. Atomic synchronous persistence across app process terminations and restarts.
 */
export class AndroidSecureTokenStorage implements SecureTokenStorage {
  private readonly invokeFn: TauriInvokeFn;

  constructor(invokeFn?: TauriInvokeFn) {
    this.invokeFn = invokeFn ?? invoke;
  }

  async getRefreshToken(): Promise<string | null> {
    try {
      const token = await this.invokeFn<string | null>('storage_get_refresh_token');
      return token ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[AndroidSecureStorage] Failed to read refresh token: ${msg}`);
    }
  }

  async setRefreshToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('[AndroidSecureStorage] Invalid token: refresh token must be a non-empty string');
    }

    try {
      await this.invokeFn<void>('storage_set_refresh_token', { token });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[AndroidSecureStorage] Failed to persist refresh token: ${msg}`);
    }
  }

  async clearRefreshToken(): Promise<void> {
    try {
      await this.invokeFn<void>('storage_clear_refresh_token');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[AndroidSecureStorage] Failed to clear refresh token: ${msg}`);
    }
  }
}
