import { apiClient } from './client';
import { PortfolioDto, CreatePortfolioRequest } from './types';
import { PortfolioStateDto } from '@atlas/ui';

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
};
