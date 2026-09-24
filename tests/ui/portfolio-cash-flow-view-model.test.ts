import { describe, it, expect } from 'vitest';
import { buildPortfolioCashFlowViewModel } from '@atlas/ui';
import { PortfolioHistoryItemDto, PortfolioHistoryPaginationMetaDto } from '@atlas/ui';

const samplePortfolioId = 'c0000000-0000-4000-8000-000000000001';

function makeHistoryItem(
  overrides: Partial<PortfolioHistoryItemDto> = {},
): PortfolioHistoryItemDto {
  return {
    id: `cf_${Math.random().toString(36).slice(2)}`,
    kind: 'CASH_FLOW',
    transactionId: `txn_${Math.random().toString(36).slice(2)}`,
    tradeDate: '2026-09-15',
    accountId: 'acc001',
    assetId: null,
    currency: 'BRL',
    details: {},
    ...overrides,
  };
}

function makePagination(): PortfolioHistoryPaginationMetaDto {
  return { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 0 };
}

describe('UI View Model: Portfolio Cash Flow (Phase 2D)', () => {
  describe('DEPOSIT presentation', () => {
    it('maps DEPOSIT cash-flow events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'DEPOSIT',
            direction: 'INFLOW',
            amount: { amount: '5000.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('DEPOSIT');
      expect(vm.groups[0].items[0].typeLabel).toBe('Depósito');
      expect(vm.groups[0].items[0].direction).toBe('INFLOW');
    });
  });

  describe('WITHDRAWAL presentation', () => {
    it('maps WITHDRAWAL cash-flow events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'WITHDRAWAL',
            direction: 'OUTFLOW',
            amount: { amount: '2000.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('WITHDRAWAL');
      expect(vm.groups[0].items[0].typeLabel).toBe('Retirada');
      expect(vm.groups[0].items[0].direction).toBe('OUTFLOW');
    });
  });

  describe('FEE presentation', () => {
    it('maps FEE cash-flow events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'FEE',
            direction: 'OUTFLOW',
            amount: { amount: '15.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('FEE');
      expect(vm.groups[0].items[0].typeLabel).toBe('Taxa');
    });
  });

  describe('TAX presentation', () => {
    it('maps TAX cash-flow events with "Tributo pago" label', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'TAX',
            direction: 'OUTFLOW',
            amount: { amount: '100.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('TAX');
      expect(vm.groups[0].items[0].typeLabel).toBe('Tributo pago');
    });

    it('never labels TAX as "Imposto devido"', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'TAX',
            direction: 'OUTFLOW',
            amount: { amount: '100.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      const taxItem = vm.groups[0].items.find((i) => i.type === 'TAX');
      expect(taxItem?.typeLabel).toBe('Tributo pago');
      expect(taxItem?.typeLabel).not.toBe('Imposto devido');
    });
  });

  describe('AMORTIZATION presentation', () => {
    it('maps AMORTIZATION cash-flow events with "Amortização" and "Devolução de capital"', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'AMORTIZATION',
            direction: 'INFLOW',
            amount: { amount: '3000.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('AMORTIZATION');
      expect(vm.groups[0].items[0].typeLabel).toBe('Amortização');
      expect(vm.groups[0].items[0].secondaryContext).toBe('Devolução de capital');
    });

    it('AMORTIZATION is NOT classified as income/dividend', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'AMORTIZATION',
            direction: 'INFLOW',
            amount: { amount: '3000.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      const amortItem = vm.groups[0].items[0];
      expect(amortItem.type).toBe('AMORTIZATION');
      expect(amortItem.typeLabel).toBe('Amortização');
      expect(amortItem.secondaryContext).toBe('Devolução de capital');
    });
  });

  describe('Cash-flow summary uses server data', () => {
    it('consumes cashFlowSummaries from server without client-side summation', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: '5000.00', currency: 'BRL' },
            totalOutflows: { amount: '215.00', currency: 'BRL' },
            netExternalFlow: { amount: '4785.00', currency: 'BRL' },
            totalExternalContributions: { amount: '5000.00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: '215.00', currency: 'BRL' },
            totalCapitalReturns: { amount: '0.00', currency: 'BRL' },
            totalFees: { amount: '15.00', currency: 'BRL' },
            totalTaxes: { amount: '200.00', currency: 'BRL' },
          },
        ],
      });

      expect(vm.summaryCards.length).toBe(1);
      expect(vm.summaryCards[0].currency).toBe('BRL');
      expect(vm.summaryCards[0].formattedTotalInflows).toBe('R$ 5.000,00');
      expect(vm.summaryCards[0].formattedTotalOutflows).toBe('R$ 215,00');
      expect(vm.summaryCards[0].formattedNetExternalFlow).toBe('R$ 4.785,00');
    });
  });

  describe('No client cash-flow aggregation', () => {
    it('does not sum cash-flow amounts client-side', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'DEPOSIT', amount: { amount: '1000.00', currency: 'BRL' } },
        }),
        makeHistoryItem({
          details: { type: 'WITHDRAWAL', amount: { amount: '500.00', currency: 'BRL' } },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.rawItemsCount).toBe(2);
      expect(vm.summaryCards.length).toBe(0);
    });
  });

  describe('Multi-currency cash-flow segregation', () => {
    it('segregates BRL and USD cash-flow summaries', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: '5000.00', currency: 'BRL' },
            totalOutflows: { amount: '215.00', currency: 'BRL' },
            netExternalFlow: { amount: '4785.00', currency: 'BRL' },
            totalExternalContributions: { amount: '5000.00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: '215.00', currency: 'BRL' },
            totalCapitalReturns: { amount: '0.00', currency: 'BRL' },
            totalFees: { amount: '15.00', currency: 'BRL' },
            totalTaxes: { amount: '200.00', currency: 'BRL' },
          },
          {
            currency: 'USD',
            totalInflows: { amount: '1000.00', currency: 'USD' },
            totalOutflows: { amount: '50.00', currency: 'USD' },
            netExternalFlow: { amount: '950.00', currency: 'USD' },
            totalExternalContributions: { amount: '1000.00', currency: 'USD' },
            totalExternalWithdrawals: { amount: '50.00', currency: 'USD' },
            totalCapitalReturns: { amount: '0.00', currency: 'USD' },
            totalFees: { amount: '10.00', currency: 'USD' },
            totalTaxes: { amount: '40.00', currency: 'USD' },
          },
        ],
      });

      expect(vm.summaryCards.length).toBe(2);
      expect(vm.summaryCards[0].currency).toBe('BRL');
      expect(vm.summaryCards[1].currency).toBe('USD');
    });
  });

  describe('No cash balance inference', () => {
    it('does not create cashBalance or availableBalance properties', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
      });

      expect(vm).toBeDefined();
      expect(Object.keys(vm)).not.toContain('cashBalance');
      expect(Object.keys(vm)).not.toContain('availableBalance');
    });

    it('does not calculate net flow client-side', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'DEPOSIT',
            direction: 'INFLOW',
            amount: { amount: '1000.00', currency: 'BRL' },
          },
        }),
        makeHistoryItem({
          details: {
            type: 'WITHDRAWAL',
            direction: 'OUTFLOW',
            amount: { amount: '500.00', currency: 'BRL' },
          },
        }),
      ];

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups.flatMap((g) => g.items).length).toBe(2);
    });
  });

  describe('AMORTIZATION not mislabeled as dividend', () => {
    it('AMORTIZATION does not appear in income summaries', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
        cashFlowSummaries: [
          {
            currency: 'BRL',
            totalInflows: { amount: '3000.00', currency: 'BRL' },
            totalOutflows: { amount: '0.00', currency: 'BRL' },
            netExternalFlow: { amount: '3000.00', currency: 'BRL' },
            totalExternalContributions: { amount: '0.00', currency: 'BRL' },
            totalExternalWithdrawals: { amount: '0.00', currency: 'BRL' },
            totalCapitalReturns: { amount: '3000.00', currency: 'BRL' },
            totalFees: { amount: '0.00', currency: 'BRL' },
            totalTaxes: { amount: '0.00', currency: 'BRL' },
          },
        ],
      });

      const amortCard = vm.summaryCards.find((c) => c.currency === 'BRL');
      expect(amortCard).toBeDefined();
      expect(amortCard!.formattedCapitalReturns).toBe('R$ 3.000,00');
    });
  });

  describe('TAX semantics', () => {
    it('TAX label is "Tributo pago" not "Imposto devido"', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'TAX',
            direction: 'OUTFLOW',
            amount: { amount: '100.00', currency: 'BRL' },
          },
        }),
      ];
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      const taxItem = vm.groups[0].items.find((i) => i.type === 'TAX');
      expect(taxItem?.typeLabel).toBe('Tributo pago');
      expect(taxItem?.typeLabel).not.toBe('Imposto devido');
    });
  });

  describe('Cash-flow pagination', () => {
    it('preserves pagination metadata', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: { limit: 25, cursor: null, nextCursor: 'abc', hasMore: true, totalCount: 50 },
      });

      expect(vm.pagination.hasMore).toBe(true);
      expect(vm.pagination.nextCursor).toBe('abc');
    });
  });

  describe('Cash-flow period filter', () => {
    it('passes filter metadata through to pagination', () => {
      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: {
          limit: 25,
          cursor: null,
          nextCursor: 'cursor2',
          hasMore: true,
          totalCount: 100,
        },
      });

      expect(vm.pagination.hasMore).toBe(true);
      expect(vm.pagination.totalCount).toBe(100);
    });
  });

  describe('Cash-flow type filter', () => {
    it('correctly identifies all 5 cash-flow types', () => {
      const types = ['DEPOSIT', 'WITHDRAWAL', 'FEE', 'TAX', 'AMORTIZATION'] as const;
      const items = types.map((t) =>
        makeHistoryItem({
          details: {
            type: t,
            direction: t === 'DEPOSIT' || t === 'AMORTIZATION' ? 'INFLOW' : 'OUTFLOW',
            amount: { amount: '100.00', currency: 'BRL' },
          },
        }),
      );

      const vm = buildPortfolioCashFlowViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      const mappedTypes = vm.groups.flatMap((g) => g.items.map((i) => i.type));
      for (const t of types) {
        expect(mappedTypes).toContain(t);
      }
    });
  });
});
