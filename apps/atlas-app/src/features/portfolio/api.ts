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

  async getDecisionBrief(
    portfolioId: string,
    options?: { contributionAmount?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').PortfolioDailyDecisionBriefDto }> {
    const params = new URLSearchParams();
    if (options?.contributionAmount) {
      params.set('contributionAmount', options.contributionAmount);
    }
    if (options?.refresh) {
      params.set('refresh', 'true');
    }
    const qs = params.toString();
    return apiClient.get<{ data: import('./types').PortfolioDailyDecisionBriefDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief${qs ? `?${qs}` : ''}`
    );
  },

  async simulateContribution(
    portfolioId: string,
    params: { amount: string; currency?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').ContributionAllocationSimulationDto }> {
    return apiClient.post<{ data: import('./types').ContributionAllocationSimulationDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief/simulate`,
      params,
    );
  },

  async compareContributionScenarios(
    portfolioId: string,
    params: { amount: string; currency?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').ContributionScenarioComparisonDto }> {
    return apiClient.post<{ data: import('./types').ContributionScenarioComparisonDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief/scenarios`,
      params,
    );
  },

  async projectPortfolio(
    portfolioId: string,
    params: { amount: string; currency?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').ProjectedPortfolioAfterContributionDto }> {
    return apiClient.post<{ data: import('./types').ProjectedPortfolioAfterContributionDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief/projection`,
      params,
    );
  },

  async projectScenarios(
    portfolioId: string,
    params: { amount: string; currency?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').ProjectedPortfolioScenarioComparisonDto }> {
    return apiClient.post<{ data: import('./types').ProjectedPortfolioScenarioComparisonDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief/project-scenarios`,
      params,
    );
  },

  async getContributionProgress(
    portfolioId: string,
    options?: { period?: string; contributionAmount?: string; refresh?: boolean },
  ): Promise<{ data: import('./types').ContributionPlanProgressDto }> {
    const params = new URLSearchParams();
    if (options?.period) {
      params.set('period', options.period);
    }
    if (options?.contributionAmount) {
      params.set('contributionAmount', options.contributionAmount);
    }
    if (options?.refresh) {
      params.set('refresh', 'true');
    }
    const qs = params.toString();
    return apiClient.get<{ data: import('./types').ContributionPlanProgressDto }>(
      `/api/v1/portfolios/${portfolioId}/decision-brief/contribution-progress${qs ? `?${qs}` : ''}`,
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
    payload:
      | Array<import('./types').PortfolioNewsAlertAuditItemDto>
      | {
          items: Array<import('./types').PortfolioNewsAlertAuditItemDto>;
          alertAttemptId?: string;
          notificationId?: string | null;
        },
  ): Promise<{
    data: {
      confirmedCount: number;
      historyInsertedCount?: number;
      duplicateSkippedCount?: number;
      deliveredAt: string;
    };
  }> {
    const body = Array.isArray(payload) ? { items: payload } : payload;
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/confirm`,
      body
    );
  },

  async releasePortfolioNewsAlertsClaim(
    portfolioId: string,
    payload:
      | Array<import('./types').PortfolioNewsAlertAuditItemDto>
      | {
          items: Array<import('./types').PortfolioNewsAlertAuditItemDto>;
          deliveryStatus?: Exclude<import('./types').PortfolioNewsAlertHistoryStatusDto, 'DELIVERED'>;
          failureReason?: string | null;
          attemptedAt?: string;
          alertAttemptId?: string;
          recordHistory?: boolean;
        },
  ): Promise<{ data: { releasedCount: number; historyInsertedCount?: number } }> {
    const body = Array.isArray(payload) ? { items: payload } : payload;
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/release`,
      body
    );
  },

  async getPortfolioNewsAlertHistory(
    portfolioId: string,
    params?: {
      limit?: number;
      cursor?: string;
      status?: import('./types').PortfolioNewsAlertHistoryStatusDto;
      ticker?: string;
      materiality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
      alertType?: import('./types').PortfolioNewsAlertTypeDto;
      from?: string;
      to?: string;
    },
  ): Promise<{ data: import('./types').PortfolioNewsAlertHistoryResponseDto }> {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.status) search.set('status', params.status);
    if (params?.ticker) search.set('ticker', params.ticker.trim().toUpperCase());
    if (params?.materiality) search.set('materiality', params.materiality);
    if (params?.alertType) search.set('alertType', params.alertType);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    const qs = search.toString();
    return apiClient.get(
      `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history${qs ? `?${qs}` : ''}`
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
