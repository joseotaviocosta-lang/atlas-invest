import { getInMemoryAccessToken, useAuthStore } from '@/stores/auth.store';
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
  async performSingleFlightRefresh(): Promise<string> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
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
}

export const apiClient = new ApiClient();
