import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { portfolioApi } from './api';
import type {
  PortfolioDailyDecisionBriefDto,
  ContributionAllocationSimulationDto,
  ContributionScenarioComparisonDto,
  ProjectedPortfolioAfterContributionDto,
  ProjectedPortfolioScenarioComparisonDto,
  ContributionPlanProgressDto,
} from './types';

export function decisionBriefQueryKey(portfolioId: string, contributionAmount?: string) {
  return ['portfolios', portfolioId, 'decision-brief', contributionAmount ?? ''] as const;
}

export function contributionProgressQueryKey(portfolioId: string, period?: string, contributionAmount?: string) {
  return ['portfolios', portfolioId, 'decision-brief', 'contribution-progress', period ?? '', contributionAmount ?? ''] as const;
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

  const simulateMutation = useMutation<
    ContributionAllocationSimulationDto,
    Error,
    { amount: string; currency?: string }
  >({
    mutationFn: async ({ amount, currency }) => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.simulateContribution(portfolioId, { amount, currency });
      return res.data;
    },
  });

  const compareMutation = useMutation<
    ContributionScenarioComparisonDto,
    Error,
    { amount: string; currency?: string }
  >({
    mutationFn: async ({ amount, currency }) => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.compareContributionScenarios(portfolioId, { amount, currency });
      return res.data;
    },
  });

  const projectMutation = useMutation<
    ProjectedPortfolioAfterContributionDto,
    Error,
    { amount: string; currency?: string }
  >({
    mutationFn: async ({ amount, currency }) => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.projectPortfolio(portfolioId, { amount, currency });
      return res.data;
    },
  });

  const projectScenariosMutation = useMutation<
    ProjectedPortfolioScenarioComparisonDto,
    Error,
    { amount: string; currency?: string }
  >({
    mutationFn: async ({ amount, currency }) => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.projectScenarios(portfolioId, { amount, currency });
      return res.data;
    },
  });

  return {
    ...query,
    refresh,
    isRefreshing,
    simulateContribution: simulateMutation.mutateAsync,
    isSimulating: simulateMutation.isPending,
    simulationResult: simulateMutation.data,
    simulationError: simulateMutation.error,
    resetSimulation: simulateMutation.reset,
    compareContributionScenarios: compareMutation.mutateAsync,
    isComparing: compareMutation.isPending,
    comparisonResult: compareMutation.data,
    comparisonError: compareMutation.error,
    resetComparison: compareMutation.reset,
    projectPortfolio: projectMutation.mutateAsync,
    isProjecting: projectMutation.isPending,
    projectionResult: projectMutation.data,
    projectionError: projectMutation.error,
    resetProjection: projectMutation.reset,
    projectScenarios: projectScenariosMutation.mutateAsync,
    isProjectingScenarios: projectScenariosMutation.isPending,
    projectedScenariosResult: projectScenariosMutation.data,
    projectedScenariosError: projectScenariosMutation.error,
    resetProjectedScenarios: projectScenariosMutation.reset,
  };
}

export function useContributionProgress(
  portfolioId: string | null | undefined,
  options?: { period?: string; contributionAmount?: string },
) {
  return useQuery<ContributionPlanProgressDto>({
    queryKey: contributionProgressQueryKey(portfolioId ?? '', options?.period, options?.contributionAmount),
    queryFn: async () => {
      if (!portfolioId) throw new Error('Portfolio ID is required');
      const res = await portfolioApi.getContributionProgress(portfolioId, options);
      return res.data;
    },
    enabled: Boolean(portfolioId),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
