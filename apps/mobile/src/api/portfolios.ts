import { apiClient } from './client';
import { PortfolioDto, CreatePortfolioRequest } from './types';
import {
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from '@atlas/ui';

export const portfoliosApi = {
  async listPortfolios(): Promise<{ data: PortfolioDto[] }> {
    return apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
  },

  async getPortfolio(id: string): Promise<{ data: PortfolioDto }> {
    return apiClient.get<{ data: PortfolioDto }>(`/api/v1/portfolios/${id}`);
  },

  async createPortfolio(payload: CreatePortfolioRequest): Promise<{ data: PortfolioDto }> {
    return apiClient.post<{ data: PortfolioDto }>('/api/v1/portfolios', payload);
  },

  async getPortfolioState(id: string): Promise<{ data: PortfolioStateDto }> {
    return apiClient.get<{ data: PortfolioStateDto }>(`/api/v1/portfolios/${id}/state`);
  },

  async listAccounts(portfolioId: string): Promise<{ data: Array<{ id: string; name: string }> }> {
    return apiClient.get<{ data: Array<{ id: string; name: string }> }>(
      `/api/v1/portfolios/${portfolioId}/accounts`,
    );
  },

  async getPortfolioHistory(
    portfolioId: string,
    params?: { assetId?: string; limit?: number; cursor?: string | null },
  ): Promise<{ data: PortfolioHistoryItemDto[]; meta: PortfolioHistoryPaginationMetaDto }> {
    const searchParams = new URLSearchParams();
    if (params?.assetId) searchParams.append('assetId', params.assetId);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.cursor) searchParams.append('cursor', params.cursor);
    const qs = searchParams.toString();
    const endpoint = `/api/v1/portfolios/${portfolioId}/history${qs ? `?${qs}` : ''}`;
    return apiClient.get<{
      data: PortfolioHistoryItemDto[];
      meta: PortfolioHistoryPaginationMetaDto;
    }>(endpoint);
  },

  async getAsset(assetId: string): Promise<{ data: AssetMeta }> {
    return apiClient.get<{ data: AssetMeta }>(`/api/v1/assets/${assetId}`);
  },
};
