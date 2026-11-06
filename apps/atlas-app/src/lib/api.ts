import { createInstalledSession, MemorySecureTokenStorage, type SecureTokenStorage } from '@atlas/api-client';
import { getRuntimeConfig } from '../config/runtime';
import { TauriSecureTokenStorage } from '../auth/tauri-secure-token-storage';
import { AndroidSecureTokenStorage } from '../auth/android-secure-token-storage';

export function isAndroidUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function resolveTokenStorage(isTauri: boolean): SecureTokenStorage {
  // In native Tauri runtime:
  // - Android: Android Keystore / EncryptedSharedPreferences (AndroidSecureTokenStorage)
  // - Windows: Windows Credential Manager / DPAPI (TauriSecureTokenStorage)
  // In browser test harness: MemorySecureTokenStorage
  // Strictly forbids localStorage, plaintext persistence, or silent fallbacks.
  if (isTauri) {
    if (isAndroidUserAgent()) {
      return new AndroidSecureTokenStorage();
    }
    return new TauriSecureTokenStorage();
  }
  return new MemorySecureTokenStorage();
}

const runtimeConfig = getRuntimeConfig();

export const tokenStorage = resolveTokenStorage(runtimeConfig.isTauri);

const defaultHeaders =
  runtimeConfig.runtimeMode === 'DESKTOP_LOCAL_OWNER'
    ? { 'x-atlas-client': 'desktop-local' }
    : undefined;

export const { client: apiClient, session: sessionManager } = createInstalledSession({
  baseUrl: runtimeConfig.apiUrl,
  storage: tokenStorage,
  defaultHeaders,
});
