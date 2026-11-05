import { apiClient } from '../../lib/api';
import type {
  PreviewPayload,
  PreviewResponse,
  ConfirmPayload,
  ImportReceipt,
  ImportRunItem,
  ImportRunListResponse,
  ReviewListResponse,
  PendingCountResponse,
  ReviewDetailData,
  ReconciliationDecisionPayload,
  ReconciliationDecisionResponse,
} from './types';

export const importsApi = {
  async preview(portfolioId: string, payload: PreviewPayload): Promise<PreviewResponse> {
    const res = await apiClient.post<{ data: PreviewResponse }>(
      `/api/v1/portfolios/${portfolioId}/imports/preview`,
      payload
    );
    return res.data;
  },

  async confirm(portfolioId: string, payload: ConfirmPayload): Promise<ImportReceipt> {
    const res = await apiClient.post<{ data: ImportReceipt }>(
      `/api/v1/portfolios/${portfolioId}/imports/confirm`,
      payload
    );
    return res.data;
  },

  async listRuns(
    portfolioId: string,
    limit: number = 50,
    cursor?: string
  ): Promise<ImportRunListResponse> {
    const cursorParam = cursor ? `&cursor=${cursor}` : '';
    return apiClient.get<ImportRunListResponse>(
      `/api/v1/portfolios/${portfolioId}/imports/runs?limit=${limit}${cursorParam}`
    );
  },

  async getRun(portfolioId: string, runId: string): Promise<ImportRunItem> {
    const res = await apiClient.get<{ data: ImportRunItem }>(
      `/api/v1/portfolios/${portfolioId}/imports/runs/${runId}`
    );
    return res.data;
  },

  async retryRun(
    portfolioId: string,
    runId: string
  ): Promise<{ originalRunId: string; newRunId: string; status: string; message: string }> {
    const res = await apiClient.post<{
      data: { originalRunId: string; newRunId: string; status: string; message: string };
    }>(`/api/v1/portfolios/${portfolioId}/imports/runs/${runId}/retry`);
    return res.data;
  },

  async listReviews(params?: {
    limit?: number;
    cursor?: string;
    severity?: string;
    portfolioId?: string;
    source?: string;
    state?: string;
  }): Promise<ReviewListResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(params?.limit ?? 50));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.severity && params.severity !== 'ALL') searchParams.set('severity', params.severity);
    if (params?.portfolioId) searchParams.set('portfolioId', params.portfolioId);
    if (params?.source && params.source !== 'ALL') searchParams.set('source', params.source);
    if (params?.state && params.state !== 'ALL') searchParams.set('state', params.state);

    return apiClient.get<ReviewListResponse>(
      `/api/v1/integration-reviews?${searchParams.toString()}`
    );
  },

  async countPendingReviews(): Promise<number> {
    const res = await apiClient.get<{ data: PendingCountResponse }>(
      '/api/v1/integration-reviews/count'
    );
    return res.data.pendingCount;
  },

  async getReviewDetail(runId: string): Promise<ReviewDetailData> {
    const res = await apiClient.get<{ data: ReviewDetailData }>(
      `/api/v1/integration-reviews/${runId}`
    );
    return res.data;
  },

  async recordDecision(
    runId: string,
    payload: ReconciliationDecisionPayload
  ): Promise<ReconciliationDecisionResponse> {
    const res = await apiClient.post<{ data: ReconciliationDecisionResponse }>(
      `/api/v1/integration-reviews/${runId}/decisions`,
      payload
    );
    return res.data;
  },
};
