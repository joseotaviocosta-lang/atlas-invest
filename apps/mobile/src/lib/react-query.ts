import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Completely resets and clears all queries in the TanStack Query cache.
 * Mandatory for cross-user data isolation upon logout or session invalidation.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
