import { createInstalledSession, MemorySecureTokenStorage } from '@atlas/api-client';
import { getRuntimeConfig } from '../config/runtime';

const runtimeConfig = getRuntimeConfig();

// In APP-3 foundation, memory storage serves as the baseline storage adapter
export const tokenStorage = new MemorySecureTokenStorage();

export const { client: apiClient, session: sessionManager } = createInstalledSession({
  baseUrl: runtimeConfig.apiUrl,
  storage: tokenStorage,
});

