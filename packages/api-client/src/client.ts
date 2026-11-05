import { ApiError } from './errors';
import type { ApiClientConfig, RequestOptions, ApiErrorResponse } from './types';
import { SimpleTokenProvider, type TokenProvider } from './auth/token-provider';
import { RefreshCoordinator } from './auth/refresh-coordinator';

export class ApiClient {
  private baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly refreshCoordinator: RefreshCoordinator;
  private readonly defaultHeaders: Record<string, string>;
  private readonly isOfflineCheck?: () => boolean;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.tokenProvider = new SimpleTokenProvider(config.getAccessToken);
    this.refreshCoordinator = new RefreshCoordinator(
      config.refreshSession,
      config.onAuthenticationFailure,
    );
    this.defaultHeaders = config.defaultHeaders || {};
    this.isOfflineCheck = config.isOffline;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getActiveRefreshPromise(): Promise<string> | null {
    return this.refreshCoordinator.getActiveRefreshPromise();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (this.isOfflineCheck && this.isOfflineCheck()) {
      throw new ApiError('Sem conexão com a internet', 0, 'OFFLINE', undefined, true);
    }

    let url: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else {
      url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...(options.headers as Record<string, string>),
    };

    // Auto-set Content-Type: application/json if string body and no Content-Type specified
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const token = await this.tokenProvider.getToken();
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
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
      const isOffline = this.isOfflineCheck ? this.isOfflineCheck() : false;
      throw new ApiError(
        isOffline ? 'Sem conexão com a internet' : (err as Error)?.message || 'Erro de rede',
        0,
        isOffline ? 'OFFLINE' : 'NETWORK_ERROR',
        undefined,
        isOffline,
      );
    }

    // 401 Handling with single-flight refresh
    if (response.status === 401 && !options.isRetry && !options.skipAuth) {
      const newToken = await this.refreshCoordinator.performRefresh();
      return this.request<T>(path, {
        ...options,
        isRetry: true,
        headers: {
          ...headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
    }

    const requestId = response.headers?.get?.('x-request-id') ?? undefined;

    if (!response.ok) {
      let errData: ApiErrorResponse | undefined;
      try {
        errData = (await response.json()) as ApiErrorResponse;
      } catch {
        // body is not json
      }

      const msg = Array.isArray(errData?.message)
        ? errData.message.join(', ')
        : errData?.message || response.statusText || 'Request failed';

      throw new ApiError(
        msg,
        response.status,
        errData?.code,
        errData?.details,
        false,
        errData?.requestId || requestId,
      );
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers?.get?.('content-type') || '';
    const acceptHeader = (options.headers as Record<string, string> | undefined)?.['Accept'];
    if (
      contentType.includes('text/csv') ||
      contentType.includes('text/plain') ||
      acceptHeader === 'text/csv' ||
      acceptHeader === 'text/plain'
    ) {
      return (await response.text()) as unknown as T;
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return undefined as unknown as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Stream Server-Sent Events from an endpoint.
   */
  async stream<TEvent = unknown>(
    path: string,
    body: unknown,
    onEvent: (event: TEvent) => void,
    options?: RequestOptions,
  ): Promise<void> {
    let url: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else {
      url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...this.defaultHeaders,
      ...(options?.headers as Record<string, string>),
    };

    const token = await this.tokenProvider.getToken();
    if (token && !options?.skipAuth && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      method: 'POST',
      headers,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });

    if (!response.ok) {
      let errData: ApiErrorResponse | undefined;
      try {
        errData = (await response.json()) as ApiErrorResponse;
      } catch {
        // ignore
      }
      throw new ApiError(
        (Array.isArray(errData?.message) ? errData.message.join(', ') : errData?.message) ||
          `Streaming request failed with status ${response.status}`,
        response.status,
        errData?.code,
        errData?.details,
      );
    }

    if (!response.body) return;

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

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
