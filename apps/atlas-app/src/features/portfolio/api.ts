import { apiClient } from '../../lib/api';
import type {
  PortfolioDto,
  PortfolioValuationResponse,
  PortfolioAllocationResponse,
  PortfolioPerformanceResponse,
  PortfolioHistoryResponse,
  IngestionReceiptDto,
} from './types';
import type { RawPerformanceSeriesData } from '@atlas/ui';

export const portfolioApi = {
  async listPortfolios(): Promise<PortfolioDto[]> {
    const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
    return res.data ?? [];
  },

  async getValuation(portfolioId: string): Promise<PortfolioValuationResponse> {
    return apiClient.get<PortfolioValuationResponse>(`/api/v1/portfolios/${portfolioId}/valuation`);
  },

  async getAllocation(portfolioId: string): Promise<PortfolioAllocationResponse> {
    return apiClient.get<PortfolioAllocationResponse>(`/api/v1/portfolios/${portfolioId}/allocation`);
  },

  async getPerformance(
    portfolioId: string,
    startDate: string,
    endDate: string,
    benchmark?: string
  ): Promise<PortfolioPerformanceResponse> {
    const bQuery = benchmark ? `&benchmark=${benchmark}` : '';
    return apiClient.get<PortfolioPerformanceResponse>(
      `/api/v1/portfolios/${portfolioId}/performance?startDate=${startDate}&endDate=${endDate}${bQuery}`
    );
  },

  async getPerformanceSeries(
    portfolioId: string,
    startDate: string,
    endDate: string,
    benchmark?: string
  ): Promise<{ data: RawPerformanceSeriesData }> {
    const bQuery = benchmark ? `&benchmark=${benchmark}` : '';
    return apiClient.get<{ data: RawPerformanceSeriesData }>(
      `/api/v1/portfolios/${portfolioId}/performance/series?startDate=${startDate}&endDate=${endDate}${bQuery}`
    );
  },

  async getHistory(
    portfolioId: string,
    limit = 50
  ): Promise<PortfolioHistoryResponse> {
    return apiClient.get<PortfolioHistoryResponse>(
      `/api/v1/portfolios/${portfolioId}/history?limit=${limit}`
    );
  },

  async updateMarketData(portfolioId: string): Promise<IngestionReceiptDto> {
    const res = await apiClient.post<{ data: IngestionReceiptDto }>(
      `/api/v1/portfolios/${portfolioId}/market-data/update`,
      {}
    );
    return res.data;
  },

  async getOpportunityRadar(
    portfolioId: string,
    strategy?: string,
  ): Promise<{ data: import('./types').OpportunityRadarResponseDto }> {
    const query = strategy ? `?strategy=${encodeURIComponent(strategy)}` : '';
    return apiClient.get<{ data: import('./types').OpportunityRadarResponseDto }>(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar${query}`
    );
  },

  async refreshOpportunityRadar(
    portfolioId: string,
    strategy?: string,
  ): Promise<{ data: import('./types').OpportunityRadarResponseDto }> {
    const query = strategy ? `?strategy=${encodeURIComponent(strategy)}` : '';
    return apiClient.post<{ data: import('./types').OpportunityRadarResponseDto }>(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/refresh${query}`,
      {}
    );
  },

  async getPortfolioNews(
    portfolioId: string,
    options?: { refresh?: boolean },
  ): Promise<{ data: import('./types').PortfolioNewsInboxResponseDto }> {
    const query = options?.refresh ? '?refresh=true' : '';
    return apiClient.get<{ data: import('./types').PortfolioNewsInboxResponseDto }>(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news${query}`
    );
  },

  async refreshPortfolioNews(
    portfolioId: string,
  ): Promise<{ data: import('./types').PortfolioNewsInboxResponseDto }> {
    return apiClient.post<{ data: import('./types').PortfolioNewsInboxResponseDto }>(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/refresh`,
      {}
    );
  },

  async markPortfolioNewsSeen(
    portfolioId: string,
    payload: { canonicalEventIds?: string[]; markAllNew?: boolean },
  ): Promise<{ data: { updatedCount: number; updatedIds: string[]; seenAt: string } }> {
    return apiClient.post<{ data: { updatedCount: number; updatedIds: string[]; seenAt: string } }>(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/seen`,
      payload
    );
  },

  async claimPortfolioNewsAlerts(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<{ data: { claimed: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>; skippedCount: number } }> {
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/claim`,
      { items }
    );
  },

  async confirmPortfolioNewsAlertsDelivered(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<{ data: { confirmedCount: number; deliveredAt: string } }> {
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/confirm`,
      { items }
    );
  },

  async releasePortfolioNewsAlertsClaim(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<{ data: { releasedCount: number } }> {
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/release`,
      { items }
    );
  },

  async suppressPortfolioNewsAlertsBaseline(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<{ data: { suppressedCount: number; recordedAt: string } }> {
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/suppress`,
      { items }
    );
  },
};
