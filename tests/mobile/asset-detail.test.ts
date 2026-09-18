import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';
import {
  mapToAssetPositionDetailViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
} from '@atlas/ui';

describe('Mobile Asset Position Detail: History Integration & ViewModel Safety (Phase 2B)', () => {
  const originalFetch = global.fetch;
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    clearQueryCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches, deserializes and caches asset history for mobile detail screen', async () => {
    const mockHistoryItem: PortfolioHistoryItemDto = {
      id: 'h-001',
      kind: 'REALIZED_DISPOSAL',
      transactionId: 'tx-001',
      tradeDate: '2026-03-01T10:00:00Z',
      accountId: accountId1,
      assetId: assetPetr4,
      cashImpact: { amount: '1500.00', currency: 'BRL' },
      disposalDetails: {
        disposedQuantity: '50',
        unitPrice: { amount: '30.00', currency: 'BRL' },
        proceeds: { amount: '1500.00', currency: 'BRL' },
        realizedGainLoss: { amount: '250.00', currency: 'BRL' },
        costBasisStatus: 'KNOWN',
      },
    };

    const mockResponse = {
      data: [mockHistoryItem],
      meta: {
        limit: 20,
        cursor: null,
        nextCursor: null,
        hasMore: false,
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
      queryKey: ['portfolio-history', portfolioId, assetPetr4],
      queryFn: () =>
        portfoliosApi.getPortfolioHistory(portfolioId, { assetId: assetPetr4, limit: 20 }),
    });

    expect(queryData.data).toHaveLength(1);
    expect(queryData.data[0].id).toBe('h-001');
    expect(queryData.data[0].kind).toBe('REALIZED_DISPOSAL');

    // Verify cached in TanStack Query
    const cached = queryClient.getQueryData<{ data: PortfolioHistoryItemDto[] }>([
      'portfolio-history',
      portfolioId,
      assetPetr4,
    ]);
    expect(cached?.data[0].id).toBe('h-001');
  });

  it('transforms mobile detail view model with audit-grade zero client math', () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'COMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '150',
          currency: 'BRL',
          costBasisStatus: 'KNOWN',
          totalCost: { amount: '3750.00', currency: 'BRL' },
          averageCost: { amount: '25.00', currency: 'BRL' },
        },
      ],
      accounts: [
        {
          accountId: accountId1,
          positions: [
            {
              assetId: assetPetr4,
              quantity: '150',
              currency: 'BRL',
              costBasisStatus: 'KNOWN',
              totalCost: { amount: '3750.00', currency: 'BRL' },
              averageCost: { amount: '25.00', currency: 'BRL' },
            },
          ],
        },
      ],
      realizedSummaries: [
        {
          assetId: assetPetr4,
          totalRealizedGainLoss: { amount: '250.00', currency: 'BRL' },
          totalProceeds: { amount: '1500.00', currency: 'BRL' },
          disposals: [
            {
              transactionId: 'tx-001',
              tradeDate: '2026-03-01T10:00:00Z',
              accountId: accountId1,
              disposedQuantity: '50',
              unitPrice: { amount: '30.00', currency: 'BRL' },
              proceeds: { amount: '1500.00', currency: 'BRL' },
              realizedGainLoss: { amount: '250.00', currency: 'BRL' },
              costBasisStatus: 'KNOWN',
            },
          ],
        },
      ],
      incomeSummaries: [],
      cashFlowSummaries: [],
      replayMetadata: {
        engineVersion: '1.0.0-rc.1',
        asOfDate: null,
        processedTransactionCount: 2,
        appliedTransactionCount: 2,
        deferredTransactionCount: 0,
        hasIncompleteCostBasis: false,
      },
    };

    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'disp_tx1',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx1',
        tradeDate: '2026-02-01',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          quantity: '50',
          grossProceeds: { amount: '1500.00', currency: 'BRL' },
          sellingCosts: { amount: '0.00', currency: 'BRL' },
          netProceeds: { amount: '1500.00', currency: 'BRL' },
          costBasisRemoved: { amount: '1250.00', currency: 'BRL' },
          realizedGainLoss: { amount: '250.00', currency: 'BRL' },
          realizedReturnPercentage: '20.00',
          status: 'KNOWN',
        },
      },
    ];

    const vm = mapToAssetPositionDetailViewModel({
      assetId: assetPetr4,
      state: mockState,
      historyItems,
      assetMeta: { id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN', type: 'EQUITY' },
      portfolioMeta: {
        id: portfolioId,
        name: 'Carteira Mobile',
        type: 'PERSONAL',
        baseCurrency: 'BRL',
      },
      accountsMeta: [{ id: accountId1, name: 'XP Investimentos' }],
    });

    expect(vm.header.ticker).toBe('PETR4');
    expect(vm.header.name).toBe('Petrobras PN');
    expect(vm.header.assetClassLabel).toBe('Ações');
    expect(vm.primaryCard.quantity).toBe('150');
    expect(vm.primaryCard.averageCost).toBe('R$ 25,00');
    expect(vm.primaryCard.totalCost).toBe('R$ 3.750,00');
    expect(vm.accountsBreakdown[0].accountName).toBe('XP Investimentos');
    expect(vm.accountsBreakdown[0].quantity).toBe('150');
    expect(vm.realizedResults.hasRealizedDisposals).toBe(true);
    expect(vm.realizedResults.disposals[0].netProceeds).toBe('R$ 1.500,00');
    expect(vm.realizedResults.disposals[0].realizedGainLoss).toBe('R$ 250,00');
    expect(vm.realizedResults.disposals[0].isPositive).toBe(true);
  });

  it('renders em-dash for incomplete cost basis and clears history cache on logout', () => {
    const incompleteState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'INCOMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '100',
          currency: 'BRL',
          costBasisStatus: 'INCOMPLETE',
          totalCost: null,
          averageCost: null,
        },
      ],
      accounts: [],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const vm = mapToAssetPositionDetailViewModel({
      assetId: assetPetr4,
      state: incompleteState,
      assetMeta: { id: assetPetr4, ticker: 'PETR4' },
      portfolioMeta: null,
      accountsMeta: [],
    });

    expect(vm.header.isCostBasisIncomplete).toBe(true);
    expect(vm.header.completenessBadgeLabel).toBe('Dados de custo incompletos');
    expect(vm.primaryCard.averageCost).toBe('—');
    expect(vm.primaryCard.totalCost).toBe('—');

    // Cache clearing check
    queryClient.setQueryData(['portfolio-history', portfolioId, assetPetr4], { data: [] });
    expect(queryClient.getQueryData(['portfolio-history', portfolioId, assetPetr4])).toBeDefined();

    clearQueryCache();
    expect(
      queryClient.getQueryData(['portfolio-history', portfolioId, assetPetr4]),
    ).toBeUndefined();
  });
});
