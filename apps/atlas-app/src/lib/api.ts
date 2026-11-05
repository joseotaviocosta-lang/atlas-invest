import { createInstalledSession, MemorySecureTokenStorage, type SecureTokenStorage } from '@atlas/api-client';
import { getRuntimeConfig } from '../config/runtime';
import { TauriSecureTokenStorage } from '../auth/tauri-secure-token-storage';

export function resolveTokenStorage(isTauri: boolean): SecureTokenStorage {
  if (isTauri) {
    return new TauriSecureTokenStorage();
  }
  return new MemorySecureTokenStorage();
}

const runtimeConfig = getRuntimeConfig();

// In native Tauri runtime, strictly uses OS-backed TauriSecureTokenStorage (fail closed if unavailable)
export const tokenStorage = resolveTokenStorage(runtimeConfig.isTauri);

export const { client: apiClient, session: sessionManager } = createInstalledSession({
  baseUrl: runtimeConfig.apiUrl,
  storage: tokenStorage,
});
