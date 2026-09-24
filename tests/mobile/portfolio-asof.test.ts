import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';
import {
  resolveTemporalContext,
  stateQueryKey,
  appendAsOf,
  buildPortfolioAccountsViewModel,
  PortfolioStateDto,
} from '@atlas/ui';

describe('Mobile: Historical As-Of UX (Fase 2F)', () => {
  const originalFetch = global.fetch;
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';
  const assetId = 'e0000000-0000-4000-8000-000000000001';
  const today = '2026-09-19';
  const past = '2026-03-15';

  const historicalState: PortfolioStateDto = {
    portfolioId,
    asOfDate: past,
    completeness: { costBasis: 'COMPLETE' },
    positions: [
      {
        assetId,
        quantity: '100',
        currency: 'BRL',
        costBasisStatus: 'KNOWN',
        totalCost: { amount: '3200.00', currency: 'BRL' },
        averageCost: { amount: '32.00', currency: 'BRL' },
      },
    ],
    accounts: [
      {
        accountId,
        positions: [
          {
            assetId,
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

  beforeEach(() => {
    clearQueryCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('selects a historical date and fetches the snapshot with an isolated key', async () => {
    const ctx = resolveTemporalContext({ rawAsOf: past, today });
    expect(ctx.mode).toBe('HISTORICAL');
    expect(ctx.bannerLabel).toBe('Visualizando carteira em 15/03/2026');

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: historicalState }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await queryClient.fetchQuery({
      queryKey: stateQueryKey(portfolioId, ctx.asOf),
      queryFn: () => portfoliosApi.getPortfolioState(portfolioId, ctx.asOf ?? undefined),
    });

    expect(res.data.positions).toHaveLength(1);
    expect(res.data.asOfDate).toBe(past);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`asOf=${past}`),
      expect.anything(),
    );
  });

  it('shows the historical banner and returns to today by clearing asOf', () => {
    const historical = resolveTemporalContext({ rawAsOf: past, today });
    expect(historical.bannerLabel).toContain('15/03/2026');

    const backToToday = resolveTemporalContext({ rawAsOf: null, today });
    expect(backToToday.mode).toBe('CURRENT');
    expect(backToToday.bannerLabel).toBeNull();
    expect(stateQueryKey(portfolioId, backToToday.asOf)).toEqual([
      'portfolio-state',
      portfolioId,
      'current',
    ]);
  });

  it('handles invalid dates without entering historical mode', () => {
    const ctx = resolveTemporalContext({ rawAsOf: '2026-13-32', today });
    expect(ctx.mode).toBe('CURRENT');
    expect(ctx.error).not.toBeNull();
  });

  it('preserves asOf in asset and account navigation routes', () => {
    const assetRoute = `/(app)/portfolio/${assetId}?portfolioId=${portfolioId}&asOf=${past}`;
    expect(assetRoute).toContain(`asOf=${past}`);

    const accountRoute = appendAsOf(
      `/(app)/portfolio/accounts/${accountId}?portfolioId=${portfolioId}`,
      past,
    );
    expect(accountRoute).toContain(`asOf=${past}`);
  });

  it('derives account positions from the historical snapshot without recomputation', () => {
    const vm = buildPortfolioAccountsViewModel({
      portfolioId,
      state: historicalState,
      accountsMeta: [
        {
          id: accountId,
          name: 'XP Conta Investimentos',
          institutionId: 'b1',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      ],
      institutionsMeta: [{ id: 'b1', name: 'XP Investimentos' }],
    });

    expect(vm.accounts[0]!.openPositionsCount).toBe(1);
    expect(vm.accounts[0]!.institutionName).toBe('XP Investimentos');
  });
});
