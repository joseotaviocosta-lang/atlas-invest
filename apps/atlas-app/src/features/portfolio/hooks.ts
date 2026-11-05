import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioKeys, marketKeys } from '../../lib/query-keys';
import { portfolioApi } from './api';
import type {
  PortfolioDto,
  PortfolioValuationResponse,
  PortfolioAllocationResponse,
  PortfolioPerformanceResponse,
  PortfolioHistoryResponse,
  IngestionReceiptDto,
} from './types';
import { getPeriodDates, getTodayLocalDateString, PerformancePeriodPreset } from '@atlas/ui';

export function usePortfolios() {
  return useQuery<PortfolioDto[]>({
    queryKey: portfolioKeys.list(),
    queryFn: () => portfolioApi.listPortfolios(),
    staleTime: 60 * 1000,
  });
}

/**
 * Smart polling hook for portfolio valuation and quotes.
 * Interval: 60s. Pauses in background. Refetches on window focus.
 */
export function usePortfolioValuation(portfolioId: string | null) {
  return useQuery<PortfolioValuationResponse>({
    queryKey: portfolioId ? portfolioKeys.valuation(portfolioId) : ['portfolio-valuation', 'none'],
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getValuation(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioAllocation(portfolioId: string | null) {
  return useQuery<PortfolioAllocationResponse>({
    queryKey: portfolioId ? portfolioKeys.allocation(portfolioId) : ['portfolio-allocation', 'none'],
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getAllocation(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioPerformance(
  portfolioId: string | null,
  preset: PerformancePeriodPreset = '1Y',
  benchmark?: string
) {
  const today = getTodayLocalDateString();
  const period = getPeriodDates(preset, today) ?? getPeriodDates('1Y', today)!;

  return useQuery<PortfolioPerformanceResponse>({
    queryKey: portfolioId
      ? portfolioKeys.performance(portfolioId, period.startDate, period.endDate, benchmark)
      : ['portfolio-performance', 'none'],
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getPerformance(portfolioId, period.startDate, period.endDate, benchmark);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioPerformanceSeries(
  portfolioId: string | null,
  preset: PerformancePeriodPreset = '1Y',
  benchmark?: string
) {
  const today = getTodayLocalDateString();
  const period = getPeriodDates(preset, today) ?? getPeriodDates('1Y', today)!;

  return useQuery({
    queryKey: portfolioId
      ? portfolioKeys.performanceSeries(portfolioId, period.startDate, period.endDate, benchmark)
      : ['portfolio-performance-series', 'none'],
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getPerformanceSeries(portfolioId, period.startDate, period.endDate, benchmark);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioHistory(portfolioId: string | null, limit = 50) {
  return useQuery<PortfolioHistoryResponse>({
    queryKey: portfolioId ? portfolioKeys.history(portfolioId, { limit }) : ['portfolio-history', 'none'],
    queryFn: () => {
      if (!portfolioId) throw new Error('No portfolio selected');
      return portfolioApi.getHistory(portfolioId, limit);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Mutation for manual market data update trigger.
 * Invalidates valuation and allocation queries upon completion.
 */
export function useUpdateMarketData(portfolioId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<IngestionReceiptDto, Error, void>({
    mutationFn: async () => {
      if (!portfolioId) throw new Error('Nenhuma carteira selecionada.');
      return portfolioApi.updateMarketData(portfolioId);
    },
    onSuccess: () => {
      if (portfolioId) {
        queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(portfolioId) });
        queryClient.invalidateQueries({ queryKey: portfolioKeys.allocation(portfolioId) });
        queryClient.invalidateQueries({ queryKey: marketKeys.quotes(portfolioId) });
      }
    },
  });
}
