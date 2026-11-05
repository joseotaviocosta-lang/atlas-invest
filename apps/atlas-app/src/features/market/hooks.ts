import { useQuery } from '@tanstack/react-query';
import { marketKeys } from '../../lib/query-keys';
import { marketApi } from './api';
import type { MacroContextResponse } from './types';

/**
 * Smart polling hook for macro economic context indicators.
 * Standard interval: 60 seconds (disabled in background).
 */
export function useMacroContext() {
  return useQuery<MacroContextResponse>({
    queryKey: marketKeys.macroContext(),
    queryFn: () => marketApi.getMacroContext(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
