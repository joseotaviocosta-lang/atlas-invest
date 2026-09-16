import { apiClient } from './client';
import { PortfolioDto, CreatePortfolioRequest } from './types';

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
};
