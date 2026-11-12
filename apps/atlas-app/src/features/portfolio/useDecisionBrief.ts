import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { portfolioApi } from './api';
import type { PortfolioDailyDecisionBriefDto } from './types';

export function decisionBriefQueryKey(portfolioId: string, contributionAmount?: string) {
  return ['portfolios', portfolioId, 'decision-brief', contributionAmount ?? ''] as const;
}

export function useDecisionBrief(portfolioId: string | null | undefined, contributionAmount?: string) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery<PortfolioDailyDecisionBriefDto>({
    queryKey: decisionBriefQueryKey(portfolioId ?? '', contributionAmount),
    queryFn: async () => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.getDecisionBrief(portfolioId, { contributionAmount });
      return res.data;
    },
    enabled: Boolean(portfolioId),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    if (!portfolioId) return;
    setIsRefreshing(true);
    try {
      const res = await portfolioApi.getDecisionBrief(portfolioId, {
        contributionAmount,
        refresh: true,
      });
      queryClient.setQueryData(
        decisionBriefQueryKey(portfolioId, contributionAmount),
        res.data,
      );
      await queryClient.invalidateQueries({ queryKey: ['portfolios', portfolioId, 'opportunity-radar'] });
    } finally {
      setIsRefreshing(false);
    }
  }, [portfolioId, contributionAmount, queryClient]);

  return {
    ...query,
    refresh,
    isRefreshing,
  };
}
