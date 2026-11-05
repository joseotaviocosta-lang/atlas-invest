/**
 * Platform-agnostic contract for storing the long-lived refresh token
 * in a secure, hardware-backed, or OS-managed vault (e.g., Windows Credential
 * Manager / DPAPI, Android Keystore, EncryptedSharedPreferences).
 */
export interface SecureTokenStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

/**
 * Deterministic in-memory adapter for testing and environments
 * without native OS secure storage.
 */
export class MemorySecureTokenStorage implements SecureTokenStorage {
  private token: string | null = null;

  async getRefreshToken(): Promise<string | null> {
    return this.token;
  }

  async setRefreshToken(token: string): Promise<void> {
    this.token = token;
  }

  async clearRefreshToken(): Promise<void> {
    this.token = null;
  }
}
