import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';
import {
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
} from '@atlas/ui';

describe('Mobile: Portfolio History & Activity Integration (Fase 2C)', () => {
  const originalFetch = global.fetch;
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const portfolioId2 = 'c0000000-0000-4000-8000-000000000002';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    clearQueryCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches, filters, and caches portfolio history via mobile portfoliosApi', async () => {
    const mockHistoryItem: PortfolioHistoryItemDto = {
      id: 'h-001',
      kind: 'REALIZED_DISPOSAL',
      transactionId: 'tx-001',
      tradeDate: '2026-09-18',
      accountId: accountId1,
      assetId: assetPetr4,
      currency: 'BRL',
      details: {
        quantity: '100',
        netProceeds: { amount: '3000.00', currency: 'BRL' },
        realizedGainLoss: { amount: '500.00', currency: 'BRL' },
        status: 'KNOWN',
      },
    };

    const mockResponse = {
      data: [mockHistoryItem],
      meta: {
        limit: 25,
        cursor: null,
        nextCursor: 'next_cur_1',
        hasMore: true,
        totalCount: 1,
      },
    };

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const queryData = await queryClient.fetchQuery({
      queryKey: [
        'portfolio-history',
        portfolioId,
        { type: 'realized', accountId: accountId1, from: '2026-09-01', to: '2026-09-18' },
      ],
      queryFn: () =>
        portfoliosApi.getPortfolioHistory(portfolioId, {
          type: 'realized',
          accountId: accountId1,
          from: '2026-09-01',
          to: '2026-09-18',
          limit: 25,
        }),
    });

    expect(queryData.data).toHaveLength(1);
    expect(queryData.data[0]!.id).toBe('h-001');
    expect(queryData.data[0]!.kind).toBe('REALIZED_DISPOSAL');
    expect(queryData.meta.nextCursor).toBe('next_cur_1');

    // Verify URL parameters in fetch call
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('type=realized'),
      expect.anything(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`accountId=${accountId1}`),
      expect.anything(),
    );
  });

  it('guarantees portfolio switch and cache isolation across portfolios', async () => {
    const mockItemP1: PortfolioHistoryItemDto = {
      id: 'p1-item',
      kind: 'CASH_FLOW',
      transactionId: 'tx-p1',
      tradeDate: '2026-09-15',
      accountId: accountId1,
      assetId: null,
      currency: 'BRL',
      details: { type: 'DEPOSIT', amount: { amount: '1000.00', currency: 'BRL' } },
    };

    const mockItemP2: PortfolioHistoryItemDto = {
      id: 'p2-item',
      kind: 'CASH_FLOW',
      transactionId: 'tx-p2',
      tradeDate: '2026-09-15',
      accountId: accountId1,
      assetId: null,
      currency: 'BRL',
      details: { type: 'DEPOSIT', amount: { amount: '5000.00', currency: 'BRL' } },
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [mockItemP1],
            meta: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [mockItemP2],
            meta: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const dataP1 = await queryClient.fetchQuery({
      queryKey: ['portfolio-history', portfolioId, {}],
      queryFn: () => portfoliosApi.getPortfolioHistory(portfolioId),
    });

    const dataP2 = await queryClient.fetchQuery({
      queryKey: ['portfolio-history', portfolioId2, {}],
      queryFn: () => portfoliosApi.getPortfolioHistory(portfolioId2),
    });

    expect(dataP1.data[0]!.id).toBe('p1-item');
    expect(dataP2.data[0]!.id).toBe('p2-item');
    expect(dataP1.data[0]!.id).not.toBe(dataP2.data[0]!.id);
  });

  it('renders mobile activity view model with canonical labels and touch-safe navigation', () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'COMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '50',
          currency: 'BRL',
          costBasisStatus: 'KNOWN',
          totalCost: { amount: '1500.00', currency: 'BRL' },
          averageCost: { amount: '30.00', currency: 'BRL' },
        },
      ],
      accounts: [],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'h-100',
        kind: 'TRANSFER',
        transactionId: 'tx-tr',
        tradeDate: '2026-09-18',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          type: 'TRANSFER_IN',
          status: 'UNMATCHED',
          quantity: '50',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId,
      historyItems,
      pagination: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 1 },
      portfolioState: mockState,
      accountsMeta: [{ id: accountId1, name: 'XP Investimentos' }],
      assetsMeta: [{ id: assetPetr4, ticker: 'PETR4' }],
    });

    expect(vm.groups).toHaveLength(1);
    const item = vm.groups[0]!.items[0]!;
    expect(item.kindLabel).toBe('Transferência de entrada');
    expect(item.statusBadgeLabel).toBe('Transferência incompleta');
    expect(item.badgeVariant).toBe('warning');
    expect(item.canNavigateToAsset).toBe(true);
  });
});
