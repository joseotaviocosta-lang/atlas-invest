import { useQuery } from '@tanstack/react-query';
import { fiscalApi } from './api';
import { fiscalKeys } from '../../lib/query-keys';
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

export function useCostEvidence(portfolioId?: string | null) {
  return useQuery({
    queryKey: portfolioId ? fiscalKeys.costEvidence(portfolioId) : ['fiscal', 'cost-evidence', 'empty'],
    queryFn: () => {
      if (!portfolioId) return [];
      return fiscalApi.getCostEvidence(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 60_000,
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

