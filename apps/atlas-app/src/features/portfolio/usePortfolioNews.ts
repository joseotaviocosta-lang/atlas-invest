import { useQuery } from '@tanstack/react-query';
import { portfolioApi } from './api';
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
