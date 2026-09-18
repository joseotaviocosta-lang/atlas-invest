import { describe, it, expect } from 'vitest';
import {
  mapToAssetPositionDetailViewModel,
  formatDatePtBr,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
} from '@atlas/ui';

describe('UI View Model: Asset Position Detail (Phase 2B)', () => {
  const samplePortfolioId = 'c0000000-0000-4000-8000-000000000001';
  const sampleAccountId1 = 'd0000000-0000-4000-8000-000000000001';
  const sampleAccountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

  describe('formatDatePtBr', () => {
    it('formats YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatDatePtBr('2026-03-15')).toBe('15/03/2026');
      expect(formatDatePtBr('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    });

    it('handles empty or malformed strings gracefully', () => {
      expect(formatDatePtBr('')).toBe('—');
      expect(formatDatePtBr('invalid')).toBe('invalid');
    });
  });

  describe('mapToAssetPositionDetailViewModel', () => {
    it('maps known position with accurate metrics and metadata', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
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
            accountId: sampleAccountId1,
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

      const vm = mapToAssetPositionDetailViewModel({
        assetId: assetPetr4,
        state,
        portfolioMeta: { id: samplePortfolioId, name: 'Principal', type: 'PERSONAL', baseCurrency: 'BRL' },
        accountsMeta: [{ id: sampleAccountId1, name: 'XP Investimentos' }],
        assetMeta: { id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN', type: 'EQUITY' },
      });

      expect(vm.isOpenPosition).toBe(true);
      expect(vm.header.assetId).toBe(assetPetr4);
      expect(vm.header.ticker).toBe('PETR4');
      expect(vm.header.name).toBe('Petrobras PN');
      expect(vm.header.assetClass).toBe('EQUITY');
      expect(vm.header.assetClassLabel).toBe('Ações');
      expect(vm.header.isCostBasisIncomplete).toBe(false);
      expect(vm.header.completenessBadgeLabel).toBeNull();

      expect(vm.primaryCard.quantity).toBe('100');
      expect(vm.primaryCard.averageCost).toBe('R$ 32,00');
      expect(vm.primaryCard.totalCost).toBe('R$ 3.200,00');
      expect(vm.primaryCard.currency).toBe('BRL');
      expect(vm.primaryCard.totalCostLabel).toBe('Custo total');

      expect(vm.accountsBreakdown).toHaveLength(1);
      expect(vm.accountsBreakdown[0].accountName).toBe('XP Investimentos');
      expect(vm.accountsBreakdown[0].quantity).toBe('100');
      expect(vm.accountsBreakdown[0].averageCost).toBe('R$ 32,00');
      expect(vm.accountsBreakdown[0].totalCost).toBe('R$ 3.200,00');
    });

    it('maps incomplete cost basis as "—" and provides non-alarmist warning badges', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'INCOMPLETE' },
        positions: [
          {
            assetId: assetVale3,
            quantity: '200',
            currency: 'BRL',
            costBasisStatus: 'INCOMPLETE',
            totalCost: null,
            averageCost: null,
          },
        ],
        accounts: [
          {
            accountId: sampleAccountId2,
            positions: [
              {
                assetId: assetVale3,
                quantity: '200',
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
        assetId: assetVale3,
        state,
        portfolioMeta: { id: samplePortfolioId, name: 'Principal', type: 'PERSONAL', baseCurrency: 'BRL' },
        accountsMeta: [{ id: sampleAccountId2, name: 'BTG Pactual' }],
        assetMeta: { id: assetVale3, ticker: 'VALE3', name: 'Vale ON', type: 'EQUITY' },
      });

      expect(vm.isOpenPosition).toBe(true);
      expect(vm.header.isCostBasisIncomplete).toBe(true);
      expect(vm.header.completenessBadgeLabel).toBe('Dados de custo incompletos');

      expect(vm.primaryCard.quantity).toBe('200');
      expect(vm.primaryCard.averageCost).toBe('—');
      expect(vm.primaryCard.totalCost).toBe('—');
      expect(vm.primaryCard.totalCostLabel).toBe('Custo total conhecido');

      expect(vm.accountsBreakdown[0].averageCost).toBe('—');
      expect(vm.accountsBreakdown[0].totalCost).toBe('—');
      expect(vm.accountsBreakdown[0].isCostBasisIncomplete).toBe(true);
    });

    it('maps multi-account distribution across multiple brokers', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'COMPLETE' },
        positions: [
          {
            assetId: assetPetr4,
            quantity: '350',
            currency: 'BRL',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '10500.00', currency: 'BRL' },
            averageCost: { amount: '30.00', currency: 'BRL' },
          },
        ],
        accounts: [
          {
            accountId: sampleAccountId1,
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
          {
            accountId: sampleAccountId2,
            positions: [
              {
                assetId: assetPetr4,
                quantity: '150',
                currency: 'BRL',
                costBasisStatus: 'KNOWN',
                totalCost: { amount: '4500.00', currency: 'BRL' },
                averageCost: { amount: '30.00', currency: 'BRL' },
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
        state,
        accountsMeta: [
          { id: sampleAccountId1, name: 'XP Investimentos' },
          { id: sampleAccountId2, name: 'BTG Pactual' },
        ],
      });

      expect(vm.accountsBreakdown).toHaveLength(2);
      expect(vm.accountsBreakdown[0].accountName).toBe('BTG Pactual');
      expect(vm.accountsBreakdown[0].quantity).toBe('150');
      expect(vm.accountsBreakdown[1].accountName).toBe('XP Investimentos');
      expect(vm.accountsBreakdown[1].quantity).toBe('200');
    });

    it('maps realized disposals (economic sales) and income events cleanly', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
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
          id: 'rd_tx1',
          kind: 'REALIZED_DISPOSAL',
          transactionId: 'tx1',
          tradeDate: '2026-02-01',
          accountId: sampleAccountId1,
          assetId: assetPetr4,
          currency: 'BRL',
          details: {
            quantity: '50',
            grossProceeds: { amount: '1750.00', currency: 'BRL' },
            sellingCosts: { amount: '5.00', currency: 'BRL' },
            netProceeds: { amount: '1745.00', currency: 'BRL' },
            costBasisRemoved: { amount: '1500.00', currency: 'BRL' },
            realizedGainLoss: { amount: '245.00', currency: 'BRL' },
            realizedReturnPercentage: '16.33',
            status: 'KNOWN',
          },
        },
        {
          id: 'inc_tx2',
          kind: 'INCOME',
          transactionId: 'tx2',
          tradeDate: '2026-01-15',
          accountId: sampleAccountId1,
          assetId: assetPetr4,
          currency: 'BRL',
          details: {
            type: 'DIVIDEND',
            amount: { amount: '120.00', currency: 'BRL' },
            grossAmount: { amount: '120.00', currency: 'BRL' },
            status: 'KNOWN',
          },
        },
        {
          id: 'ca_tx3',
          kind: 'CORPORATE_ACTION',
          transactionId: 'tx3',
          tradeDate: '2026-01-10',
          accountId: sampleAccountId1,
          assetId: assetPetr4,
          currency: 'BRL',
          details: {
            type: 'SPLIT',
            beforeQuantity: '50',
            afterQuantity: '100',
            status: 'KNOWN',
          },
        },
        {
          id: 'tr_tx4',
          kind: 'TRANSFER',
          transactionId: 'tx4',
          tradeDate: '2026-01-05',
          accountId: sampleAccountId1,
          assetId: assetPetr4,
          currency: 'BRL',
          details: {
            type: 'TRANSFER_IN',
            quantity: '50',
            status: 'MATCHED',
            costBasisStatus: 'KNOWN',
          },
        },
      ];

      const vm = mapToAssetPositionDetailViewModel({
        assetId: assetPetr4,
        state,
        historyItems,
        accountsMeta: [{ id: sampleAccountId1, name: 'XP Investimentos' }],
      });

      // Realized disposals section
      expect(vm.realizedResults.hasRealizedDisposals).toBe(true);
      expect(vm.realizedResults.disposals).toHaveLength(1);
      const disp = vm.realizedResults.disposals[0];
      expect(disp.quantity).toBe('50');
      expect(disp.grossProceeds).toBe('R$ 1.750,00');
      expect(disp.sellingCosts).toBe('R$ 5,00');
      expect(disp.netProceeds).toBe('R$ 1.745,00');
      expect(disp.costBasisRemoved).toBe('R$ 1.500,00');
      expect(disp.realizedGainLoss).toBe('R$ 245,00');
      expect(disp.realizedReturnPercentage).toBe('+16,33%');
      expect(disp.isPositive).toBe(true);

      // Income section
      expect(vm.incomeReceived.hasIncomeEvents).toBe(true);
      expect(vm.incomeReceived.events).toHaveLength(1);
      const inc = vm.incomeReceived.events[0];
      expect(inc.type).toBe('DIVIDEND');
      expect(inc.typeLabel).toBe('Dividendo');
      expect(inc.amount).toBe('R$ 120,00');

      // History feed
      expect(vm.history.items).toHaveLength(4);
      expect(vm.history.items[0].kindLabel).toBe('Venda / Alienação');
      expect(vm.history.items[1].kindLabel).toBe('Dividendo');
      expect(vm.history.items[2].kindLabel).toBe('Desdobramento');
      expect(vm.history.items[3].kindLabel).toBe('Transferência de Entrada');
    });

    it('handles closed or non-existent positions safely (isOpenPosition = false)', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'COMPLETE' },
        positions: [],
        accounts: [],
        realizedSummaries: [],
        incomeSummaries: [],
        cashFlowSummaries: [],
      };

      const vm = mapToAssetPositionDetailViewModel({
        assetId: 'e0000000-0000-4000-8000-999999999999',
        state,
      });

      expect(vm.isOpenPosition).toBe(false);
      expect(vm.primaryCard.quantity).toBe('0');
      expect(vm.primaryCard.averageCost).toBe('—');
      expect(vm.primaryCard.totalCost).toBe('—');
      expect(vm.accountsBreakdown).toHaveLength(0);
    });

    it('formats large numbers and fractional quantities accurately without float precision loss', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'COMPLETE' },
        positions: [
          {
            assetId: assetPetr4,
            quantity: '0.12345678',
            currency: 'BRL',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '123456789.99', currency: 'BRL' },
            averageCost: { amount: '1000000000.00', currency: 'BRL' },
          },
        ],
        accounts: [],
        realizedSummaries: [],
        incomeSummaries: [],
        cashFlowSummaries: [],
      };

      const vm = mapToAssetPositionDetailViewModel({
        assetId: assetPetr4,
        state,
      });

      expect(vm.primaryCard.quantity).toBe('0,12345678');
      expect(vm.primaryCard.totalCost).toBe('R$ 123.456.789,99');
      expect(vm.primaryCard.averageCost).toBe('R$ 1.000.000.000,00');
    });
  });
});
