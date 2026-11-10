import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fiscalApi } from './api';
import { fiscalKeys } from '../../lib/query-keys';
import type {
  CostEvidenceCreatePayload,
  CostEvidenceRevisePayload,
  CostAssessmentDto,
} from './types';
import {
  mapToFiscalMonthlyViewModel,
  mapToMonthlyTaxLiabilityViewModel,
  mapToTaxInputReadinessViewModel,
  mapToAnnualPositionReportViewModel,
  mapToAnnualCapitalMarketViewModel,
  formatAnnualInvestmentIncomeViewModel,
  mapReportingPackageToViewModel,
} from '@atlas/ui';

export function useFiscalMonthly(competence: string) {
  const isCompetenceValid = /^\d{4}-\d{2}$/.test(competence);

  return useQuery({
    queryKey: fiscalKeys.monthly(competence),
    queryFn: async () => {
      const raw = await fiscalApi.getMonthlyState(competence);
      return mapToFiscalMonthlyViewModel(raw);
    },
    enabled: isCompetenceValid,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useMonthlyTaxLiability(competence: string) {
  const isCompetenceValid = /^\d{4}-\d{2}$/.test(competence);

  return useQuery({
    queryKey: fiscalKeys.liability(competence),
    queryFn: async () => {
      const raw = await fiscalApi.getMonthlyLiability(competence);
      return mapToMonthlyTaxLiabilityViewModel(raw);
    },
    enabled: isCompetenceValid,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useTaxInputReadiness(competence: string) {
  const isCompetenceValid = /^\d{4}-\d{2}$/.test(competence);

  return useQuery({
    queryKey: fiscalKeys.inputs(competence),
    queryFn: async () => {
      const raw = await fiscalApi.getInputReadiness(competence);
      return mapToTaxInputReadinessViewModel(raw);
    },
    enabled: isCompetenceValid,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useAnnualPositions(calendarYear: number, portfolioId?: string) {
  return useQuery({
    queryKey: fiscalKeys.annualPositions(calendarYear, portfolioId ?? 'all'),
    queryFn: async () => {
      const raw = await fiscalApi.getAnnualPositions(calendarYear, portfolioId);
      return mapToAnnualPositionReportViewModel(raw);
    },
    enabled: Boolean(calendarYear),
    staleTime: 60_000,
  });
}

export function useAnnualCapitalMarket(calendarYear: number) {
  return useQuery({
    queryKey: fiscalKeys.annualCapitalMarket(calendarYear),
    queryFn: async () => {
      const raw = await fiscalApi.getAnnualCapitalMarket(calendarYear);
      return mapToAnnualCapitalMarketViewModel(raw);
    },
    enabled: Boolean(calendarYear),
    staleTime: 60_000,
  });
}

export function useAnnualIncome(calendarYear: number) {
  return useQuery({
    queryKey: fiscalKeys.annualIncome(calendarYear),
    queryFn: async () => {
      const raw = await fiscalApi.getAnnualIncome(calendarYear);
      return formatAnnualInvestmentIncomeViewModel(raw);
    },
    enabled: Boolean(calendarYear),
    staleTime: 60_000,
  });
}

export function useAnnualReporting(calendarYear: number) {
  return useQuery({
    queryKey: fiscalKeys.annualReporting(calendarYear),
    queryFn: async () => {
      const raw = await fiscalApi.getAnnualReporting(calendarYear);
      return mapReportingPackageToViewModel(raw);
    },
    enabled: Boolean(calendarYear),
    staleTime: 60_000,
  });
}

export function useTaxComplianceTimeline() {
  return useQuery({
    queryKey: fiscalKeys.compliance(),
    queryFn: () => fiscalApi.getComplianceTimeline(),
    staleTime: 60_000,
  });
}

export function useCostEvidence(
  portfolioId?: string | null,
  query?: { accountId?: string; assetId?: string; statuses?: string }
) {
  return useQuery({
    queryKey: portfolioId
      ? [...fiscalKeys.costEvidence(portfolioId), query?.accountId, query?.assetId, query?.statuses]
      : ['fiscal', 'cost-evidence', 'empty'],
    queryFn: () => {
      if (!portfolioId) return [];
      return fiscalApi.getCostEvidence(portfolioId, query);
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
  });
}

export function useCostEvidenceAssessment(
  portfolioId?: string | null,
  accountId?: string | null,
  assetId?: string | null
) {
  return useQuery<CostAssessmentDto>({
    queryKey: ['fiscal', 'cost-assessment', portfolioId, accountId, assetId],
    queryFn: async () => {
      if (!portfolioId || !accountId || !assetId) {
        throw new Error('Parâmetros insuficientes para apuração de custo');
      }
      return fiscalApi.getCostAssessment(portfolioId, accountId, assetId);
    },
    enabled: Boolean(portfolioId && accountId && assetId),
    staleTime: 30_000,
  });
}

export function usePortfolioAccounts(portfolioId?: string | null) {
  return useQuery({
    queryKey: ['portfolio', portfolioId, 'accounts'],
    queryFn: () => {
      if (!portfolioId) return [];
      return fiscalApi.listAccounts(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60_000,
  });
}

export function useCreateCostEvidence(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CostEvidenceCreatePayload) =>
      fiscalApi.createCostEvidence(portfolioId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['tax-intelligence'] });
    },
  });
}

export function usePreviewCostEvidence(portfolioId: string) {
  return useMutation({
    mutationFn: (payload: CostEvidenceCreatePayload) =>
      fiscalApi.previewCostEvidence(portfolioId, payload),
  });
}

export function useSubmitCostEvidence(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) => fiscalApi.submitCostEvidence(portfolioId, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['tax-intelligence'] });
    },
  });
}

export function useVerifyCostEvidence(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) => fiscalApi.verifyCostEvidence(portfolioId, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['tax-intelligence'] });
    },
  });
}

export function useRejectCostEvidence(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, reason }: { evidenceId: string; reason: string }) =>
      fiscalApi.rejectCostEvidence(portfolioId, evidenceId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
    },
  });
}

export function useReviseCostEvidence(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      evidenceId,
      payload,
    }: {
      evidenceId: string;
      payload: CostEvidenceRevisePayload;
    }) => fiscalApi.reviseCostEvidence(portfolioId, evidenceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['fiscal'] });
      queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function usePortfolioIncome(portfolioId: string | null) {
  return useQuery({
    queryKey: portfolioId ? fiscalKeys.incomeIntelligence(portfolioId) : ['fiscal', 'income', 'empty'],
    queryFn: () => {
      if (!portfolioId) return null;
      return fiscalApi.getPortfolioIncome(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60_000,
  });
}

