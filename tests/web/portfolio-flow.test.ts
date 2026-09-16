import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { PortfolioDto, CreatePortfolioRequest, PORTFOLIO_TYPES } from '@/api/types';
import { useAuthStore } from '@/stores/auth.store';

describe('Web Foundation: Portfolio Data Flow & Structural Model', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(
      {
        id: 'usr-1',
        name: 'Investidor',
        email: 'inv@atlas.dev',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'valid-access-token',
    );
    vi.restoreAllMocks();
  });

  it('should verify all supported structural portfolio types', () => {
    expect(PORTFOLIO_TYPES).toEqual(['PERSONAL', 'FAMILY', 'COMPANY', 'SIMULATION']);
  });

  it('should fetch and deserialize user portfolio list', async () => {
    const mockPortfolios: PortfolioDto[] = [
      {
        id: 'port-1',
        userId: 'usr-1',
        name: 'Carteira Pessoal Principal',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'port-2',
        userId: 'usr-1',
        name: 'Simulação Tech Global',
        baseCurrency: 'USD',
        type: 'SIMULATION',
        status: 'ACTIVE',
        createdAt: '2026-03-05T12:00:00.000Z',
        updatedAt: '2026-03-05T12:00:00.000Z',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: mockPortfolios }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');

    expect(res.data).toHaveLength(2);
    expect(res.data[0].type).toBe('PERSONAL');
    expect(res.data[1].type).toBe('SIMULATION');
  });

  it('should post new portfolio with selected type and currency', async () => {
    const newPortfolioPayload: CreatePortfolioRequest = {
      name: 'Holding Familiar',
      type: 'FAMILY',
      baseCurrency: 'BRL',
    };

    const mockCreatedPortfolio: PortfolioDto = {
      id: 'port-new',
      userId: 'usr-1',
      ...newPortfolioPayload,
      type: 'FAMILY',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: mockCreatedPortfolio }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.post<{ data: PortfolioDto }>(
      '/api/v1/portfolios',
      newPortfolioPayload,
    );

    expect(res.data.id).toBe('port-new');
    expect(res.data.name).toBe('Holding Familiar');
    expect(res.data.type).toBe('FAMILY');

    const [, reqOptions] = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(reqOptions.body as string);
    expect(sentBody.name).toBe('Holding Familiar');
    expect(sentBody.type).toBe('FAMILY');
    expect(sentBody.baseCurrency).toBe('BRL');
  });
});
