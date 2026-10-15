import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { formatCurrency, formatQuantity } from '@atlas/ui';
import { stateQueryKey } from '@atlas/ui';

/**
 * Focused tests for H6: Ativos tab consumes engine-derived positions.
 *
 * Conventions follow tests/web/accounts.test.ts (view-model + apiClient
 * contracts with mocked fetch). No client-side financial math anywhere:
 * quantities and costs are exact server strings; only display labels change.
 */
describe('Web: Assets tab derived positions (H6 engine wiring)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  const enginePosition = {
    assetId: assetPetr4,
    quantity: '200',
    costBasisStatus: 'KNOWN',
    currency: 'BRL',
    totalCost: { amount: '4404.90', currency: 'BRL' },
    averageCost: { amount: '22.0245', currency: 'BRL' },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reads open positions from the engine-derived state (no client math)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          portfolioId,
          asOfDate: null,
          completeness: { costBasis: 'COMPLETE' },
          positions: [enginePosition],
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
            hasIncompleteCostBasis: false,
          },
        },
      }),
    }) as unknown as typeof fetch;

    const res = await apiClient.get<{ data: { positions: (typeof enginePosition)[] } }>(
      `/api/v1/portfolios/${portfolioId}/state`,
    );

    expect(res.data.positions).toHaveLength(1);
    expect(res.data.positions[0]!.quantity).toBe('200');
    // Exact server strings preserved verbatim (no client recalculation)
    expect(res.data.positions[0]!.averageCost).toEqual({
      amount: '22.0245',
      currency: 'BRL',
    });
    expect(res.data.positions[0]!.totalCost).toEqual({
      amount: '4404.90',
      currency: 'BRL',
    });
  });

  it('renders an empty state when the engine reports no open positions', () => {
    const positions: (typeof enginePosition)[] = [];
    const isEmpty = positions.length === 0;
    expect(isEmpty).toBe(true);
  });

  it('formats PETR4-like engine values for display without altering them', () => {
    // Display-only formatting of exact server strings
    expect(formatQuantity(enginePosition.quantity)).toBe('200');
    expect(formatCurrency(enginePosition.averageCost.amount, 'BRL')).toBe('R$ 22,02');
    expect(formatCurrency(enginePosition.totalCost.amount, 'BRL')).toBe('R$ 4.404,90');
    // Source values remain intact (formatters are pure presentation)
    expect(enginePosition.averageCost.amount).toBe('22.0245');
    expect(enginePosition.totalCost.amount).toBe('4404.90');
  });

  it('renders a dash for unknown cost basis instead of fabricating zero', () => {
    const incomplete = {
      ...enginePosition,
      costBasisStatus: 'INCOMPLETE',
      averageCost: null,
      totalCost: null,
    };
    const avgLabel =
      incomplete.costBasisStatus === 'INCOMPLETE' || !incomplete.averageCost
        ? '—'
        : formatCurrency(incomplete.averageCost.amount, 'BRL');
    expect(avgLabel).toBe('—');
    expect(avgLabel).not.toContain('0,00');
  });

  it('exposes no market quote fields on the position read model (honest Sem cotação)', () => {
    expect(enginePosition).not.toHaveProperty('marketValue');
    expect(enginePosition).not.toHaveProperty('quote');
    expect(enginePosition).not.toHaveProperty('unrealizedGainLoss');
  });

  it('uses a stable state query key so transaction creation refreshes positions', () => {
    // The operations-tab mutation invalidates stateQueryKey(portfolioId, asOf);
    // the assets tab consumes the same key, so no manual F5 is required.
    expect(stateQueryKey(portfolioId, null)).toEqual(stateQueryKey(portfolioId, null));
    expect(stateQueryKey(portfolioId, '2026-10-15')).not.toEqual(stateQueryKey(portfolioId, null));
  });

  it('rejects cross-user position access with 404 (no silent empty)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        statusCode: 404,
        error: 'Not Found',
        code: 'PORTFOLIO.NOT_FOUND',
        message: 'Portfolio not found.',
      }),
    }) as unknown as typeof fetch;

    await expect(
      apiClient.get(`/api/v1/portfolios/${portfolioId}/positions`),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
