import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsApi } from './api';
import { importKeys, reviewKeys, portfolioKeys } from '../../lib/query-keys';
import type {
  PreviewPayload,
  ConfirmPayload,
  ReconciliationDecisionPayload,
} from './types';

export function usePreviewImport(portfolioId: string | null) {
  return useMutation({
    mutationFn: (payload: PreviewPayload) => {
      if (!portfolioId) throw new Error('Nenhuma carteira selecionada.');
      return importsApi.preview(portfolioId, payload);
    },
  });
}

export function useConfirmImport(portfolioId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConfirmPayload) => {
      if (!portfolioId) throw new Error('Nenhuma carteira selecionada.');
      return importsApi.confirm(portfolioId, payload);
    },
    onSuccess: () => {
      if (!portfolioId) return;
      // Invalidate portfolio read models (positions, summary, allocation, history)
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      // Invalidate import runs
      queryClient.invalidateQueries({ queryKey: importKeys.runs(portfolioId) });
      // Invalidate review inbox
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
    },
  });
}

export function useImportRuns(portfolioId: string | null, limit: number = 50) {
  return useQuery({
    queryKey: portfolioId ? importKeys.runs(portfolioId) : ['imports', 'runs', 'empty'],
    queryFn: () => {
      if (!portfolioId) return { data: [], meta: { limit, cursor: null, nextCursor: null, hasMore: false } };
      return importsApi.listRuns(portfolioId, limit);
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useRetryImportRun(portfolioId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => {
      if (!portfolioId) throw new Error('Nenhuma carteira selecionada.');
      return importsApi.retryRun(portfolioId, runId);
    },
    onSuccess: () => {
      if (!portfolioId) return;
      queryClient.invalidateQueries({ queryKey: importKeys.runs(portfolioId) });
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
    },
  });
}

export function useIntegrationReviews(params?: {
  limit?: number;
  cursor?: string;
  severity?: string;
  portfolioId?: string;
  source?: string;
  state?: string;
}) {
  return useQuery({
    queryKey: reviewKeys.lists(params),
    queryFn: () => importsApi.listReviews(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function usePendingReviewsCount() {
  return useQuery({
    queryKey: reviewKeys.count(),
    queryFn: () => importsApi.countPendingReviews(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useIntegrationReviewDetail(runId: string | null) {
  return useQuery({
    queryKey: runId ? reviewKeys.detail(runId) : ['reviews', 'detail', 'empty'],
    queryFn: () => {
      if (!runId) throw new Error('ID do run é obrigatório.');
      return importsApi.getReviewDetail(runId);
    },
    enabled: Boolean(runId),
    staleTime: 30_000,
  });
}

export function useRecordReconciliationDecision(runId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReconciliationDecisionPayload) => {
      if (!runId) throw new Error('ID do run é obrigatório.');
      return importsApi.recordDecision(runId, payload);
    },
    onSuccess: () => {
      if (runId) {
        queryClient.invalidateQueries({ queryKey: reviewKeys.detail(runId) });
      }
      queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      queryClient.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}
