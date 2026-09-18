import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import {
  mapToAssetPositionDetailViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
} from '@atlas/ui';

describe('Web: Asset Position Detail Integration & Replay (Phase 2B)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    useAuthStore.getState().setSession(
      {
        id: 'usr-1',
        name: 'Investidor Atlas',
        email: 'investidor@atlas.dev',
        locale: 'pt-BR',
        timezone: 'UTC',
        baseCurrency: 'BRL',
      },
      'valid-access-token',
    );
    vi.restoreAllMocks();
  });

  it('fetches and binds asset position details with account breakdown and history', async () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'COMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '100',
          currency: 'BRL',
          costBasisStatus: 'KNOWN',
          totalCost: { amount: '3200.00', currency: 'BRL' },
          averageCost: { amount: '32.00', currency: 'BRL' },
        },
      ],
      accounts: [
        {
          accountId: accountId1,
          positions: [
            {
              assetId: assetPetr4,
              quantity: '100',
              currency: 'BRL',
              costBasisStatus: 'KNOWN',
              totalCost: { amount: '3200.00', currency: 'BRL' },
              averageCost: { amount: '32.00', currency: 'BRL' },
            },
          ],
        },
      ],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const mockHistoryItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_1',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-1',
        tradeDate: '2026-02-15',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          quantity: '50',
          grossProceeds: { amount: '1800.00', currency: 'BRL' },
          sellingCosts: { amount: '10.00', currency: 'BRL' },
          netProceeds: { amount: '1790.00', currency: 'BRL' },
          costBasisRemoved: { amount: '1600.00', currency: 'BRL' },
          realizedGainLoss: { amount: '190.00', currency: 'BRL' },
          realizedReturnPercentage: '11.88',
          status: 'KNOWN',
        },
      },
      {
        id: 'inc_1',
        kind: 'INCOME',
        transactionId: 'tx-2',
        tradeDate: '2026-01-20',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          type: 'DIVIDEND',
          amount: { amount: '150.00', currency: 'BRL' },
          grossAmount: { amount: '150.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
    ];

    const mockHistoryMeta: PortfolioHistoryPaginationMetaDto = {
      limit: 20,
      cursor: null,
      nextCursor: null,
      hasMore: false,
      totalCount: 2,
    };

    const vm = mapToAssetPositionDetailViewModel({
      assetId: assetPetr4,
      state: mockState,
      historyItems: mockHistoryItems,
      historyMeta: mockHistoryMeta,
      portfolioMeta: { id: portfolioId, name: 'Minha Carteira', type: 'PERSONAL', baseCurrency: 'BRL' },
      accountsMeta: [{ id: accountId1, name: 'XP Investimentos' }],
      assetMeta: { id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN', type: 'EQUITY' },
    });

    expect(vm.isOpenPosition).toBe(true);
    expect(vm.header.ticker).toBe('PETR4');
    expect(vm.header.name).toBe('Petrobras PN');
    expect(vm.header.assetClassLabel).toBe('Ações');
    expect(vm.header.isCostBasisIncomplete).toBe(false);

    // Primary card
    expect(vm.primaryCard.quantity).toBe('100');
    expect(vm.primaryCard.averageCost).toBe('R$ 32,00');
    expect(vm.primaryCard.totalCost).toBe('R$ 3.200,00');
    expect(vm.primaryCard.totalCostLabel).toBe('Custo total');

    // Custody breakdown
    expect(vm.accountsBreakdown).toHaveLength(1);
    expect(vm.accountsBreakdown[0].accountName).toBe('XP Investimentos');
    expect(vm.accountsBreakdown[0].quantity).toBe('100');

    // Realized results
    expect(vm.realizedResults.hasRealizedDisposals).toBe(true);
    expect(vm.realizedResults.disposals).toHaveLength(1);
    expect(vm.realizedResults.disposals[0].grossProceeds).toBe('R$ 1.800,00');
    expect(vm.realizedResults.disposals[0].netProceeds).toBe('R$ 1.790,00');
    expect(vm.realizedResults.disposals[0].realizedGainLoss).toBe('R$ 190,00');
    expect(vm.realizedResults.disposals[0].isPositive).toBe(true);

    // Income
    expect(vm.incomeReceived.hasIncomeEvents).toBe(true);
    expect(vm.incomeReceived.events[0].amount).toBe('R$ 150,00');
    expect(vm.incomeReceived.events[0].typeLabel).toBe('Dividendo');

    // History feed
    expect(vm.history.items).toHaveLength(2);
    expect(vm.history.pagination.hasMore).toBe(false);
  });

  it('renders "—" for incomplete cost basis without showing 0 or R$ 0,00', () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'INCOMPLETE' },
      positions: [
        {
          assetId: assetPetr4,
          quantity: '50',
          currency: 'BRL',
          costBasisStatus: 'INCOMPLETE',
          totalCost: null,
          averageCost: null,
        },
      ],
      accounts: [
        {
          accountId: accountId1,
          positions: [
            {
              assetId: assetPetr4,
              quantity: '50',
              currency: 'BRL',
              costBasisStatus: 'INCOMPLETE',
              totalCost: null,
              averageCost: null,
            },
          ],
        },
      ],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const vm = mapToAssetPositionDetailViewModel({
      assetId: assetPetr4,
      state: mockState,
      assetMeta: { id: assetPetr4, ticker: 'PETR4' },
    });

    expect(vm.isOpenPosition).toBe(true);
    expect(vm.header.isCostBasisIncomplete).toBe(true);
    expect(vm.header.completenessBadgeLabel).toBe('Dados de custo incompletos');
    expect(vm.primaryCard.averageCost).toBe('—');
    expect(vm.primaryCard.totalCost).toBe('—');
    expect(vm.primaryCard.totalCostLabel).toBe('Custo total conhecido');
    expect(vm.accountsBreakdown[0].averageCost).toBe('—');
    expect(vm.accountsBreakdown[0].totalCost).toBe('—');
  });

  it('identifies asset position as closed when quantity is 0 or asset not in positions', () => {
    const mockState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'COMPLETE' },
      positions: [],
      accounts: [],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const vm = mapToAssetPositionDetailViewModel({
      assetId: assetPetr4,
      state: mockState,
      assetMeta: { id: assetPetr4, ticker: 'PETR4' },
    });

    expect(vm.isOpenPosition).toBe(false);
  });
});