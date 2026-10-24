import { apiClient } from './client';

export interface MobileReviewSignal {
  id: string;
  code: string;
  category: string;
  severity: 'INFO' | 'REVIEW' | 'WARNING';
  evidence: Record<string, string | number | boolean | null>;
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
}

export interface MobilePortfolioReview {
  portfolioId: string;
  asOf: { generatedAt: string; marketDataAsOf: string | null };
  summary: { attentionCount: number; dataNote: string | null };
  dataQuality: {
    valuationCoveragePercent: string | null;
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    stalePositions: number;
    missingPrices: number;
    reconciliation: {
      divergent: number;
      missingLocal: number;
      missingSource: number;
      unresolved: number;
    };
    partialRuns: number;
    pendingReviews: number;
  };
  signals: MobileReviewSignal[];
  isEmpty: boolean;
}

export const reviewApi = {
  async getReview(portfolioId: string): Promise<{ data: MobilePortfolioReview }> {
    return apiClient.get(`/api/v1/portfolios/${portfolioId}/review`);
  },

  async getSignalDetail(
    portfolioId: string,
    code: string,
    period: string,
  ): Promise<{ data: Record<string, unknown> }> {
    return apiClient.get(
      `/api/v1/portfolios/${portfolioId}/review/signals/${code}?period=${period}`,
    );
  },
};
