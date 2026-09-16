'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

interface NetworkContextValue {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true });

export const useNetworkStatus = () => useContext(NetworkContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    // Session restoration on mount if status is unknown
    if (status === 'unknown') {
      restoreSession();
    }

    // Online / Offline window listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [restoreSession, status]);

  return <NetworkContext.Provider value={{ isOnline }}>{children}</NetworkContext.Provider>;
}
