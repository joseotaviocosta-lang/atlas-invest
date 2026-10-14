import { create } from 'zustand';
import { clearQueryCache } from '@/lib/react-query';
import { AuthUser } from '@/api/types';
import { LOGGED_IN_COOKIE_NAME } from '@/lib/auth-cookie';

export type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticated' | 'refreshing';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  isInitialized: boolean;

  // Actions
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: AuthStatus) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
}

// In-memory volatile reference for access token (never persisted to storage)
let inMemoryAccessToken: string | null = null;

// Single-flight guard for session restore (mirrors ApiClient refresh mutex).
// React 18 StrictMode double-invokes mount effects in development, which would
// otherwise fire two concurrent POST /api/auth/refresh with the same cookie token.
// The backend rotates refresh tokens on every use and revokes the whole session
// when an already-rotated token is presented, so the second concurrent restore
// would kill the session and bounce the user to login on every full page reload.
let activeRestorePromise: Promise<boolean> | null = null;

export const getInMemoryAccessToken = (): string | null => inMemoryAccessToken;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  isInitialized: false,

  setSession: (user: AuthUser, accessToken: string) => {
    inMemoryAccessToken = accessToken;
    set({
      user,
      accessToken,
      status: 'authenticated',
      isInitialized: true,
    });
  },

  setAccessToken: (accessToken: string | null) => {
    inMemoryAccessToken = accessToken;
    set({ accessToken });
  },

  setUser: (user: AuthUser | null) => {
    set({ user });
  },

  setStatus: (status: AuthStatus) => {
    set({ status });
  },

  clearSession: () => {
    inMemoryAccessToken = null;
    clearQueryCache();
    if (typeof document !== 'undefined') {
      document.cookie = `${LOGGED_IN_COOKIE_NAME}=; Max-Age=0; path=/`;
    }
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      isInitialized: true,
    });
  },

  logout: async () => {
    try {
      const token = inMemoryAccessToken;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch('/api/auth/logout', {
        method: 'POST',
        headers,
      }).catch(() => {});
    } finally {
      get().clearSession();
    }
  },

  restoreSession: () => {
    if (activeRestorePromise) {
      return activeRestorePromise;
    }

    activeRestorePromise = (async (): Promise<boolean> => {
      try {
        set({ status: 'refreshing' });

        // Call BFF /api/auth/refresh which reads HttpOnly cookie
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        if (!refreshRes.ok) {
          get().clearSession();
          return false;
        }

        const refreshData = await refreshRes.json();
        const accessToken = refreshData?.data?.accessToken;

        if (!accessToken) {
          get().clearSession();
          return false;
        }

        inMemoryAccessToken = accessToken;

        // Fetch current user with new access token
        const meRes = await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (!meRes.ok) {
          get().clearSession();
          return false;
        }

        const meData = await meRes.json();
        const user = meData?.data;

        set({
          status: 'authenticated',
          user,
          accessToken,
          isInitialized: true,
        });

        return true;
      } catch {
        get().clearSession();
        return false;
      } finally {
        activeRestorePromise = null;
      }
    })();

    return activeRestorePromise;
  },
}));
