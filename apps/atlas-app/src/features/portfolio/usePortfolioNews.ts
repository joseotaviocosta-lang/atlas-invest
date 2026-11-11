import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portfolioApi } from './api';
import { applyOptimisticSeenToCache } from './newsStateUtils';
import type {
  PortfolioNewsAlertHistoryResponseDto,
  PortfolioNewsAlertHistoryStatusDto,
  PortfolioNewsAlertTypeDto,
  PortfolioNewsInboxResponseDto,
} from './types';

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

export function usePortfolioNewsAlertHistory(
  portfolioId: string | null | undefined,
  filters?: {
    limit?: number;
    cursor?: string;
    status?: PortfolioNewsAlertHistoryStatusDto;
    ticker?: string;
    materiality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
    alertType?: PortfolioNewsAlertTypeDto;
    from?: string;
    to?: string;
    enabled?: boolean;
  },
) {
  return useQuery<{ data: PortfolioNewsAlertHistoryResponseDto }>({
    queryKey: [
      'portfolio-news-alert-history',
      portfolioId,
      filters?.limit ?? 20,
      filters?.cursor ?? null,
      filters?.status ?? null,
      filters?.ticker ?? null,
      filters?.materiality ?? null,
      filters?.alertType ?? null,
      filters?.from ?? null,
      filters?.to ?? null,
    ],
    queryFn: async () => {
      if (!portfolioId) {
        throw new Error('No portfolio ID provided');
      }
      return portfolioApi.getPortfolioNewsAlertHistory(portfolioId, filters);
    },
    enabled: Boolean(portfolioId) && (filters?.enabled ?? true),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
