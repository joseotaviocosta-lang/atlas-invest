import { createInstalledSession, MemorySecureTokenStorage, type SecureTokenStorage } from '@atlas/api-client';
import { getRuntimeConfig } from '../config/runtime';
import { TauriSecureTokenStorage } from '../auth/tauri-secure-token-storage';

export function isAndroidUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function resolveTokenStorage(isTauri: boolean): SecureTokenStorage {
  // In native Tauri runtime on Windows, strictly uses Windows Credential Manager.
  // In native Tauri runtime on Android (Phase APP-9), uses MemorySecureTokenStorage
  // pending Phase APP-10 Android Keystore integration.
  // Strictly forbids localStorage or plaintext persistence.
  if (isTauri) {
    if (isAndroidUserAgent()) {
      return new MemorySecureTokenStorage();
    }
    return new TauriSecureTokenStorage();
  }
  return new MemorySecureTokenStorage();
}

const runtimeConfig = getRuntimeConfig();

export const tokenStorage = resolveTokenStorage(runtimeConfig.isTauri);

export const { client: apiClient, session: sessionManager } = createInstalledSession({
  baseUrl: runtimeConfig.apiUrl,
  storage: tokenStorage,
});
