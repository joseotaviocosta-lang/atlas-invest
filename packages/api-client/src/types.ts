export interface RequestOptions extends RequestInit {
  isRetry?: boolean;
  skipAuth?: boolean;
}

export interface ApiErrorResponse {
  statusCode?: number;
  error?: string;
  code?: string;
  message?: string | string[];
  details?: unknown;
  timestamp?: string;
  path?: string;
  requestId?: string;
}

export type AccessTokenGetter = () => string | null | Promise<string | null>;
export type SessionRefresher = () => Promise<string | null>;
export type AuthFailureHandler = (error: unknown) => void | Promise<void>;
export type OfflineChecker = () => boolean;

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: AccessTokenGetter;
  refreshSession?: SessionRefresher;
  onAuthenticationFailure?: AuthFailureHandler;
  defaultHeaders?: Record<string, string>;
  isOffline?: OfflineChecker;
}
