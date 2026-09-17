import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';
import { mapToPortfolioOverviewViewModel, PortfolioStateDto } from '@atlas/ui';

describe('Mobile Portfolio Overview: Replay State Integration & Cache Safety (Phase 2A)', () => {
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

  it('fetches, deserializes and caches portfolio state for active portfolio', async () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'COMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '200',
          currency: 'BRL',
          costBasisStatus: 'KNOWN',
          totalCost: { amount: '6000.00', currency: 'BRL' },
          averageCost: { amount: '30.00', currency: 'BRL' },
        },
      ],
      accounts: [
        {
          accountId: accountId1,
          positions: [
            {
              assetId: assetPetr4,
              quantity: '200',
              currency: 'BRL',
              costBasisStatus: 'KNOWN',
              totalCost: { amount: '6000.00', currency: 'BRL' },
              averageCost: { amount: '30.00', currency: 'BRL' },
            },
          ],
        },
      ],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
      replayMetadata: {
        engineVersion: '1.0.0-rc.1',
        asOfDate: null,
        processedTransactionCount: 1,
        appliedTransactionCount: 1,
        deferredTransactionCount: 0,
        hasIncompleteCostBasis: false,
      },
    };

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: mockState }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const queryData = await queryClient.fetchQuery({
      queryKey: ['portfolio-state', portfolioId],
      queryFn: () => portfoliosApi.getPortfolioState(portfolioId),
    });

    expect(queryData.data.portfolioId).toBe(portfolioId);
    expect(queryData.data.positions).toHaveLength(1);

    // Verify cached in TanStack Query
    const cached = queryClient.getQueryData<{ data: PortfolioStateDto }>([
      'portfolio-state',
      portfolioId,
    ]);
    expect(cached?.data.portfolioId).toBe(portfolioId);

    // ViewModel mapping for mobile display
    const vm = mapToPortfolioOverviewViewModel(
      queryData.data,
      { id: portfolioId, name: 'Carteira Mobile', type: 'PERSONAL', baseCurrency: 'BRL' },
      [{ id: accountId1, name: 'Nubank Custódia' }],
    );

    expect(vm.header.name).toBe('Carteira Mobile');
    expect(vm.header.openPositionsCount).toBe(1);
    expect(vm.positions[0].quantity).toBe('200');
    expect(vm.positions[0].averageCost).toBe('R$ 30,00');
    expect(vm.positions[0].totalCost).toBe('R$ 6.000,00');
    expect(vm.positions[0].accounts[0].accountName).toBe('Nubank Custódia');
  });

  it('Cross-User Cache Safety: clears portfolio state cache completely upon logout', () => {
    queryClient.setQueryData(['portfolio-state', portfolioId], {
      data: { portfolioId, positions: [] },
    });

    expect(queryClient.getQueryData(['portfolio-state', portfolioId])).toBeDefined();

    clearQueryCache();

    expect(queryClient.getQueryData(['portfolio-state', portfolioId])).toBeUndefined();
  });

  it('handles incomplete cost basis cleanly on mobile view model without throwing', () => {
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

    const vm = mapToPortfolioOverviewViewModel(incompleteState, null, null);
    expect(vm.completenessNotice.hasIncompletePositions).toBe(true);
    expect(vm.positions[0].averageCost).toBe('—');
    expect(vm.positions[0].totalCost).toBe('—');
  });
});
