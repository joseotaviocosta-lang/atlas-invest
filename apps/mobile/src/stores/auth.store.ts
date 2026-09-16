import { create } from 'zustand';
import { secureStorage } from '../storage/secure-store';
import { AuthUser } from '../api/types';

export type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticated' | 'refreshing';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  isInitialized: boolean;

  // Actions
  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  setAccessToken: (accessToken: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: AuthStatus) => void;
  logout: () => Promise<void>;
  restoreSession: (
    onRefresh: (
      refreshToken: string,
    ) => Promise<{ user?: AuthUser; accessToken: string; refreshToken: string }>,
  ) => Promise<boolean>;
}

// In-memory reference for access token so API interceptor can read synchronously
let inMemoryAccessToken: string | null = null;

export const getInMemoryAccessToken = (): string | null => inMemoryAccessToken;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  isInitialized: false,

  setSession: async (user: AuthUser, accessToken: string, refreshToken: string) => {
    inMemoryAccessToken = accessToken;
    await secureStorage.setRefreshToken(refreshToken);
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

  logout: async () => {
    inMemoryAccessToken = null;
    await secureStorage.clearAuthStorage();
    set({
      user: null,
      accessToken: null,
      status: 'unauthenticated',
      isInitialized: true,
    });
  },

  restoreSession: async (onRefresh) => {
    try {
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) {
        inMemoryAccessToken = null;
        set({
          status: 'unauthenticated',
          user: null,
          accessToken: null,
          isInitialized: true,
        });
        return false;
      }

      set({ status: 'refreshing' });
      const result = await onRefresh(refreshToken);

      inMemoryAccessToken = result.accessToken;
      await secureStorage.setRefreshToken(result.refreshToken);

      set({
        accessToken: result.accessToken,
        user: result.user ?? null,
        status: 'authenticated',
        isInitialized: true,
      });
      return true;
    } catch {
      inMemoryAccessToken = null;
      await secureStorage.clearAuthStorage();
      set({
        status: 'unauthenticated',
        user: null,
        accessToken: null,
        isInitialized: true,
      });
      return false;
    }
  },
}));
