import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface AppLifecycleState {
  isForeground: boolean;
  lastResumedAt: number | null;
}

export function useAppLifecycle(onForegroundResume?: () => void): AppLifecycleState {
  const queryClient = useQueryClient();
  const [isForeground, setIsForeground] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.visibilityState === 'visible';
    }
    return true;
  });
  const [lastResumedAt, setLastResumedAt] = useState<number | null>(() => Date.now());

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsForeground(visible);

      if (visible) {
        const now = Date.now();
        setLastResumedAt(now);

        // When returning to foreground, invalidate active queries to sync market & portfolio data
        queryClient.invalidateQueries({
          type: 'active',
          refetchType: 'active',
        });

        if (onForegroundResume) {
          onForegroundResume();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [queryClient, onForegroundResume]);

  return {
    isForeground,
    lastResumedAt,
  };
}

