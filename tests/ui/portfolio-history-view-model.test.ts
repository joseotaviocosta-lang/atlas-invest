import { describe, it, expect } from 'vitest';
import {
  buildPortfolioActivityViewModel,
  formatCivilDateHeader,
  PORTFOLIO_HISTORY_KINDS,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  PortfolioStateDto,
} from '@atlas/ui';

describe('Portfolio Activity View Model (Fase 2C)', () => {
  const defaultPagination: PortfolioHistoryPaginationMetaDto = {
    limit: 20,
    cursor: null,
    nextCursor: 'cursor_123',
    hasMore: true,
    totalCount: 50,
  };

  const mockPortfolioState: PortfolioStateDto = {
    portfolioId: 'port-1',
    asOfDate: '2026-09-18',
    completeness: { costBasis: 'COMPLETE', overall: 'COMPLETE' },
    positions: [
      {
        assetId: 'asset-petr4',
        ticker: 'PETR4',
        quantity: '100',
        currency: 'BRL',
        costBasisStatus: 'KNOWN',
        totalCost: { amount: '2800.00', currency: 'BRL' },
        averageCost: { amount: '28.00', currency: 'BRL' },
      },
      {
        assetId: 'asset-closed',
        ticker: 'MGLU3',
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
    replayMetadata: {
      engineVersion: '1.0.0-rc.1',
      processedTransactionCount: 10,
      appliedTransactionCount: 10,
      deferredTransactionCount: 0,
      hasIncompleteCostBasis: false,
    },
  };

  const accountsMeta = [
    { id: 'acc-1', name: 'XP Investimentos' },
    { id: 'acc-2', name: 'BTG Pactual' },
  ];

  const assetsMeta = [
    { id: 'asset-petr4', ticker: 'PETR4', name: 'Petróleo Brasileiro S.A.', currency: 'BRL' },
    { id: 'asset-closed', ticker: 'MGLU3', name: 'Magazine Luiza S.A.', currency: 'BRL' },
    { id: 'asset-hglg', ticker: 'HGLG11', name: 'CSHG Logística FII', currency: 'BRL' },
  ];

  it('formats civil date headers into Portuguese prose accurately', () => {
    expect(formatCivilDateHeader('2026-09-18')).toBe('18 de setembro de 2026');
    expect(formatCivilDateHeader('2026-01-05')).toBe('5 de janeiro de 2026');
    expect(formatCivilDateHeader('invalid')).toBe('—');
  });

  it('maps REALIZED_DISPOSAL with canonical labels, proceeds, and gain/loss variant', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_1',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-1',
        tradeDate: '2026-09-18',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          quantity: '50',
          grossProceeds: { amount: '1500.00', currency: 'BRL' },
          sellingCosts: { amount: '10.00', currency: 'BRL' },
          netProceeds: { amount: '1490.00', currency: 'BRL' },
          costBasisRemoved: { amount: '1400.00', currency: 'BRL' },
          realizedGainLoss: { amount: '90.00', currency: 'BRL' },
          realizedReturnPercentage: '6.43',
          status: 'KNOWN',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    expect(vm.groups).toHaveLength(1);
    const item = vm.groups[0]!.items[0]!;
    expect(item.kindLabel).toBe('Venda');
    expect(item.accountName).toBe('XP Investimentos');
    expect(item.assetTicker).toBe('PETR4');
    expect(item.quantity).toBe('50');
    expect(item.amount).toBe('R$ 1.490,00');
    expect(item.badgeVariant).toBe('positive');
    expect(item.statusBadgeLabel).toBeNull();
    expect(item.canNavigateToAsset).toBe(true); // PETR4 has quantity: 100 in open positions
  });

  it('handles REALIZED_DISPOSAL with negative gain/loss and incomplete cost basis safely', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_2',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-2',
        tradeDate: '2026-09-18',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          quantity: '20',
          netProceeds: { amount: '500.00', currency: 'BRL' },
          realizedGainLoss: { amount: '-50.00', currency: 'BRL' },
          status: 'INCOMPLETE',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const item = vm.groups[0]!.items[0]!;
    expect(item.badgeVariant).toBe('negative');
    expect(item.statusBadgeLabel).toBe('Custo incompleto');
    expect(item.isCostBasisIncomplete).toBe(true);
  });

  it('maps INCOME kinds (DIVIDEND, JCP, FII_INCOME) with canonical Portuguese labels', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'inc_1',
        kind: 'INCOME',
        transactionId: 'tx-div',
        tradeDate: '2026-09-17',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'DIVIDEND',
          amount: { amount: '120.50', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
      {
        id: 'inc_2',
        kind: 'INCOME',
        transactionId: 'tx-jcp',
        tradeDate: '2026-09-17',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'JCP',
          amount: { amount: '80.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
      {
        id: 'inc_3',
        kind: 'INCOME',
        transactionId: 'tx-fii',
        tradeDate: '2026-09-17',
        accountId: 'acc-2',
        assetId: 'asset-hglg',
        currency: 'BRL',
        details: {
          type: 'FII_INCOME',
          amount: { amount: '250.00', currency: 'BRL' },
          status: 'KNOWN',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.kindLabel).toBe('Dividendo');
    expect(items[0]!.amount).toBe('R$ 120,50');
    expect(items[1]!.kindLabel).toBe('JCP');
    expect(items[1]!.amount).toBe('R$ 80,00');
    expect(items[2]!.kindLabel).toBe('Rendimento de FII');
    expect(items[2]!.amount).toBe('R$ 250,00');
  });

  it('maps CASH_FLOW kinds (DEPOSIT, WITHDRAWAL, FEE, TAX, AMORTIZATION) with canonical labels', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'cf_dep',
        kind: 'CASH_FLOW',
        transactionId: 'tx-dep',
        tradeDate: '2026-09-16',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: {
          type: 'DEPOSIT',
          direction: 'INFLOW',
          amount: { amount: '5000.00', currency: 'BRL' },
        },
      },
      {
        id: 'cf_with',
        kind: 'CASH_FLOW',
        transactionId: 'tx-with',
        tradeDate: '2026-09-16',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: {
          type: 'WITHDRAWAL',
          direction: 'OUTFLOW',
          amount: { amount: '1000.00', currency: 'BRL' },
        },
      },
      {
        id: 'cf_fee',
        kind: 'CASH_FLOW',
        transactionId: 'tx-fee',
        tradeDate: '2026-09-16',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: {
          type: 'FEE',
          direction: 'OUTFLOW',
          amount: { amount: '15.90', currency: 'BRL' },
        },
      },
      {
        id: 'cf_tax',
        kind: 'CASH_FLOW',
        transactionId: 'tx-tax',
        tradeDate: '2026-09-16',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: {
          type: 'TAX',
          direction: 'OUTFLOW',
          amount: { amount: '45.00', currency: 'BRL' },
        },
      },
      {
        id: 'cf_amort',
        kind: 'CASH_FLOW',
        transactionId: 'tx-amort',
        tradeDate: '2026-09-16',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'AMORTIZATION',
          direction: 'INFLOW',
          amount: { amount: '300.00', currency: 'BRL' },
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.kindLabel).toBe('Depósito');
    expect(items[0]!.badgeVariant).toBe('positive');

    expect(items[1]!.kindLabel).toBe('Retirada');
    expect(items[1]!.badgeVariant).toBe('negative');

    expect(items[2]!.kindLabel).toBe('Taxa');
    expect(items[2]!.badgeVariant).toBe('neutral');

    // Canonical check: TAX must be "Tributo pago", never "Imposto devido"
    expect(items[3]!.kindLabel).toBe('Tributo pago');
    expect(items[3]!.kindLabel).not.toContain('devido');

    // Amortization check
    expect(items[4]!.kindLabel).toBe('Amortização');
    expect(items[4]!.secondaryContext).toBe('Devolução de capital');
  });

  it('maps CORPORATE_ACTION events (SPLIT, REVERSE_SPLIT, BONUS, SUBSCRIPTION)', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'ca_split',
        kind: 'CORPORATE_ACTION',
        transactionId: 'tx-split',
        tradeDate: '2026-09-15',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'SPLIT',
          beforeQuantity: '100',
          afterQuantity: '200',
        },
      },
      {
        id: 'ca_sub',
        kind: 'CORPORATE_ACTION',
        transactionId: 'tx-sub',
        tradeDate: '2026-09-15',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'SUBSCRIPTION',
          beforeQuantity: '200',
          afterQuantity: '250',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.kindLabel).toBe('Desdobramento');
    expect(items[0]!.quantity).toBe('200');

    // Subscription is distinct from standard BUY
    expect(items[1]!.kindLabel).toBe('Subscrição');
    expect(items[1]!.kindLabel).not.toBe('Compra');
  });

  it('maps TRANSFER events with counterparty and UNMATCHED status warning badge', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'tr_in',
        kind: 'TRANSFER',
        transactionId: 'tx-tr-1',
        tradeDate: '2026-09-14',
        accountId: 'acc-2',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'TRANSFER_IN',
          status: 'MATCHED',
          counterpartyAccountId: 'acc-1',
          quantity: '50',
        },
      },
      {
        id: 'tr_unmatched',
        kind: 'TRANSFER',
        transactionId: 'tx-tr-2',
        tradeDate: '2026-09-14',
        accountId: 'acc-1',
        assetId: 'asset-petr4',
        currency: 'BRL',
        details: {
          type: 'TRANSFER_OUT',
          status: 'UNMATCHED',
          quantity: '30',
        },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.kindLabel).toBe('Transferência de entrada');
    expect(items[0]!.secondaryContext).toBe('De: XP Investimentos');

    expect(items[1]!.kindLabel).toBe('Transferência de saída');
    expect(items[1]!.statusBadgeLabel).toBe('Transferência incompleta');
    expect(items[1]!.badgeVariant).toBe('warning');
  });

  it('guarantees closed-position navigation safety (canNavigateToAsset)', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'rd_open',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-open',
        tradeDate: '2026-09-13',
        accountId: 'acc-1',
        assetId: 'asset-petr4', // Open position in state (quantity: 100)
        currency: 'BRL',
        details: {},
      },
      {
        id: 'rd_closed',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-closed',
        tradeDate: '2026-09-13',
        accountId: 'acc-1',
        assetId: 'asset-closed', // Closed position in state (quantity: 0)
        currency: 'BRL',
        details: {},
      },
      {
        id: 'rd_unknown',
        kind: 'REALIZED_DISPOSAL',
        transactionId: 'tx-unknown',
        tradeDate: '2026-09-13',
        accountId: 'acc-1',
        assetId: 'asset-never-in-state', // Not in state
        currency: 'BRL',
        details: {},
      },
      {
        id: 'cf_no_asset',
        kind: 'CASH_FLOW',
        transactionId: 'tx-no-asset',
        tradeDate: '2026-09-13',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: { type: 'DEPOSIT' },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.canNavigateToAsset).toBe(true);
    expect(items[1]!.canNavigateToAsset).toBe(false);
    expect(items[2]!.canNavigateToAsset).toBe(false);
    expect(items[3]!.canNavigateToAsset).toBe(false);
  });

  it('preserves multi-currency without aggregation or cross-currency calculation', () => {
    const historyItems: PortfolioHistoryItemDto[] = [
      {
        id: 'cf_brl',
        kind: 'CASH_FLOW',
        transactionId: 'tx-brl',
        tradeDate: '2026-09-12',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: { type: 'DEPOSIT', amount: { amount: '1000.00', currency: 'BRL' } },
      },
      {
        id: 'cf_usd',
        kind: 'CASH_FLOW',
        transactionId: 'tx-usd',
        tradeDate: '2026-09-12',
        accountId: 'acc-2',
        assetId: null,
        currency: 'USD',
        details: { type: 'DEPOSIT', amount: { amount: '500.00', currency: 'USD' } },
      },
    ];

    const vm = buildPortfolioActivityViewModel({
      portfolioId: 'port-1',
      historyItems,
      pagination: defaultPagination,
      portfolioState: mockPortfolioState,
      accountsMeta,
      assetsMeta,
    });

    const items = vm.groups[0]!.items;
    expect(items[0]!.amount).toBe('R$ 1.000,00');
    expect(items[0]!.currency).toBe('BRL');
    expect(items[1]!.amount).toBe('USD 500,00');
    expect(items[1]!.currency).toBe('USD');
  });

  describe('Hotfix 2C.1 Contract Audit & History Semantics Hardening', () => {
    it('guarantees PORTFOLIO_HISTORY_KINDS matches exactly the 5 frozen API read model kinds', () => {
      const expectedFrozenApiKinds = [
        'REALIZED_DISPOSAL',
        'INCOME',
        'CASH_FLOW',
        'CORPORATE_ACTION',
        'TRANSFER',
      ];
      expect([...PORTFOLIO_HISTORY_KINDS].sort()).toEqual(expectedFrozenApiKinds.sort());
      expect(PORTFOLIO_HISTORY_KINDS).toHaveLength(5);
    });

    it('guarantees NO invented client history kinds exist in the kind catalog', () => {
      const prohibitedKinds = ['SPIN_OFF', 'MERGER', 'INTEREST', 'BONUS_SHARES', 'BUY'];
      for (const prohibited of prohibitedKinds) {
        expect(PORTFOLIO_HISTORY_KINDS).not.toContain(prohibited);
      }
    });

    it('enforces exhaustiveness and throws at runtime when an uncataloged kind is encountered (no silent fallback)', () => {
      const invalidItem = {
        id: 'inv_1',
        kind: 'INVENTED_KIND' as unknown as PortfolioHistoryItemDto['kind'],
        transactionId: 'tx-inv',
        tradeDate: '2026-09-18',
        accountId: 'acc-1',
        assetId: null,
        currency: 'BRL',
        details: {},
      };

      expect(() =>
        buildPortfolioActivityViewModel({
          portfolioId: 'port-1',
          historyItems: [invalidItem],
          pagination: defaultPagination,
          portfolioState: mockPortfolioState,
        }),
      ).toThrowError(/Unhandled portfolio history event kind/);
    });

    it('verifies explicit presentation mappings for all exposed corporate actions and cash flows', () => {
      const historyItems: PortfolioHistoryItemDto[] = [
        {
          id: 'ca_bonus',
          kind: 'CORPORATE_ACTION',
          transactionId: 'tx-bonus',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { type: 'BONUS', beforeQuantity: '100', afterQuantity: '110' },
        },
        {
          id: 'ca_reverse_split',
          kind: 'CORPORATE_ACTION',
          transactionId: 'tx-rs',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { type: 'REVERSE_SPLIT', beforeQuantity: '100', afterQuantity: '10' },
        },
        {
          id: 'ca_amort',
          kind: 'CORPORATE_ACTION',
          transactionId: 'tx-amort-ca',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { type: 'AMORTIZATION', beforeQuantity: '100', afterQuantity: '100' },
        },
      ];

      const vm = buildPortfolioActivityViewModel({
        portfolioId: 'port-1',
        historyItems,
        pagination: defaultPagination,
        portfolioState: mockPortfolioState,
        accountsMeta,
        assetsMeta,
      });

      const items = vm.groups[0]!.items;
      // BONUS
      expect(items[0]!.kindLabel).toBe('Bonificação');
      expect(items[0]!.quantity).toBe('110');

      // REVERSE_SPLIT
      expect(items[1]!.kindLabel).toBe('Grupamento');
      expect(items[1]!.quantity).toBe('10');

      // AMORTIZATION
      expect(items[2]!.kindLabel).toBe('Amortização');
      expect(items[2]!.secondaryContext).toBe('Devolução de capital');
    });

    it('verifies strict semantic labels: TAX is "Tributo pago" (never "Imposto devido"), SUBSCRIPTION is distinct from BUY, SELL is "Venda"', () => {
      const historyItems: PortfolioHistoryItemDto[] = [
        {
          id: 'rd_sell',
          kind: 'REALIZED_DISPOSAL',
          transactionId: 'tx-sell',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { quantity: '10', netProceeds: { amount: '300.00', currency: 'BRL' } },
        },
        {
          id: 'ca_sub',
          kind: 'CORPORATE_ACTION',
          transactionId: 'tx-sub',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { type: 'SUBSCRIPTION', afterQuantity: '150' },
        },
        {
          id: 'cf_tax',
          kind: 'CASH_FLOW',
          transactionId: 'tx-tax',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: null,
          currency: 'BRL',
          details: { type: 'TAX', amount: { amount: '12.50', currency: 'BRL' } },
        },
        {
          id: 'tr_out',
          kind: 'TRANSFER',
          transactionId: 'tx-tr-out',
          tradeDate: '2026-09-18',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          currency: 'BRL',
          details: { type: 'TRANSFER_OUT', quantity: '25' },
        },
      ];

      const vm = buildPortfolioActivityViewModel({
        portfolioId: 'port-1',
        historyItems,
        pagination: defaultPagination,
        portfolioState: mockPortfolioState,
        accountsMeta,
        assetsMeta,
      });

      const items = vm.groups[0]!.items;
      // SELL: must be "Venda" and not "Provento" or "Rendimento"
      expect(items[0]!.kindLabel).toBe('Venda');
      expect(items[0]!.kindLabel).not.toMatch(/provento|rendimento/i);

      // SUBSCRIPTION: must be "Subscrição" and not "Compra"
      expect(items[1]!.kindLabel).toBe('Subscrição');
      expect(items[1]!.kindLabel).not.toBe('Compra');

      // TAX: must be "Tributo pago" and NEVER contain "devido"
      expect(items[2]!.kindLabel).toBe('Tributo pago');
      expect(items[2]!.kindLabel).not.toContain('devido');

      // TRANSFER: must be "Transferência de saída" and not external flow
      expect(items[3]!.kindLabel).toBe('Transferência de saída');
      expect(items[3]!.kindLabel).not.toMatch(/aporte|retirada/i);
    });
  });
});
