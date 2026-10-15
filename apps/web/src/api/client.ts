import {
  getInMemoryAccessToken,
  useAuthStore,
  getActiveRestorePromise,
  registerExternalRefreshGetter,
} from '@/stores/auth.store';
import { clearQueryCache } from '@/lib/react-query';
import { ApiErrorResponse } from './types';

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  isOffline?: boolean;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    details?: unknown,
    isOffline = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOffline = isOffline;
  }
}

export interface RequestOptions extends RequestInit {
  isRetry?: boolean;
  skipAuth?: boolean;
}

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiClient {
  private baseUrl: string;
  private activeRefreshPromise: Promise<string> | null = null;

  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private handleAuthFailure(): void {
    clearQueryCache();
    useAuthStore.getState().clearSession();
  }

  /**
   * Single-flight refresh interceptor mutex:
   * Serializes concurrent 401 refresh calls into a single network invocation.
   */
  getActiveRefreshPromise(): Promise<string> | null {
    return this.activeRefreshPromise;
  }

  async performSingleFlightRefresh(): Promise<string> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    // Defer to an in-flight AuthProvider session restore so concurrent refresh
    // triggers (e.g. a boot-time restore racing a 401-triggered interceptor
    // refresh after a full page reload) issue exactly one network refresh.
    // Without this, two concurrent refreshes with the same cookie token make
    // the backend revoke the whole session as suspected token reuse.
    const pendingRestore = getActiveRestorePromise();
    if (pendingRestore) {
      const restored = await pendingRestore;
      const token = getInMemoryAccessToken();
      if (restored && token) {
        return token;
      }
      this.handleAuthFailure();
      throw new ApiError('Session refresh failed', 401, 'AUTH.REFRESH_FAILED');
    }

    this.activeRefreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-atlas-client': 'web',
          },
        });

        if (!response.ok) {
          this.handleAuthFailure();
          let errData: ApiErrorResponse | undefined;
          try {
            errData = await response.json();
          } catch {
            // ignore
          }
          throw new ApiError(
            (Array.isArray(errData?.message) ? errData?.message.join(', ') : errData?.message) ||
              'Session refresh failed',
            response.status,
            errData?.code || 'AUTH.REFRESH_FAILED',
          );
        }

        const data = await response.json();
        const newAccessToken = data?.data?.accessToken;

        if (!newAccessToken) {
          this.handleAuthFailure();
          throw new ApiError('No access token received from refresh', 401, 'AUTH.INVALID_TOKEN');
        }

        useAuthStore.getState().setAccessToken(newAccessToken);
        return newAccessToken;
      } catch (err) {
        this.handleAuthFailure();
        if (err instanceof ApiError) throw err;
        throw new ApiError(
          (err as Error).message || 'Network error during refresh',
          401,
          'AUTH.NETWORK_ERROR',
        );
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // Offline detection in browser
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ApiError('Sem conexão com a internet', 0, 'OFFLINE', undefined, true);
    }

    // Determine target URL: relative BFF endpoints vs upstream API endpoints
    let url: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else if (path.startsWith('/api/auth/')) {
      url = path; // Relative to web host
    } else {
      url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-atlas-client': 'web',
      ...(options.headers as Record<string, string>),
    };

    const token = getInMemoryAccessToken();
    if (token && !options.skipAuth && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (err) {
      const isNetworkOffline =
        typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine;
      throw new ApiError(
        isNetworkOffline ? 'Sem conexão com a internet' : (err as Error).message || 'Erro de rede',
        0,
        isNetworkOffline ? 'OFFLINE' : 'NETWORK_ERROR',
        undefined,
        isNetworkOffline,
      );
    }

    // 401 Unauthorized handling with single-flight refresh
    if (
      response.status === 401 &&
      !options.isRetry &&
      !options.skipAuth &&
      !path.includes('/api/auth/refresh') &&
      !path.includes('/api/auth/login') &&
      !path.includes('/api/auth/register')
    ) {
      const newAccessToken = await this.performSingleFlightRefresh();

      return this.request<T>(path, {
        ...options,
        isRetry: true,
        headers: {
          ...headers,
          Authorization: `Bearer ${newAccessToken}`,
        },
      });
    }

    if (!response.ok) {
      let errData: ApiErrorResponse | undefined;
      try {
        errData = await response.json();
      } catch {
        // body is not json
      }

      const msg = Array.isArray(errData?.message)
        ? errData.message.join(', ')
        : errData?.message || response.statusText || 'Request failed';

      throw new ApiError(msg, response.status, errData?.code, errData?.details);
    }

    const contentType = response.headers?.get?.('content-type') || '';
    const acceptHeader = (options.headers as Record<string, string> | undefined)?.['Accept'];
    if (
      contentType.includes('text/csv') ||
      contentType.includes('text/plain') ||
      acceptHeader === 'text/csv' ||
      acceptHeader === 'text/plain'
    ) {
      return (await response.text()) as T;
    }

    return response.json();
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Stream Server-Sent Events from an endpoint (Phase 3U).
   */
  async stream<TEvent = unknown>(
    path: string,
    body: unknown,
    onEvent: (event: TEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-atlas-client': 'web',
      ...(options?.headers as Record<string, string>),
    };

    const token = getInMemoryAccessToken();
    if (token && !options?.skipAuth && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errData: { message?: string; code?: string; details?: unknown } | null = null;
      try {
        errData = (await response.json()) as {
          message?: string;
          code?: string;
          details?: unknown;
        };
      } catch {
        // ignore
      }
      throw new ApiError(
        errData?.message || `Streaming request failed with status ${response.status}`,
        response.status,
        errData?.code,
        errData?.details,
      );
    }

    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lines = trimmed.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.slice(5).trim();
            try {
              const event = JSON.parse(jsonStr) as TEvent;
              onEvent(event);
            } catch {
              // skip unparseable event
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.trim().split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          try {
            const event = JSON.parse(jsonStr) as TEvent;
            onEvent(event);
          } catch {
            // skip
          }
        }
      }
    }
  }
}

export const apiClient = new ApiClient();

// Register the interceptor refresh slot so AuthProvider session restore can
// defer to it instead of firing a second concurrent refresh (H3 fix).
// Placed here (client imports store, never the reverse) to avoid a module cycle.
registerExternalRefreshGetter(() => apiClient.getActiveRefreshPromise());
