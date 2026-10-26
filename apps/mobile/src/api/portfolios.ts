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
  GroundedExplanationDto,
  AiConversationListItemDto,
  AiConversationMessageDto,
} from '@atlas/ui';

export type MobileAiScope =
  | { type: 'PORTFOLIO' }
  | { type: 'ASSET'; assetId: string }
  | { type: 'TIMELINE'; from?: string; to?: string }
  | { type: 'ASSET_TIMELINE'; assetId: string; from?: string; to?: string };

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

  async getPortfolioComposition(portfolioId: string): Promise<{ data: unknown }> {
    return apiClient.get<{ data: unknown }>(`/api/v1/portfolios/${portfolioId}/composition`);
  },

  async getPositionPerformance(
    portfolioId: string,
    assetId: string,
    query = '',
  ): Promise<{ data: unknown }> {
    const qs = query ? `?${query}` : '';
    return apiClient.get<{ data: unknown }>(
      `/api/v1/portfolios/${portfolioId}/positions/${assetId}/performance${qs}`,
    );
  },

  async getPositionIntelligence(portfolioId: string, assetId: string): Promise<{ data: unknown }> {
    return apiClient.get<{ data: unknown }>(
      `/api/v1/portfolios/${portfolioId}/positions/${assetId}/intelligence`,
    );
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

  async explainPortfolio(
    portfolioId: string,
    question: string,
  ): Promise<{ data: GroundedExplanationDto }> {
    return apiClient.post<{ data: GroundedExplanationDto }>(
      `/api/v1/portfolios/${portfolioId}/ai/explain`,
      { question },
    );
  },

  async createAiConversation(
    portfolioId: string,
    title?: string,
  ): Promise<{ data: AiConversationListItemDto }> {
    return apiClient.post<{ data: AiConversationListItemDto }>(
      `/api/v1/portfolios/${portfolioId}/ai/conversations`,
      { title },
    );
  },

  async listAiConversations(
    portfolioId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{
    data: AiConversationListItemDto[];
    meta: { limit: number; cursor?: string; nextCursor?: string; hasMore: boolean };
  }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/v1/portfolios/${portfolioId}/ai/conversations${qs}`);
  },

  async getAiConversation(
    portfolioId: string,
    conversationId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{
    data: AiConversationListItemDto & { messages: AiConversationMessageDto[] };
    meta: { limit: number; cursor?: string; nextCursor?: string; hasMore: boolean };
  }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(
      `/api/v1/portfolios/${portfolioId}/ai/conversations/${conversationId}${qs}`,
    );
  },

  async sendAiConversationMessage(
    portfolioId: string,
    conversationId: string,
    question: string,
    scope?: MobileAiScope,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    data: GroundedExplanationDto & { userMessageId?: string; assistantMessageId?: string };
  }> {
    return apiClient.post(
      `/api/v1/portfolios/${portfolioId}/ai/conversations/${conversationId}/messages`,
      { question, scope, startDate, endDate },
    );
  },

  async streamAiConversationMessage<TEvent = unknown>(
    portfolioId: string,
    conversationId: string,
    question: string,
    onEvent: (event: TEvent) => void,
    options?: {
      scope?: MobileAiScope;
      startDate?: string;
      endDate?: string;
      signal?: AbortSignal;
    },
  ): Promise<void> {
    return apiClient.stream(
      `/api/v1/portfolios/${portfolioId}/ai/conversations/${conversationId}/messages/stream`,
      {
        question,
        scope: options?.scope,
        startDate: options?.startDate,
        endDate: options?.endDate,
      },
      onEvent,
      { signal: options?.signal },
    );
  },
};
