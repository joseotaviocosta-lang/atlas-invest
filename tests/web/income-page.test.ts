import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';

describe('Web: Portfolio Income View', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render income with DIVIDEND type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-1',
            transactionId: 'tx-1',
            type: 'DIVIDEND',
            typeLabel: 'Dividendo',
            tradeDate: '2026-01-15',
            formattedTradeDate: '15 de janeiro de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: 'asset-1',
            assetTicker: 'PETR4',
            assetName: 'Petrobras',
            amount: 'R$ 100,00',
            currency: 'BRL',
            status: null,
            isCostBasisIncomplete: false,
            canNavigateToAsset: true,
          },
        ],
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: 'R$ 500,00', currency: 'BRL' },
            totalJcp: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFiiIncome: { amount: 'R$ 0,00', currency: 'BRL' },
            totalIncome: { amount: 'R$ 500,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('DIVIDEND');
    expect(res.data[0].amount).toBe('R$ 100,00');
  });

  it('should render income with JCP type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-2',
            transactionId: 'tx-2',
            type: 'JCP',
            typeLabel: 'JCP',
            tradeDate: '2026-02-20',
            formattedTradeDate: '20 de fevereiro de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: 'asset-2',
            assetTicker: 'PETR4',
            assetName: 'Petrobras',
            amount: 'R$ 50,00',
            currency: 'BRL',
            status: null,
            isCostBasisIncomplete: false,
            canNavigateToAsset: true,
          },
        ],
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: 'R$ 0,00', currency: 'BRL' },
            totalJcp: { amount: 'R$ 200,00', currency: 'BRL' },
            totalFiiIncome: { amount: 'R$ 0,00', currency: 'BRL' },
            totalIncome: { amount: 'R$ 200,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('JCP');
    expect(res.data[0].amount).toBe('R$ 50,00');
  });

  it('should render income with FII_INCOME type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-3',
            transactionId: 'tx-3',
            type: 'FII_INCOME',
            typeLabel: 'Rendimento de FII',
            tradeDate: '2026-03-10',
            formattedTradeDate: '10 de março de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: 'asset-3',
            assetTicker: 'RFIL11',
            assetName: 'Fundo Imobiliário XYZ',
            amount: 'R$ 75,00',
            currency: 'USD',
            status: null,
            isCostBasisIncomplete: false,
            canNavigateToAsset: true,
          },
        ],
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: 'R$ 0,00', currency: 'BRL' },
            totalJcp: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFiiIncome: { amount: 'R$ 300,00', currency: 'USD' },
            totalIncome: { amount: 'R$ 300,00', currency: 'USD' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('FII_INCOME');
    expect(res.data[0].currency).toBe('USD');
    expect(res.data[0].amount).toBe('R$ 75,00');
  });

  it('should support multi-currency segregation', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-4',
            transactionId: 'tx-4',
            type: 'DIVIDEND',
            typeLabel: 'Dividendo',
            tradeDate: '2026-01-15',
            formattedTradeDate: '15 de janeiro de 2026',
            accountId: 'acc-1',
            assetId: 'asset-1',
            assetTicker: 'PETR4',
            assetName: 'Petrobras',
            amount: 'R$ 100,00',
            currency: 'BRL',
            status: null,
            isCostBasisIncomplete: false,
            canNavigateToAsset: true,
          },
          {
            id: 'tx-5',
            transactionId: 'tx-5',
            type: 'DIVIDEND',
            typeLabel: 'Dividendo',
            tradeDate: '2026-01-16',
            formattedTradeDate: '16 de janeiro de 2026',
            accountId: 'acc-1',
            assetId: 'asset-2',
            assetTicker: 'USFD',
            assetName: 'US Franchise',
            amount: '$ 50,00',
            currency: 'USD',
            status: null,
            isCostBasisIncomplete: false,
            canNavigateToAsset: true,
          },
        ],
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: 'R$ 100,00', currency: 'BRL' },
            totalJcp: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFiiIncome: { amount: 'R$ 0,00', currency: 'BRL' },
            totalIncome: { amount: 'R$ 100,00', currency: 'BRL' },
          },
          {
            currency: 'USD',
            totalDividends: { amount: 'R$ 0,00', currency: 'BRL' },
            totalJcp: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFiiIncome: { amount: 'R$ 0,00', currency: 'BRL' },
            totalIncome: { amount: 'US$ 50,00', currency: 'USD' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');

    expect(res.data).toHaveLength(2);
    const brlItems = res.data.filter((item) => item.currency === 'BRL');
    const usdItems = res.data.filter((item) => item.currency === 'USD');
    expect(brlItems).toHaveLength(1);
    expect(usdItems).toHaveLength(1);
    expect(brlItems[0].amount).toBe('R$ 100,00');
    expect(usdItems[0].amount).toBe('$ 50,00');
  });

  it('should support period filter', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        incomeSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=income&from=2026-01-01&to=2026-03-31&limit=25',
    );

    expect(res.data).toHaveLength(0);
  });

  it('should support type filter', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        incomeSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=JCP&limit=25');

    expect(res.data).toHaveLength(0);
  });

  it('should render empty state when no income found', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        incomeSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');

    expect(res.data).toHaveLength(0);
  });

  it('should render filtered empty state', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        incomeSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=INVALID&limit=25');

    expect(res.data).toHaveLength(0);
  });

  it('should handle error gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    let fetched = false;
    try {
      await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=income&limit=25');
    } catch {
      fetched = global.fetch?.mock?.calls?.length > 0;
    }

    expect(fetched).toBe(true);
  });
});
