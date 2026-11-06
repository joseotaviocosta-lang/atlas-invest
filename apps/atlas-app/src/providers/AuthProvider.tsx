import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { sessionManager } from '../lib/api';
import { clearQueryCache } from '../lib/react-query';
import { LocalCache } from '../lib/local-cache';
import { getRuntimeConfig, type AtlasRuntimeMode } from '../config/runtime';
import { LOCAL_OWNER_USER } from '../auth/local-owner';
import type { AuthState, AuthUser, LoginCredentials } from '@atlas/api-client';

export interface AuthContextValue {
  authState: AuthState;
  user: AuthUser | null;
  isRestoring: boolean;
  isAuthenticated: boolean;
  runtimeMode: AtlasRuntimeMode;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearLocalData: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  runtimeMode?: AtlasRuntimeMode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, runtimeMode: propRuntimeMode }) => {
  const config = getRuntimeConfig();
  const effectiveMode: AtlasRuntimeMode = propRuntimeMode || config.runtimeMode;
  const isLocalOwner = effectiveMode === 'DESKTOP_LOCAL_OWNER';

  const [authState, setAuthState] = useState<AuthState>(() => {
    if (isLocalOwner) {
      return {
        status: 'authenticated',
        user: LOCAL_OWNER_USER,
      };
    }
    return sessionManager.getAuthState();
  });

  const [isRestoring, setIsRestoring] = useState(() => !isLocalOwner);

  useEffect(() => {
    // In local owner mode, authentication is deterministic and immediate.
    // Do NOT attempt remote restore, do not touch Windows Credential Manager.
    if (isLocalOwner) {
      setAuthState({
        status: 'authenticated',
        user: LOCAL_OWNER_USER,
      });
      setIsRestoring(false);
      return;
    }

    // Synchronize with SessionManager state transitions in remote mode
    const unsubscribe = sessionManager.subscribe((nextState) => {
      setAuthState(nextState);
    });

    let isMounted = true;
    sessionManager
      .restoreSession()
      .catch(() => {
        // Safe fail: state remains anonymous without throwing
      })
      .finally(() => {
        if (isMounted) {
          setIsRestoring(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isLocalOwner]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    if (isLocalOwner) {
      // In local mode, login is not needed and no-ops safely
      return;
    }
    clearQueryCache();
    await sessionManager.login(credentials);
  }, [isLocalOwner]);

  const clearLocalData = useCallback((): void => {
    clearQueryCache();
    if (authState.user?.id) {
      LocalCache.purgeUser(authState.user.id);
    }
    LocalCache.clear();
  }, [authState.user?.id]);

  const logout = useCallback(async (): Promise<void> => {
    if (isLocalOwner) {
      // In local mode, logout does NOT wipe data or call remote API.
      // Explicit data clear must be performed via clearLocalData.
      return;
    }

    try {
      await sessionManager.logout();
    } finally {
      clearQueryCache();
      if (authState.user?.id) {
        LocalCache.purgeUser(authState.user.id);
      }
      LocalCache.clear();
    }
  }, [isLocalOwner, authState.user?.id]);

  const value: AuthContextValue = {
    authState,
    user: authState.user,
    isRestoring,
    isAuthenticated: authState.status === 'authenticated',
    runtimeMode: effectiveMode,
    login,
    logout,
    clearLocalData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
