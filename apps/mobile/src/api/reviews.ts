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
  pairReview?: { status: string; totalPairs: number; decidedPairs: number } | null;
}

export interface MobileReviewListMeta {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

export const reviewsApi = {
  async listReviews(params?: {
    limit?: number;
    cursor?: string | null;
    severity?: 'REVIEW' | 'WARNING' | 'ERROR' | null;
    source?: string | null;
    state?: 'PENDING' | 'RESOLVED' | 'ALL' | null;
  }): Promise<{
    data: MobileReviewItem[];
    meta: MobileReviewListMeta;
  }> {
    const query = new URLSearchParams();
    query.set('limit', String(params?.limit ?? 50));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.source) query.set('source', params.source);
    if (params?.state) query.set('state', params.state);
    return apiClient.get(`/api/v1/integration-reviews?${query.toString()}`);
  },

  async countPending(): Promise<{ data: { pendingCount: number; truncated: boolean } }> {
    return apiClient.get('/api/v1/integration-reviews/count');
  },

  async getReview(runId: string): Promise<{ data: MobileReviewDetail }> {
    return apiClient.get(`/api/v1/integration-reviews/${runId}`);
  },
};

export interface MobileLinkedTransaction {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH' | null;
  decidedAt: string | null;
  rectified: boolean;
}

export interface MobileReviewDetail {
  item: MobileReviewItem | null;
  state: 'ACTIONABLE' | 'RESOLVED';
  resolvedReason: string | null;
  portfolioName: string | null;
  linkedTransactions: MobileLinkedTransaction[];
  linkedTransactionsTruncated: boolean;
  limitations: string[];
}
