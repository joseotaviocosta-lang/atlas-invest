import { apiClient } from './client';
import {
  PortfolioDto,
  CreatePortfolioRequest,
  AccountDto,
  InstitutionDto,
  AssetDto,
} from './types';
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

  async getPortfolioState(id: string, asOf?: string | null): Promise<{ data: PortfolioStateDto }> {
    const endpoint = asOf
      ? `/api/v1/portfolios/${id}/state?asOf=${asOf}`
      : `/api/v1/portfolios/${id}/state`;
    return apiClient.get<{ data: PortfolioStateDto }>(endpoint);
  },

  async getPortfolioHistory(
    portfolioId: string,
    params?: {
      type?: 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
      from?: string;
      to?: string;
      accountId?: string;
      assetId?: string;
      limit?: number;
      cursor?: string | null;
    },
  ): Promise<{ data: PortfolioHistoryItemDto[]; meta: PortfolioHistoryPaginationMetaDto }> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.append('type', params.type);
    if (params?.from) searchParams.append('from', params.from);
    if (params?.to) searchParams.append('to', params.to);
    if (params?.accountId) searchParams.append('accountId', params.accountId);
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

  async listAccounts(portfolioId: string): Promise<{ data: AccountDto[] }> {
    return apiClient.get<{ data: AccountDto[] }>(`/api/v1/portfolios/${portfolioId}/accounts`);
  },

  async listInstitutions(): Promise<{ data: InstitutionDto[] }> {
    return apiClient.get<{ data: InstitutionDto[] }>('/api/v1/institutions');
  },

  async listAssets(): Promise<{ data: AssetDto[] }> {
    return apiClient.get<{ data: AssetDto[] }>('/api/v1/assets');
  },
};
