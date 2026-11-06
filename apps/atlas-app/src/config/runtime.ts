export type AppEnvironment = 'development' | 'staging' | 'pilot' | 'production';

export interface AppRuntimeConfig {
  apiUrl: string;
  isTauri: boolean;
  version: string;
  environment: AppEnvironment;
  commitSha: string;
  buildType: 'debug' | 'release';
  buildDate: string;
}

export function getRuntimeConfig(): AppRuntimeConfig {
  const isDev = Boolean(
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV,
  );

  const envMode = (
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_ENV
  ) as AppEnvironment | undefined;

  const environment: AppEnvironment = envMode || (isDev ? 'development' : 'pilot');

  const defaultApiUrl = isDev ? 'http://localhost:3001' : 'http://54.233.66.110';

  const apiUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_API_URL) ||
    defaultApiUrl;

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  const commitSha =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_COMMIT_SHA) ||
    '03dfe82';

  const buildDate =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ATLAS_BUILD_DATE) ||
    '2026-11-05';

  const buildType: 'debug' | 'release' = isDev ? 'debug' : 'release';

  return {
    apiUrl,
    isTauri,
    version: '0.1.0-pilot.1',
    environment,
    commitSha,
    buildType,
    buildDate,
  };
}
