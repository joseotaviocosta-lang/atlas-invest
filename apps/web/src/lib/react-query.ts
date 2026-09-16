import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Cross-user cache isolation:
 * Compulsively purge all cached query data upon session termination, logout, or 401 unrecoverable failure.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
