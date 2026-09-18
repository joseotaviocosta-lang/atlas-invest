import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';
import {
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
} from '@atlas/ui';

describe('Web: Portfolio History & Activity Integration (Fase 2C)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const accountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

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

  const mockState: PortfolioStateDto = {
    portfolioId,
    asOfDate: null,
    completeness: { costBasis: 'COMPLETE', overall: 'COMPLETE' },
    positions: [
      {
        assetId: assetPetr4,
        ticker: 'PETR4',
        quantity: '200',
        currency: 'BRL',
        costBasisStatus: 'KNOWN',
        totalCost: { amount: '6000.00', currency: 'BRL' },
        averageCost: { amount: '30.00', currency: 'BRL' },
      },
      // VALE3 is closed (quantity 0)
      {
        assetId: assetVale3,
        ticker: 'VALE3',
        quantity: '0',
        currency: 'BRL',
        costBasisStatus: 'KNOWN',
        totalCost: null,
        averageCost: null,
      },
    ],
    accounts: [],
    realizedSummaries: [],
    incomeSummaries: [],
    cashFlowSummaries: [],
  };

  const accountsMeta = [
    { id: accountId1, name: 'XP Investimentos' },
    { id: accountId2, name: 'BTG Pactual' },
  ];

  const assetsMeta = [
    { id: assetPetr4, ticker: 'PETR4', name: 'Petróleo Brasileiro S.A.' },
    { id: assetVale3, ticker: 'VALE3', name: 'Vale S.A.' },
  ];

  it('renders chronological groups and maps activity events cleanly', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_101',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-101',
        tradeDate: '2026-09-18',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          quantity: '50',
          netProceeds: { amount: '1750.00', currency: 'BRL' },
          realizedGainLoss: { amount: '250.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
      {
        id: 'inc_102',
        kind: 'INCOME',
        transactionId: 'tx-102',
        tradeDate: '2026-09-18',
        accountId: accountId1,
        assetId: assetPetr4,
        currency: 'BRL',
        details: {
          type: 'DIVIDEND',
          amount: { amount: '120.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
      {
        id: 'cf_103',
        kind: 'CASH_FLOW',
        transactionId: 'tx-103',
        tradeDate: '2026-09-10',
        accountId: accountId2,
        assetId: null,
        currency: 'BRL',
        details: {
          type: 'DEPOSIT',
          direction: 'INFLOW',
          amount: { amount: '10000.00', currency: 'BRL' },
        },
      },
    ];

    const pagination: PortfolioHistoryPaginationMetaDto = {
      limit: 25,
      cursor: null,
      nextCursor: null,
      hasMore: false,
      totalCount: 3,
    };

    const vm = buildPortfolioActivityViewModel({
      portfolioId,
      portfolioName: 'Carteira Principal',
      historyItems,
      pagination,
      portfolioState: mockState,
      accountsMeta,
      assetsMeta,
    });

    expect(vm.groups).toHaveLength(2); // 2026-09-18 and 2026-09-10
    expect(vm.groups[0]!.date).toBe('2026-09-18');
    expect(vm.groups[0]!.items).toHaveLength(2);

    // Event 1: Sale of PETR4
    const item1 = vm.groups[0]!.items[0]!;
    expect(item1.kindLabel).toBe('Venda');
    expect(item1.amount).toBe('R$ 1.750,00');
    expect(item1.quantity).toBe('50');
    expect(item1.canNavigateToAsset).toBe(true); // Open position

    // Event 2: Dividend
    const item2 = vm.groups[0]!.items[1]!;
    expect(item2.kindLabel).toBe('Dividendo');
    expect(item2.amount).toBe('R$ 120,00');

    // Event 3: Deposit
    const item3 = vm.groups[1]!.items[0]!;
    expect(item3.kindLabel).toBe('Aporte');
    expect(item3.amount).toBe('R$ 10.000,00');
    expect(item3.accountName).toBe('BTG Pactual');
    expect(item3.canNavigateToAsset).toBe(false);
  });

  it('prevents navigation to closed asset positions (canNavigateToAsset is false)', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_vale_closed',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-vale',
        tradeDate: '2026-08-01',
        accountId: accountId1,
        assetId: assetVale3, // Position is closed in mockState (quantity = 0)
        currency: 'BRL',
        details: {
          quantity: '100',
          netProceeds: { amount: '5000.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId,
      historyItems,
      pagination: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 1 },
      portfolioState: mockState,
      accountsMeta,
      assetsMeta,
    });

    const item = vm.groups[0]!.items[0]!;
    expect(item.assetTicker).toBe('VALE3');
    expect(item.canNavigateToAsset).toBe(false); // Closed asset safety rule
  });

  it('preserves items on next-page pagination and handles empty results', () => {
    const emptyVm = buildPortfolioActivityViewModel({
      portfolioId,
      historyItems: [],
      pagination: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 0 },
      portfolioState: mockState,
      accountsMeta,
      assetsMeta,
    });

    expect(emptyVm.isEmpty).toBe(true);
    expect(emptyVm.groups).toHaveLength(0);
  });
});
