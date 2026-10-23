import { apiClient } from './client';

export interface MobileReviewMetrics {
  newRecords: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
  partial: boolean;
}

export interface MobileReviewItem {
  id: string;
  runId: string;
  portfolioId: string;
  portfolioName: string | null;
  source: string;
  trigger: string | null;
  status: string;
  severity: 'REVIEW' | 'WARNING' | 'ERROR';
  reasonCodes: string[];
  metrics: MobileReviewMetrics;
  createdAt: string;
  action: { kind: 'REVIEW_RUN' | 'VIEW_RUN'; runId: string; portfolioId: string };
}

export interface MobileReviewListMeta {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

export const reviewsApi = {
  async listReviews(params?: { limit?: number; cursor?: string | null }): Promise<{
    data: MobileReviewItem[];
    meta: MobileReviewListMeta;
  }> {
    const query = new URLSearchParams();
    query.set('limit', String(params?.limit ?? 50));
    if (params?.cursor) query.set('cursor', params.cursor);
    return apiClient.get(`/api/v1/integration-reviews?${query.toString()}`);
  },

  async countPending(): Promise<{ data: { pendingCount: number; truncated: boolean } }> {
    return apiClient.get('/api/v1/integration-reviews/count');
  },
};
