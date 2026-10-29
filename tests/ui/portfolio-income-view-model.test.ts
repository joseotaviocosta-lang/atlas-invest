import { describe, it, expect } from 'vitest';
import { buildPortfolioIncomeViewModel } from '@atlas/ui';
import { PortfolioHistoryItemDto, PortfolioHistoryPaginationMetaDto } from '@atlas/ui';

const samplePortfolioId = 'c0000000-0000-4000-8000-000000000001';
const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

function makeHistoryItem(
  overrides: Partial<PortfolioHistoryItemDto> = {},
): PortfolioHistoryItemDto {
  return {
    id: `inc_${Math.random().toString(36).slice(2)}`,
    kind: 'INCOME',
    transactionId: `txn_${Math.random().toString(36).slice(2)}`,
    tradeDate: '2026-09-15',
    accountId: 'acc001',
    assetId: assetPetr4,
    currency: 'BRL',
    details: {},
    ...overrides,
  };
}

function makePagination(): PortfolioHistoryPaginationMetaDto {
  return { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 0 };
}

describe('UI View Model: Portfolio Income (Phase 2D)', () => {
  describe('DIVIDEND presentation', () => {
    it('maps DIVIDEND income events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'DIVIDEND', amount: { amount: '100.50', currency: 'BRL' } },
        }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('DIVIDEND');
      expect(vm.groups[0].items[0].typeLabel).toBe('Dividendo');
      expect(vm.groups[0].items[0].amount).toBe('R$ 100,50');
    });

    it('maps DIVIDEND income events with INCOME completeness status', () => {
      const items = [
        makeHistoryItem({
          details: {
            type: 'DIVIDEND',
            amount: { amount: '50.00', currency: 'BRL' },
            status: 'INCOMPLETE',
          },
        }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].isCostBasisIncomplete).toBe(true);
      expect(vm.groups[0].items[0].status).toBe('INCOMPLETE');
    });
  });

  describe('JCP presentation', () => {
    it('maps JCP income events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'JCP', amount: { amount: '200.00', currency: 'BRL' } },
        }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('JCP');
      expect(vm.groups[0].items[0].typeLabel).toBe('JCP');
    });
  });

  describe('FII_INCOME presentation', () => {
    it('maps FII_INCOME income events with correct label', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'FII_INCOME', amount: { amount: '75.25', currency: 'BRL' } },
        }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].type).toBe('FII_INCOME');
      expect(vm.groups[0].items[0].typeLabel).toBe('Rendimento de FII');
    });
  });

  describe('Income summary uses server data', () => {
    it('consumes incomeSummaries from server without client-side summation', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'DIVIDEND', amount: { amount: '100.00', currency: 'BRL' } },
        }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: '100.00', currency: 'BRL' },
            totalJcp: { amount: '0.00', currency: 'BRL' },
            totalFiiIncome: { amount: '0.00', currency: 'BRL' },
            totalIncome: { amount: '100.00', currency: 'BRL' },
          },
        ],
      });

      expect(vm.summaryCards.length).toBe(1);
      expect(vm.summaryCards[0].currency).toBe('BRL');
      expect(vm.summaryCards[0].formattedTotalIncome).toBe('R$ 100,00');
      expect(vm.summaryCards[0].formattedDividends).toBe('R$ 100,00');
      expect(vm.summaryCards[0].formattedJcp).toBe('R$ 0,00');
      expect(vm.summaryCards[0].formattedFiiIncome).toBe('R$ 0,00');
    });

    it('has empty summaryCards when no incomeSummaries provided', () => {
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
      });

      expect(vm.summaryCards.length).toBe(0);
    });
  });

  describe('No client income aggregation', () => {
    it('does not sum income amounts client-side', () => {
      const items = [
        makeHistoryItem({
          details: { type: 'DIVIDEND', amount: { amount: '100.00', currency: 'BRL' } },
        }),
        makeHistoryItem({ details: { type: 'JCP', amount: { amount: '50.00', currency: 'BRL' } } }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.rawItemsCount).toBe(2);
      expect(vm.groups.length).toBeGreaterThan(0);
      expect(vm.summaryCards.length).toBe(0);
    });
  });

  describe('Multi-currency income segregation', () => {
    it('segregates BRL and USD income summaries', () => {
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: makePagination(),
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: '100.00', currency: 'BRL' },
            totalJcp: { amount: '0.00', currency: 'BRL' },
            totalFiiIncome: { amount: '0.00', currency: 'BRL' },
            totalIncome: { amount: '100.00', currency: 'BRL' },
          },
          {
            currency: 'USD',
            totalDividends: { amount: '50.00', currency: 'USD' },
            totalJcp: { amount: '0.00', currency: 'USD' },
            totalFiiIncome: { amount: '0.00', currency: 'USD' },
            totalIncome: { amount: '50.00', currency: 'USD' },
          },
        ],
      });

      expect(vm.summaryCards.length).toBe(2);
      expect(vm.summaryCards[0].currency).toBe('BRL');
      expect(vm.summaryCards[1].currency).toBe('USD');
    });
  });

  describe('Income period filter', () => {
    it('passes filter metadata through to pagination', () => {
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: {
          limit: 25,
          cursor: 'cursor1',
          nextCursor: 'cursor2',
          hasMore: true,
          totalCount: 100,
        },
      });

      expect(vm.pagination.hasMore).toBe(true);
      expect(vm.pagination.totalCount).toBe(100);
    });
  });

  describe('Income type filter', () => {
    it('correctly identifies income type in mapped items', () => {
      const items = [
        makeHistoryItem({ details: { type: 'DIVIDEND' as const } }),
        makeHistoryItem({ details: { type: 'JCP' as const } }),
        makeHistoryItem({ details: { type: 'FII_INCOME' as const } }),
      ];

      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      const types = vm.groups.flatMap((g) => g.items.map((i) => i.type));
      expect(types).toContain('DIVIDEND');
      expect(types).toContain('JCP');
      expect(types).toContain('FII_INCOME');
    });
  });

  describe('Income pagination', () => {
    it('preserves pagination metadata', () => {
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: [],
        pagination: { limit: 25, cursor: null, nextCursor: 'abc', hasMore: true, totalCount: 50 },
      });

      expect(vm.pagination.hasMore).toBe(true);
      expect(vm.pagination.nextCursor).toBe('abc');
      expect(vm.isEmpty).toBe(true);
    });
  });

  describe('Asset navigation safety', () => {
    it('marks items with assetId as navigable', () => {
      const items = [makeHistoryItem({ assetId: assetPetr4 })];
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].canNavigateToAsset).toBe(true);
      // Regression (post-baseline hotfix): raw internal IDs must never leak as
      // user-facing labels. Without asset metadata the ticker falls back to a
      // safe label while routing still uses the internal assetId.
      expect(vm.groups[0].items[0].assetId).toBe(assetPetr4);
      expect(vm.groups[0].items[0].assetTicker).toBe('Ativo não identificado');
      expect(vm.groups[0].items[0].assetTicker).not.toBe(assetPetr4.slice(0, 8));
    });

    it('prefers server-enriched ticker over internal assetId', () => {
      const items = [
        makeHistoryItem({ assetId: assetPetr4, assetTicker: 'PETR4', assetName: 'Petrobras PN' }),
      ];
      const vm = buildPortfolioIncomeViewModel({
        portfolioId: samplePortfolioId,
        historyItems: items,
        pagination: makePagination(),
      });

      expect(vm.groups[0].items[0].assetTicker).toBe('PETR4');
      expect(vm.groups[0].items[0].assetId).toBe(assetPetr4);
    });
  });
});
