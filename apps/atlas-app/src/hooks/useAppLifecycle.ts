import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface AppLifecycleState {
  isForeground: boolean;
  isOnline: boolean;
  lastResumedAt: number | null;
  triggerManualSync: () => Promise<void>;
}

export function useAppLifecycle(onForegroundResume?: () => void): AppLifecycleState {
  const queryClient = useQueryClient();

  const [isForeground, setIsForeground] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.visibilityState === 'visible';
    }
    return true;
  });

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  const [lastResumedAt, setLastResumedAt] = useState<number | null>(() => Date.now());

  const triggerManualSync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    await queryClient.invalidateQueries({
      type: 'active',
      refetchType: 'active',
    });
  }, [queryClient]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsForeground(visible);

      if (visible) {
        const now = Date.now();
        setLastResumedAt(now);

        // Invalidate active queries only when online to prevent spamming failed requests
        if (navigator.onLine) {
          queryClient.invalidateQueries({
            type: 'active',
            refetchType: 'active',
          });

          if (onForegroundResume) {
            onForegroundResume();
          }
        }
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      // Immediately refresh active queries when network connection recovers
      queryClient.invalidateQueries({
        type: 'active',
        refetchType: 'active',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient, onForegroundResume]);

  return {
    isForeground,
    isOnline,
    lastResumedAt,
    triggerManualSync,
  };
}
