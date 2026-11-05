import { invoke } from '@tauri-apps/api/core';
import type { SecureTokenStorage } from '@atlas/api-client';

export type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Native Windows Secure Token Storage Adapter for Project Atlas.
 * Delegates credential storage to Tauri IPC backed by Windows Credential Manager (DPAPI).
 * Guarantees that token strings are sanitized and never reflected in thrown error messages.
 */
export class TauriSecureTokenStorage implements SecureTokenStorage {
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
      throw new Error(`[SecureStorage] Failed to read refresh token: ${msg}`);
    }
  }

  async setRefreshToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('[SecureStorage] Invalid token: refresh token must be a non-empty string');
    }

    try {
      await this.invokeFn<void>('storage_set_refresh_token', { token });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[SecureStorage] Failed to persist refresh token: ${msg}`);
    }
  }

  async clearRefreshToken(): Promise<void> {
    try {
      await this.invokeFn<void>('storage_clear_refresh_token');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[SecureStorage] Failed to clear refresh token: ${msg}`);
    }
  }
}
