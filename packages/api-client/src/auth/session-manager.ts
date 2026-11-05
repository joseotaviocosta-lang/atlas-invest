import { ApiClient, createApiClient } from '../client';
import { ApiError } from '../errors';
import type { SecureTokenStorage } from './secure-storage';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
  createdAt?: string;
}

export type AuthStatus = 'anonymous' | 'restoring' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  deviceName?: string;
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

interface LoginApiResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RefreshApiResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type AuthStateListener = (state: AuthState) => void;

export interface SessionManagerOptions {
  storage: SecureTokenStorage;
  client?: ApiClient;
  onAuthStateChange?: AuthStateListener;
}

export class SessionManager {
  private client: ApiClient | null = null;
  private readonly storage: SecureTokenStorage;
  private inMemoryAccessToken: string | null = null;
  private currentUser: AuthUser | null = null;
  private authStatus: AuthStatus = 'anonymous';
  private readonly listeners = new Set<AuthStateListener>();

  constructor(options: SessionManagerOptions) {
    this.storage = options.storage;
    if (options.client) {
      this.attachClient(options.client);
    }
    if (options.onAuthStateChange) {
      this.subscribe(options.onAuthStateChange);
    }
  }

  attachClient(client: ApiClient): void {
    this.client = client;
  }

  getClient(): ApiClient | null {
    return this.client;
  }

  getAccessToken(): string | null {
    return this.inMemoryAccessToken;
  }

  getUser(): AuthUser | null {
    return this.currentUser;
  }

  getAuthState(): AuthState {
    return {
      status: this.authStatus,
      user: this.currentUser,
    };
  }

  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setAuthState(state: AuthState): void {
    this.authStatus = state.status;
    this.currentUser = state.user;
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Listener errors should not break auth flow
      }
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    if (!this.client) {
      throw new ApiError('ApiClient not attached to SessionManager', 500, 'AUTH.CLIENT_NOT_ATTACHED');
    }

    const payload = {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
      deviceName: credentials.deviceName,
    };

    const res = await this.client.post<{ data: LoginApiResponse }>('/api/v1/auth/login', payload, {
      skipAuth: true,
    });

    const { user, accessToken, refreshToken, expiresIn } = res.data;

    // Secure persistence of the refresh token MUST happen first
    try {
      await this.storage.setRefreshToken(refreshToken);
    } catch (storageErr) {
      // Storage failure: immediately invalidate in-memory access token,
      // attempt remote logout, and fail safely without leaving partial session.
      this.inMemoryAccessToken = null;
      try {
        await this.client.post(
          '/api/v1/auth/logout',
          {},
          { headers: { Authorization: `Bearer ${accessToken}` }, skipAuth: true },
        );
      } catch {
        // Best-effort server session revocation
      }
      this.setAuthState({ status: 'anonymous', user: null });
      throw new ApiError(
        'Failed to securely persist refresh token',
        500,
        'AUTH.STORAGE_ERROR',
        storageErr,
      );
    }

    this.inMemoryAccessToken = accessToken;
    this.currentUser = user;
    this.setAuthState({ status: 'authenticated', user });

    return {
      user,
      accessToken,
      expiresIn,
    };
  }

  async refresh(): Promise<string | null> {
    if (!this.client) {
      throw new ApiError('ApiClient not attached to SessionManager', 500, 'AUTH.CLIENT_NOT_ATTACHED');
    }

    const storedRefreshToken = await this.storage.getRefreshToken();
    if (!storedRefreshToken) {
      await this.handleAuthFailure();
      throw new ApiError('No refresh token available', 401, 'AUTH.NO_REFRESH_TOKEN');
    }

    let res: { data: RefreshApiResponse };
    try {
      res = await this.client.post<{ data: RefreshApiResponse }>(
        '/api/v1/auth/refresh',
        { refreshToken: storedRefreshToken },
        { skipAuth: true },
      );
    } catch (err) {
      await this.handleAuthFailure();
      throw err;
    }

    const { accessToken: newAccessToken, refreshToken: newRotatedToken } = res.data;

    if (!newAccessToken || !newRotatedToken) {
      await this.handleAuthFailure();
      throw new ApiError('Malformed response from refresh endpoint', 401, 'AUTH.INVALID_TOKEN');
    }

    // Persist new rotated refresh token to secure storage FIRST
    try {
      await this.storage.setRefreshToken(newRotatedToken);
    } catch (storageErr) {
      // Critical invariant: rotated token cannot be lost silently.
      // If storage fails, destroy local session immediately.
      await this.handleAuthFailure();
      throw new ApiError(
        'Failed to securely persist rotated refresh token',
        500,
        'AUTH.STORAGE_ERROR',
        storageErr,
      );
    }

    this.inMemoryAccessToken = newAccessToken;
    return newAccessToken;
  }

  async restoreSession(): Promise<AuthUser | null> {
    if (!this.client) {
      throw new ApiError('ApiClient not attached to SessionManager', 500, 'AUTH.CLIENT_NOT_ATTACHED');
    }

    this.setAuthState({ status: 'restoring', user: null });

    const storedRefreshToken = await this.storage.getRefreshToken();
    if (!storedRefreshToken) {
      this.setAuthState({ status: 'anonymous', user: null });
      return null;
    }

    try {
      // Execute rotation against API
      await this.refresh();

      // Fetch user profile with fresh access token
      const meRes = await this.client.get<{ data: AuthUser }>('/api/v1/auth/me');
      const user = meRes.data;
      this.currentUser = user;
      this.setAuthState({ status: 'authenticated', user });
      return user;
    } catch {
      await this.handleAuthFailure();
      return null;
    }
  }

  async logout(): Promise<void> {
    if (this.client && this.inMemoryAccessToken) {
      try {
        await this.client.post('/api/v1/auth/logout', {});
      } catch {
        // Offline or server unreachable: local logout must always complete!
      }
    }

    await this.handleAuthFailure();
  }

  async handleAuthFailure(): Promise<void> {
    this.inMemoryAccessToken = null;
    this.currentUser = null;
    try {
      await this.storage.clearRefreshToken();
    } catch {
      // Ignore storage clear errors during failure recovery
    }
    this.setAuthState({ status: 'anonymous', user: null });
  }
}

/**
 * Factory helper for installed clients (Windows Desktop & Android).
 * Creates both the ApiClient and SessionManager, automatically wiring the
 * token provider, single-flight refresh coordinator, and auth failure handlers.
 */
export function createInstalledSession(config: {
  baseUrl: string;
  storage: SecureTokenStorage;
  defaultHeaders?: Record<string, string>;
  isOffline?: () => boolean;
  onAuthStateChange?: AuthStateListener;
}): {
  client: ApiClient;
  session: SessionManager;
} {
  const session = new SessionManager({
    storage: config.storage,
    onAuthStateChange: config.onAuthStateChange,
  });

  const client = createApiClient({
    baseUrl: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    isOffline: config.isOffline,
    getAccessToken: () => session.getAccessToken(),
    refreshSession: () => session.refresh(),
    onAuthenticationFailure: () => session.handleAuthFailure(),
  });

  session.attachClient(client);

  return { client, session };
}
