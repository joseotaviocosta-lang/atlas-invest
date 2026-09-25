import { getInMemoryAccessToken, useAuthStore } from '../stores/auth.store';
import { secureStorage } from '../storage/secure-store';
import { clearQueryCache } from '../lib/react-query';
import { ApiErrorResponse, RefreshResponse } from './types';

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

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
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

  private async handleAuthFailure(): Promise<void> {
    await secureStorage.clearAuthStorage();
    clearQueryCache();
    useAuthStore.getState().logout();
  }

  private async performSingleFlightRefresh(): Promise<string> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    this.activeRefreshPromise = (async () => {
      try {
        const storedRefreshToken = await secureStorage.getRefreshToken();
        if (!storedRefreshToken) {
          await this.handleAuthFailure();
          throw new ApiError('No refresh token available', 401, 'AUTH.NO_REFRESH_TOKEN');
        }

        const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });

        if (!response.ok) {
          await this.handleAuthFailure();
          let errData: ApiErrorResponse | undefined;
          try {
            errData = await response.json();
          } catch {
            // ignore
          }
          throw new ApiError(
            (errData?.message as string) || 'Refresh failed',
            response.status,
            errData?.code || 'AUTH.REFRESH_FAILED',
          );
        }

        const data = (await response.json()) as { data: RefreshResponse };
        const { accessToken, refreshToken: newRefreshToken } = data.data;

        // Store new rotated refresh token securely
        await secureStorage.setRefreshToken(newRefreshToken);

        // Update in-memory access token in store
        useAuthStore.getState().setAccessToken(accessToken);

        return accessToken;
      } catch (error) {
        await this.handleAuthFailure();
        throw error;
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Attach in-memory access token if not skipping auth
    if (!options.skipAuth) {
      const token = getInMemoryAccessToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError: unknown) {
      throw new ApiError(
        'Unable to connect to Atlas server. Please check your internet connection.',
        0,
        'COMMON.NETWORK_ERROR',
        networkError,
        true,
      );
    }

    // Handle 401 Unauthorized with Single-Flight Refresh Interceptor
    if (
      response.status === 401 &&
      !options.isRetry &&
      !endpoint.includes('/api/v1/auth/login') &&
      !endpoint.includes('/api/v1/auth/refresh')
    ) {
      const newAccessToken = await this.performSingleFlightRefresh();

      // Retry the original request once with new token
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newAccessToken}`);
      if (!retryHeaders.has('Content-Type') && !(options.body instanceof FormData)) {
        retryHeaders.set('Content-Type', 'application/json');
      }

      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders,
        isRetry: true,
      } as RequestInit);

      if (!retryResponse.ok) {
        return this.parseErrorResponse(retryResponse);
      }

      return (await retryResponse.json()) as T;
    }

    if (!response.ok) {
      return this.parseErrorResponse(response);
    }

    // Return parsed json
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }

  private async parseErrorResponse(response: Response): Promise<never> {
    let errorData: ApiErrorResponse | null = null;
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    try {
      errorData = await response.json();
      if (errorData) {
        if (Array.isArray(errorData.message)) {
          message = errorData.message.join(', ');
        } else if (errorData.message) {
          message = errorData.message;
        }
        code = errorData.code;
      }
    } catch {
      // Body not JSON
    }

    throw new ApiError(message, response.status, code, errorData?.details);
  }

  // Convenience methods
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Stream Server-Sent Events from an endpoint (Phase 3U).
   */
  async stream<TEvent = unknown>(
    endpoint: string,
    body: unknown,
    onEvent: (event: TEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-atlas-client': 'mobile',
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
