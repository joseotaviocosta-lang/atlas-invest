import * as SecureStore from 'expo-secure-store';

export const REFRESH_TOKEN_KEY = 'atlas.refresh-token';

/**
 * Safe wrapper around expo-secure-store for storing sensitive credentials
 * (refresh token only - access token is kept in memory only).
 */
export const secureStorage = {
  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (error) {
      // In non-native environments (such as unit test runs without full native mocks)
      console.warn('SecureStore setItem failed:', error);
    }
  },

  async deleteRefreshToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // ignore deletion errors
    }
  },

  async clearAuthStorage(): Promise<void> {
    await this.deleteRefreshToken();
  },
};
