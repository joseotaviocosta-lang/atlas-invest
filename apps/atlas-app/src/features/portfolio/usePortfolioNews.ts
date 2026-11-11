import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portfolioApi } from './api';
import { applyOptimisticSeenToCache } from './newsStateUtils';
import type { PortfolioNewsInboxResponseDto } from './types';

export function usePortfolioNews(portfolioId: string | null | undefined) {
  return useQuery<{ data: PortfolioNewsInboxResponseDto }>({
    queryKey: ['portfolio-news', portfolioId],
    queryFn: async () => {
      if (!portfolioId) {
        throw new Error('No portfolio ID provided');
      }
      return portfolioApi.getPortfolioNews(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 5 * 60 * 1000, // 5 min client freshness
    refetchOnWindowFocus: false,
  });
}

export function useRefreshPortfolioNews(portfolioId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!portfolioId) {
        throw new Error('No portfolio ID provided');
      }
      return portfolioApi.refreshPortfolioNews(portfolioId);
    },
    onSuccess: (res) => {
      if (portfolioId) {
        queryClient.setQueryData(['portfolio-news', portfolioId], res);
      }
    },
  });
}

export function useMarkPortfolioNewsSeen(portfolioId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { canonicalEventIds?: string[]; markAllNew?: boolean }) => {
      if (!portfolioId) {
        throw new Error('No portfolio ID provided');
      }
      return portfolioApi.markPortfolioNewsSeen(portfolioId, params);
    },
    onMutate: async (params) => {
      if (!portfolioId) return;
      const nowIso = new Date().toISOString();
      queryClient.setQueryData<{ data: PortfolioNewsInboxResponseDto } | undefined>(
        ['portfolio-news', portfolioId],
        (prev) => applyOptimisticSeenToCache(prev, { ...params, seenAt: nowIso }),
      );
    },
    onError: () => {
      if (portfolioId) {
        queryClient.invalidateQueries({ queryKey: ['portfolio-news', portfolioId] });
      }
    },
  });
}
