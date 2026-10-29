import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { mapToPortfolioOverviewViewModel, PortfolioStateDto } from '@atlas/ui';

describe('Web: Portfolio Overview Integration & Replay Consumption (Phase 2A)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
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

  it('fetches and maps portfolio state successfully with known costs', async () => {
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
      realizedSummaries: [
        {
          currency: 'BRL',
          status: 'KNOWN',
          grossProceeds: { amount: '1500.00', currency: 'BRL' },
          sellingCosts: { amount: '5.00', currency: 'BRL' },
          netProceeds: { amount: '1495.00', currency: 'BRL' },
          costBasisRemoved: { amount: '1200.00', currency: 'BRL' },
          realizedGainLoss: { amount: '295.00', currency: 'BRL' },
          realizedReturnPercentage: '24.58',
          disposalCount: 1,
        },
      ],
      incomeSummaries: [
        {
          currency: 'BRL',
          totalDividends: { amount: '80.00', currency: 'BRL' },
          totalJcp: { amount: '20.00', currency: 'BRL' },
          totalFiiIncome: { amount: '0.00', currency: 'BRL' },
          totalIncome: { amount: '100.00', currency: 'BRL' },
        },
      ],
      cashFlowSummaries: [],
      replayMetadata: {
        engineVersion: '1.0.0-rc.1',
        asOfDate: null,
        processedTransactionCount: 3,
        appliedTransactionCount: 3,
        deferredTransactionCount: 0,
        hasIncompleteCostBasis: false,
      },
    };

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: mockState }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await apiClient.get<{ data: PortfolioStateDto }>(
      `/api/v1/portfolios/${portfolioId}/state`,
    );
    expect(res.data.portfolioId).toBe(portfolioId);

    const vm = mapToPortfolioOverviewViewModel(
      res.data,
      { id: portfolioId, name: 'Carteira Principal', type: 'PERSONAL', baseCurrency: 'BRL' },
      [{ id: accountId1, name: 'Corretora Clear' }],
    );

    expect(vm.header.name).toBe('Carteira Principal');
    expect(vm.header.openPositionsCount).toBe(1);
    expect(vm.completenessNotice.hasIncompletePositions).toBe(false);

    // Summary cards (strictly from API summaries)
    expect(vm.summaryCards.realizedResult[0].formattedAmount).toBe('R$ 295,00');
    expect(vm.summaryCards.incomeReceived[0].formattedAmount).toBe('R$ 100,00');

    // Position & Account breakdown
    const pos = vm.positions[0];
    expect(pos.displayIdentifier).toBe(assetPetr4);
    expect(pos.quantity).toBe('100');
    expect(pos.averageCost).toBe('R$ 32,00');
    expect(pos.totalCost).toBe('R$ 3.200,00');
    expect(pos.accounts[0].accountName).toBe('Corretora Clear');
  });

  it('maps incomplete cost basis into warning banner and "—" values', () => {
    const incompleteState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'INCOMPLETE' },
      positions: [
        {
          assetId: assetVale3,
          quantity: '50',
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
      replayMetadata: {
        engineVersion: '1.0.0-rc.1',
        asOfDate: null,
        processedTransactionCount: 1,
        appliedTransactionCount: 1,
        deferredTransactionCount: 0,
        hasIncompleteCostBasis: true,
      },
    };

    const vm = mapToPortfolioOverviewViewModel(incompleteState, null, null);

    expect(vm.completenessNotice.hasIncompletePositions).toBe(true);
    expect(vm.completenessNotice.message).toContain('custo de aquisição incompleto');

    const pos = vm.positions[0];
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.averageCost).toBe('—');
    expect(pos.totalCost).toBe('—');
  });

  it('handles 422 PORTFOLIO.REPLAY_FAILED error properly without exposing internal details', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        statusCode: 422,
        code: 'PORTFOLIO.REPLAY_FAILED',
        message: 'Replay failed: negative position detected',
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      await apiClient.get(`/api/v1/portfolios/${portfolioId}/state`);
      expect.unreachable('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(422);
      expect(apiErr.code).toBe('PORTFOLIO.REPLAY_FAILED');
    }
  });

  it('guarantees incomplete realized disposal never renders as R$ 0,00 in summary cards', () => {
    const incompleteRealizedState: PortfolioStateDto = {
      portfolioId,
      asOfDate: null,
      completeness: { costBasis: 'INCOMPLETE' },
      positions: [],
      accounts: [],
      realizedSummaries: [
        {
          currency: 'BRL',
          status: 'INCOMPLETE',
          grossProceeds: { amount: '12000.00', currency: 'BRL' },
          sellingCosts: { amount: '25.00', currency: 'BRL' },
          netProceeds: { amount: '11975.00', currency: 'BRL' },
          costBasisRemoved: null,
          realizedGainLoss: null,
          realizedReturnPercentage: null,
          disposalCount: 3,
        },
      ],
      incomeSummaries: [],
      cashFlowSummaries: [],
    };

    const vm = mapToPortfolioOverviewViewModel(incompleteRealizedState, null, null);
    expect(vm.summaryCards.realizedResult).toHaveLength(1);
    const item = vm.summaryCards.realizedResult[0]!;

    expect(item.formattedAmount).toBe('—');
    expect(item.formattedAmount).not.toBe('R$ 0,00');
    expect(item.isIncomplete).toBe(true);
    expect(item.completenessLabel).toBe('Cálculo incompleto');
  });

  it('formats operation labels distinguishing opening positions from standard transfers', async () => {
    const { formatOperationTypeLabel, isOpeningPositionTransaction } = await import(
      '@/lib/operation-entry'
    );

    const openingTx = {
      type: 'TRANSFER_IN',
      notes: 'Importado de relatorio-consolidado-anual-2024.xlsx (linha 1) — Posição em 31/12/2024',
      source: 'B3',
      provider: 'B3',
    };

    const normalTransferTx = {
      type: 'TRANSFER_IN',
      notes: 'Transferência de custódia entre contas',
      source: 'MANUAL',
      provider: 'MANUAL',
    };

    const transferOutTx = {
      type: 'TRANSFER_OUT',
      notes: 'Saída de custódia',
    };

    const buyTx = {
      type: 'BUY',
      notes: null,
    };

    expect(isOpeningPositionTransaction(openingTx)).toBe(true);
    expect(formatOperationTypeLabel(openingTx)).toBe('Posição inicial');

    expect(isOpeningPositionTransaction(normalTransferTx)).toBe(false);
    expect(formatOperationTypeLabel(normalTransferTx)).toBe('Transferência de entrada');

    expect(formatOperationTypeLabel(transferOutTx)).toBe('Transferência de saída');
    expect(formatOperationTypeLabel(buyTx)).toBe('Compra');
  });
});
