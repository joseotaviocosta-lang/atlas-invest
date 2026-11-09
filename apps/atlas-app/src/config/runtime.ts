export type AppEnvironment = 'development' | 'staging' | 'pilot' | 'production';

export type AtlasRuntimeMode = 'DESKTOP_LOCAL_OWNER' | 'REMOTE_AUTHENTICATED';

export interface AppRuntimeConfig {
  apiUrl: string;
  isTauri: boolean;
  version: string;
  environment: AppEnvironment;
  commitSha: string;
  buildType: 'debug' | 'release';
  buildDate: string;
  runtimeMode: AtlasRuntimeMode;
  dataBackendLabel: string;
  isLocalBackend: boolean;
}

export function resolveRuntimeMode(
  envMode?: string,
  isTauri?: boolean,
  isAndroid?: boolean
): AtlasRuntimeMode {
  if (envMode === 'DESKTOP_LOCAL_OWNER' || envMode === 'REMOTE_AUTHENTICATED') {
    return envMode;
  }
  // Android is intended for remote authenticated operation
  if (isAndroid) {
    return 'REMOTE_AUTHENTICATED';
  }
  // Windows Desktop (Tauri) default is DESKTOP_LOCAL_OWNER
  if (isTauri) {
    return 'DESKTOP_LOCAL_OWNER';
  }
  // Default for non-Tauri browser harness unless explicitly set
  return 'REMOTE_AUTHENTICATED';
}

export function getRuntimeConfig(): AppRuntimeConfig {
  const isDev = Boolean(
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV,
  );

  const envMode = (
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_ENV
  ) as AppEnvironment | undefined;

  const environment: AppEnvironment = envMode || (isDev ? 'development' : 'pilot');

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  const isAndroid =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const rawRuntimeMode =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_ATLAS_RUNTIME_MODE;

  const runtimeMode: AtlasRuntimeMode = resolveRuntimeMode(
    rawRuntimeMode,
    isTauri,
    isAndroid
  );

  const defaultApiUrl =
    runtimeMode === 'DESKTOP_LOCAL_OWNER'
      ? 'http://127.0.0.1:3001'
      : isDev
        ? 'http://localhost:3001'
        : 'http://54.233.66.110';

  const apiUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_API_URL) ||
    defaultApiUrl;

  const isLocalBackend = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');
  const dataBackendLabel = isLocalBackend
    ? `Local API (${apiUrl})`
    : `Remote Development API (${apiUrl})`;

  const commitSha =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_COMMIT_SHA) ||
    '03dfe82';

  const buildDate =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_BUILD_DATE) ||
    '2026-11-09';

  const buildType: 'debug' | 'release' = isDev ? 'debug' : 'release';

  return {
    apiUrl,
    isTauri,
    version: '0.1.0-pilot.1',
    environment,
    commitSha,
    buildType,
    buildDate,
    runtimeMode,
    dataBackendLabel,
    isLocalBackend,
  };
}
