import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { sessionManager } from '../lib/api';
import { clearQueryCache } from '../lib/react-query';
import type { AuthState, AuthUser, LoginCredentials } from '@atlas/api-client';

export interface AuthContextValue {
  authState: AuthState;
  user: AuthUser | null;
  isRestoring: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => sessionManager.getAuthState());
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    // Synchronize with SessionManager state transitions
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
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    clearQueryCache();
    await sessionManager.login(credentials);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await sessionManager.logout();
    } finally {
      clearQueryCache();
    }
  }, []);

  const value: AuthContextValue = {
    authState,
    user: authState.user,
    isRestoring,
    isAuthenticated: authState.status === 'authenticated',
    login,
    logout,
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
