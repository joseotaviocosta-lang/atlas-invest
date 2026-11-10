import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioApi } from './api';
import type { OpportunityRadarResponseDto } from './types';

export function useOpportunityRadar(portfolioId: string | null, strategy?: string) {
  const queryClient = useQueryClient();
  const queryKey = strategy
    ? ['opportunity-radar', portfolioId, strategy]
    : ['opportunity-radar', portfolioId];

  const query = useQuery<{ data: OpportunityRadarResponseDto }>({
    queryKey,
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getOpportunityRadar(portfolioId, strategy);
    },
    enabled: Boolean(portfolioId),
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
    refetchOnWindowFocus: false, // Does not refetch on window focus to preserve battery/latency
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.refreshOpportunityRadar(portfolioId, strategy);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return {
    radar: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh: refreshMutation.mutateAsync,
    isRefreshing: refreshMutation.isPending,
  };
}
