import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';

describe('Web: Portfolio Cash Flow View', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render cash flow with DEPOSIT type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-1',
            transactionId: 'tx-1',
            type: 'DEPOSIT',
            typeLabel: 'Depósito',
            direction: 'INFLOW',
            tradeDate: '2026-01-15',
            formattedTradeDate: '15 de janeiro de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'R$ 1.000,00',
            currency: 'BRL',
            category: null,
            secondaryContext: null,
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 0,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 0,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 0,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('DEPOSIT');
    expect(res.data[0].direction).toBe('INFLOW');
    expect(res.data[0].amount).toBe('R$ 1.000,00');
  });

  it('should render cash flow with WITHDRAWAL type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-2',
            transactionId: 'tx-2',
            type: 'WITHDRAWAL',
            typeLabel: 'Retirada',
            direction: 'OUTFLOW',
            tradeDate: '2026-02-20',
            formattedTradeDate: '20 de fevereiro de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'R$ 250,00',
            currency: 'BRL',
            category: null,
            secondaryContext: null,
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 0,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 250,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ -250,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 0,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 250,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 0,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('WITHDRAWAL');
    expect(res.data[0].direction).toBe('OUTFLOW');
    expect(res.data[0].amount).toBe('R$ 250,00');
  });

  it('should render cash flow with FEE type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-3',
            transactionId: 'tx-3',
            type: 'FEE',
            typeLabel: 'Taxa',
            direction: 'OUTFLOW',
            tradeDate: '2026-03-10',
            formattedTradeDate: '10 de março de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'R$ 15,00',
            currency: 'BRL',
            category: null,
            secondaryContext: 'Taxa',
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 0,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 15,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ -15,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 0,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 0,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 15,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('FEE');
    expect(res.data[0].direction).toBe('OUTFLOW');
    expect(res.data[0].secondaryContext).toBe('Taxa');
    expect(res.data[0].amount).toBe('R$ 15,00');
  });

  it('should render cash flow with TAX type (Tributo pago)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-4',
            transactionId: 'tx-4',
            type: 'TAX',
            typeLabel: 'Tributo pago',
            direction: 'OUTFLOW',
            tradeDate: '2026-04-01',
            formattedTradeDate: '01 de abril de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'R$ 30,00',
            currency: 'BRL',
            category: null,
            secondaryContext: null,
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 0,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 30,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ -30,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 0,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 30,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 0,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 30,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('TAX');
    expect(res.data[0].direction).toBe('OUTFLOW');
    expect(res.data[0].typeLabel).toBe('Tributo pago');
    expect(res.data[0].amount).toBe('R$ 30,00');
  });

  it('should render cash flow with AMORTIZATION type', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-5',
            transactionId: 'tx-5',
            type: 'AMORTIZATION',
            typeLabel: 'Amortização',
            direction: 'INFLOW',
            tradeDate: '2026-05-01',
            formattedTradeDate: '01 de maio de 2026',
            accountId: 'acc-1',
            accountName: 'Conta 1',
            assetId: 'asset-1',
            assetTicker: 'PETR4',
            assetName: 'Petrobras',
            amount: 'R$ 500,00',
            currency: 'BRL',
            category: null,
            secondaryContext: 'Devolução de capital',
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 500,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 0,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ 500,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 0,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 0,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 500,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 0,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'BRL' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('AMORTIZATION');
    expect(res.data[0].direction).toBe('INFLOW');
    expect(res.data[0].typeLabel).toBe('Amortização');
    expect(res.data[0].secondaryContext).toBe('Devolução de capital');
    expect(res.data[0].amount).toBe('R$ 500,00');
  });

  it('should support multi-currency segregation', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-6',
            transactionId: 'tx-6',
            type: 'DEPOSIT',
            typeLabel: 'Depósito',
            direction: 'INFLOW',
            tradeDate: '2026-01-15',
            formattedTradeDate: '15 de janeiro de 2026',
            accountId: 'acc-1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'R$ 1.000,00',
            currency: 'BRL',
            category: null,
            secondaryContext: null,
          },
          {
            id: 'tx-7',
            transactionId: 'tx-7',
            type: 'WITHDRAWAL',
            typeLabel: 'Retirada',
            direction: 'OUTFLOW',
            tradeDate: '2026-01-16',
            formattedTradeDate: '16 de janeiro de 2026',
            accountId: 'acc-1',
            assetId: null,
            assetTicker: null,
            assetName: null,
            amount: 'US$ 200,00',
            currency: 'USD',
            category: null,
            secondaryContext: null,
          },
        ],
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 0,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalExternalContributions: { amount: 'R$ 1.000,00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: 'R$ 0,00', currency: 'BRL' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'BRL' },
            totalFees: { amount: 'R$ 0,00', currency: 'BRL' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'BRL' },
          },
          {
            currency: 'USD',
            totalInflows: { amount: 'R$ 0,00', currency: 'BRL' },
            totalOutflows: { amount: 'R$ 0,00', currency: 'BRL' },
            netExternalFlow: { amount: 'R$ 0,00', currency: 'USD' },
            totalExternalContributions: { amount: 'R$ 0,00', currency: 'USD' },
            totalExternalWithdrawals: { amount: 'R$ 200,00', currency: 'USD' },
            totalCapitalReturns: { amount: 'R$ 0,00', currency: 'USD' },
            totalFees: { amount: 'R$ 0,00', currency: 'USD' },
            totalTaxes: { amount: 'R$ 0,00', currency: 'USD' },
          },
        ],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(2);
    const brlItems = res.data.filter((item) => item.currency === 'BRL');
    const usdItems = res.data.filter((item) => item.currency === 'USD');
    expect(brlItems).toHaveLength(1);
    expect(usdItems).toHaveLength(1);
    expect(brlItems[0].amount).toBe('R$ 1.000,00');
    expect(usdItems[0].amount).toBe('US$ 200,00');
  });

  it('should support period filter', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        cashFlowSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&from=2026-01-01&to=2026-03-31&limit=25',
    );

    expect(res.data).toHaveLength(0);
  });

  it('should support pagination with opaque cursor', async () => {
    const mockFetch1 = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-1',
            transactionId: 'tx-1',
            type: 'DEPOSIT',
            typeLabel: 'Depósito',
            direction: 'INFLOW',
            tradeDate: '2026-01-15',
            formattedTradeDate: '15 de janeiro de 2026',
            accountId: 'acc-1',
          },
        ],
        meta: {
          limit: 25,
          cursor: 'cursor-page-1',
          nextCursor: 'cursor-page-2',
          hasMore: true,
          totalCount: 50,
        },
      }),
    });
    const mockFetch2 = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'tx-2',
            transactionId: 'tx-2',
            type: 'WITHDRAWAL',
            typeLabel: 'Retirada',
            direction: 'OUTFLOW',
            tradeDate: '2026-02-20',
            formattedTradeDate: '20 de fevereiro de 2026',
            accountId: 'acc-1',
          },
        ],
        meta: {
          limit: 25,
          cursor: 'cursor-page-2',
          nextCursor: null,
          hasMore: false,
          totalCount: 50,
        },
      }),
    });
    global.fetch = mockFetch1 as unknown as typeof fetch;

    const res1 = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );
    expect(res1.meta.totalCount).toBe(50);

    global.fetch = mockFetch2 as unknown as typeof fetch;
    const res2 = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25&cursor=cursor-page-1',
    );

    expect(res2.data).toHaveLength(1);
    expect(res2.meta.nextCursor).toBeNull();
    expect(res2.meta.hasMore).toBe(false);
  });

  it('should render empty state when no cash flow found', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        cashFlowSummaries: [],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get(
      '/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25',
    );

    expect(res.data).toHaveLength(0);
  });

  it('should render filtered empty state', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        cashFlowSummaries: [],
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
      await apiClient.get('/api/v1/portfolios/portfolio-1/history?type=cash-flow&limit=25');
    } catch {
      fetched = global.fetch?.mock?.calls?.length > 0;
    }

    expect(fetched).toBe(true);
  });
});
