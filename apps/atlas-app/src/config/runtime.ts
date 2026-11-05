export interface AppRuntimeConfig {
  apiUrl: string;
  isTauri: boolean;
  version: string;
}

export function getRuntimeConfig(): AppRuntimeConfig {
  const apiUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_API_URL) ||
    'http://localhost:3001';

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  return {
    apiUrl,
    isTauri,
    version: '0.1.0',
  };
}

