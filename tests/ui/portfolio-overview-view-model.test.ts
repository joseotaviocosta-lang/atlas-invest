import { describe, it, expect } from 'vitest';
import { mapToPortfolioOverviewViewModel, PortfolioStateDto, formatQuantity } from '@atlas/ui';

describe('UI View Model: Portfolio Overview (Phase 2A)', () => {
  const samplePortfolioId = 'c0000000-0000-4000-8000-000000000001';
  const sampleAccountId1 = 'd0000000-0000-4000-8000-000000000001';
  const sampleAccountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';
  const assetAapl = 'e0000000-0000-4000-8000-000000000003';

  describe('formatQuantity', () => {
    it('formats integers with thousands separators', () => {
      expect(formatQuantity('150')).toBe('150');
      expect(formatQuantity('1000')).toBe('1.000');
      expect(formatQuantity('1000000')).toBe('1.000.000');
    });

    it('formats fractional quantities without precision loss', () => {
      expect(formatQuantity('0.12345678')).toBe('0,12345678');
      expect(formatQuantity('1500.500')).toBe('1.500,5');
      expect(formatQuantity('12.5')).toBe('12,5');
    });

    it('handles null, undefined, empty safely', () => {
      expect(formatQuantity(null)).toBe('—');
      expect(formatQuantity(undefined)).toBe('—');
      expect(formatQuantity('')).toBe('—');
      expect(formatQuantity('   ')).toBe('—');
    });
  });

  describe('mapToPortfolioOverviewViewModel', () => {
    it('maps known cost basis positions and aggregates total cost correctly', () => {
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
          {
            assetId: assetVale3,
            quantity: '50',
            currency: 'BRL',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '3000.00', currency: 'BRL' },
            averageCost: { amount: '60.00', currency: 'BRL' },
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
          {
            accountId: sampleAccountId2,
            positions: [
              {
                assetId: assetVale3,
                quantity: '50',
                currency: 'BRL',
                costBasisStatus: 'KNOWN',
                totalCost: { amount: '3000.00', currency: 'BRL' },
                averageCost: { amount: '60.00', currency: 'BRL' },
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
          processedTransactionCount: 2,
          appliedTransactionCount: 2,
          deferredTransactionCount: 0,
          hasIncompleteCostBasis: false,
        },
      };

      const accountsMeta = [
        { id: sampleAccountId1, name: 'XP Investimentos' },
        { id: sampleAccountId2, name: 'BTG Pactual' },
      ];

      const vm = mapToPortfolioOverviewViewModel(
        state,
        { id: samplePortfolioId, name: 'Principal', type: 'PERSONAL', baseCurrency: 'BRL' },
        accountsMeta,
      );

      expect(vm.header.name).toBe('Principal');
      expect(vm.header.typeLabel).toBe('Pessoal');
      expect(vm.header.openPositionsCount).toBe(2);
      expect(vm.header.hasIncompleteCostBasis).toBe(false);
      expect(vm.completenessNotice.hasIncompletePositions).toBe(false);
      expect(vm.completenessNotice.message).toBeNull();

      // Summary cards (strictly from API summaries, zero client math)
      expect(vm.summaryCards.openPositionsCount).toBe(2);
      expect(vm.summaryCards.realizedResult).toHaveLength(0);
      expect(vm.summaryCards.incomeReceived).toHaveLength(0);

      // Positions (carrying individual cost basis from engine)
      expect(vm.positions).toHaveLength(2);
      const petr4 = vm.positions.find((p) => p.assetId === assetPetr4)!;
      expect(petr4.quantity).toBe('100');
      expect(petr4.averageCost).toBe('R$ 32,00');
      expect(petr4.totalCost).toBe('R$ 3.200,00');
      expect(petr4.costBasisStatus).toBe('KNOWN');
      expect(petr4.accounts).toHaveLength(1);
      expect(petr4.accounts[0].accountName).toBe('XP Investimentos');
      expect(petr4.accounts[0].totalCost).toBe('R$ 3.200,00');
    });

    it('maps incomplete cost basis as "—", never 0 or "R$ 0,00"', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
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
        accounts: [
          {
            accountId: sampleAccountId1,
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
          hasIncompleteCostBasis: true,
        },
      };

      const vm = mapToPortfolioOverviewViewModel(state, null, null);

      expect(vm.header.hasIncompleteCostBasis).toBe(true);
      expect(vm.completenessNotice.hasIncompletePositions).toBe(true);
      expect(vm.completenessNotice.message).toContain('custo de aquisição incompleto');

      const pos = vm.positions[0];
      expect(pos.costBasisStatus).toBe('INCOMPLETE');
      expect(pos.averageCost).toBe('—');
      expect(pos.totalCost).toBe('—');
      expect(pos.accounts[0].averageCost).toBe('—');
      expect(pos.accounts[0].totalCost).toBe('—');
    });

    it('segregates multi-currency positions (BRL and USD) without cross-converting', () => {
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
            totalCost: { amount: '3000.00', currency: 'BRL' },
            averageCost: { amount: '30.00', currency: 'BRL' },
          },
          {
            assetId: assetAapl,
            quantity: '10',
            currency: 'USD',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '1500.00', currency: 'USD' },
            averageCost: { amount: '150.00', currency: 'USD' },
          },
        ],
        accounts: [],
        realizedSummaries: [
          {
            currency: 'BRL',
            status: 'KNOWN',
            grossProceeds: { amount: '5000.00', currency: 'BRL' },
            sellingCosts: { amount: '10.00', currency: 'BRL' },
            netProceeds: { amount: '4990.00', currency: 'BRL' },
            costBasisRemoved: { amount: '4000.00', currency: 'BRL' },
            realizedGainLoss: { amount: '990.00', currency: 'BRL' },
            realizedReturnPercentage: '24.75',
            disposalCount: 1,
          },
          {
            currency: 'USD',
            status: 'KNOWN',
            grossProceeds: { amount: '800.00', currency: 'USD' },
            sellingCosts: { amount: '0.00', currency: 'USD' },
            netProceeds: { amount: '800.00', currency: 'USD' },
            costBasisRemoved: { amount: '1000.00', currency: 'USD' },
            realizedGainLoss: { amount: '-200.00', currency: 'USD' },
            realizedReturnPercentage: '-20.00',
            disposalCount: 1,
          },
        ],
        incomeSummaries: [
          {
            currency: 'BRL',
            totalDividends: { amount: '150.00', currency: 'BRL' },
            totalJcp: { amount: '50.00', currency: 'BRL' },
            totalFiiIncome: { amount: '0.00', currency: 'BRL' },
            totalIncome: { amount: '200.00', currency: 'BRL' },
          },
          {
            currency: 'USD',
            totalDividends: { amount: '25.00', currency: 'USD' },
            totalJcp: { amount: '0.00', currency: 'USD' },
            totalFiiIncome: { amount: '0.00', currency: 'USD' },
            totalIncome: { amount: '25.00', currency: 'USD' },
          },
        ],
        cashFlowSummaries: [],
      };

      const vm = mapToPortfolioOverviewViewModel(state, null, null);

      // Realized results by currency (strictly from API summaries)
      expect(vm.summaryCards.realizedResult).toHaveLength(2);
      const brlRealized = vm.summaryCards.realizedResult.find((r) => r.currency === 'BRL')!;
      expect(brlRealized.formattedAmount).toBe('R$ 990,00');
      expect(brlRealized.isPositive).toBe(true);
      expect(brlRealized.formattedPercentage).toBe('+24,75%');

      const usdRealized = vm.summaryCards.realizedResult.find((r) => r.currency === 'USD')!;
      expect(usdRealized.formattedAmount).toBe('-USD 200,00');
      expect(usdRealized.isNegative).toBe(true);
      expect(usdRealized.formattedPercentage).toBe('-20,00%');

      // Income received by currency
      expect(vm.summaryCards.incomeReceived).toHaveLength(2);
      const brlIncome = vm.summaryCards.incomeReceived.find((i) => i.currency === 'BRL')!;
      expect(brlIncome.formattedAmount).toBe('R$ 200,00');
      expect(brlIncome.breakdown.dividends).toBe('R$ 150,00');
      expect(brlIncome.breakdown.jcp).toBe('R$ 50,00');

      const usdIncome = vm.summaryCards.incomeReceived.find((i) => i.currency === 'USD')!;
      expect(usdIncome.formattedAmount).toBe('USD 25,00');
      expect(usdIncome.breakdown.dividends).toBe('USD 25,00');
    });

    it('identifies completely empty portfolio vs portfolio with only cash flows', () => {
      // 1. Completely empty
      const emptyState: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'COMPLETE' },
        positions: [],
        accounts: [],
        realizedSummaries: [],
        incomeSummaries: [],
        cashFlowSummaries: [],
        replayMetadata: {
          engineVersion: '1.0.0-rc.1',
          asOfDate: null,
          processedTransactionCount: 0,
          appliedTransactionCount: 0,
          deferredTransactionCount: 0,
          hasIncompleteCostBasis: false,
        },
      };

      const emptyVm = mapToPortfolioOverviewViewModel(emptyState, null, null);
      expect(emptyVm.stateIndicators.isEmptyPortfolio).toBe(true);
      expect(emptyVm.stateIndicators.hasNoOpenPositions).toBe(true);
      expect(emptyVm.stateIndicators.hasCashFlowsOnly).toBe(false);

      // 2. Cash flows only (e.g. deposit but no buy)
      const cashFlowState: PortfolioStateDto = {
        ...emptyState,
        replayMetadata: {
          engineVersion: '1.0.0-rc.1',
          asOfDate: null,
          processedTransactionCount: 1,
          appliedTransactionCount: 1,
          deferredTransactionCount: 0,
          hasIncompleteCostBasis: false,
        },
      };

      const cashFlowVm = mapToPortfolioOverviewViewModel(cashFlowState, null, null);
      expect(cashFlowVm.stateIndicators.isEmptyPortfolio).toBe(false);
      expect(cashFlowVm.stateIndicators.hasNoOpenPositions).toBe(true);
      expect(cashFlowVm.stateIndicators.hasCashFlowsOnly).toBe(true);
    });

    it('formats large numbers without scientific notation or precision distortion', () => {
      const state: PortfolioStateDto = {
        portfolioId: samplePortfolioId,
        asOfDate: null,
        completeness: { costBasis: 'COMPLETE' },
        positions: [
          {
            assetId: assetPetr4,
            quantity: '100000000.12345678',
            currency: 'BRL',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '123456789012.34', currency: 'BRL' },
            averageCost: { amount: '1234.56', currency: 'BRL' },
          },
        ],
        accounts: [],
        realizedSummaries: [],
        incomeSummaries: [],
        cashFlowSummaries: [],
      };

      const vm = mapToPortfolioOverviewViewModel(state, null, null);
      const pos = vm.positions[0];
      expect(pos.quantity).toBe('100.000.000,12345678');
      expect(pos.totalCost).toBe('R$ 123.456.789.012,34');
      expect(pos.averageCost).toBe('R$ 1.234,56');
    });
  });
});
