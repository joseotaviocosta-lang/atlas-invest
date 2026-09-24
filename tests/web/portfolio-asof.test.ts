import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import {
  resolveTemporalContext,
  stateQueryKey,
  assetStateQueryKey,
  accountStateQueryKey,
  appendAsOf,
  buildPortfolioAccountsViewModel,
  PortfolioStateDto,
} from '@atlas/ui';

describe('Web: Historical As-Of UX (Fase 2F)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';
  const assetId = 'e0000000-0000-4000-8000-000000000001';
  const today = '2026-09-19';
  const past = '2026-03-15';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('treats no asOf param as current mode with isolated cache key', () => {
    const ctx = resolveTemporalContext({ rawAsOf: null, today });
    expect(ctx.mode).toBe('CURRENT');
    expect(stateQueryKey(portfolioId, ctx.asOf)).toEqual([
      'portfolio-state',
      portfolioId,
      'current',
    ]);
  });

  it('fetches the historical snapshot via ?asOf= with an isolated key', async () => {
    const ctx = resolveTemporalContext({ rawAsOf: past, today });
    expect(ctx.mode).toBe('HISTORICAL');

    const historicalState: PortfolioStateDto = {
      portfolioId,
      asOfDate: past,
      completeness: { costBasis: 'COMPLETE' },
      positions: [],
      accounts: [],
      realizedSummaries: [],
      incomeSummaries: [],
      cashFlowSummaries: [],
      replayMetadata: {
        engineVersion: '1.0.0-rc.1',
        asOfDate: past,
        processedTransactionCount: 0,
        appliedTransactionCount: 0,
        deferredTransactionCount: 0,
        hasIncompleteCostBasis: false,
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: historicalState }),
    }) as unknown as typeof fetch;

    const res = await apiClient.get<{ data: PortfolioStateDto }>(
      `/api/v1/portfolios/${portfolioId}/state?asOf=${ctx.asOf}`,
    );
    expect(res.data.asOfDate).toBe(past);
    expect(res.data.positions).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`asOf=${past}`),
      expect.anything(),
    );

    // Empty historical portfolio is a valid snapshot, not an error.
    const vm = buildPortfolioAccountsViewModel({
      portfolioId,
      state: res.data,
      accountsMeta: [],
      institutionsMeta: [],
    });
    expect(vm.isEmpty).toBe(true);
  });

  it('rejects invalid and future asOf without entering historical mode', () => {
    const invalid = resolveTemporalContext({ rawAsOf: 'abc', today });
    expect(invalid.mode).toBe('CURRENT');
    expect(invalid.error).toBe('INVALID');

    const future = resolveTemporalContext({ rawAsOf: '2026-09-20', today });
    expect(future.mode).toBe('CURRENT');
    expect(future.error).toBe('FUTURE');
  });

  it('normalizes today to current mode (no ?asOf=today duplication)', () => {
    const ctx = resolveTemporalContext({ rawAsOf: today, today });
    expect(ctx.mode).toBe('CURRENT');
    expect(ctx.asOf).toBeNull();
  });

  it('preserves asOf across asset and account navigation links', () => {
    const assetHref = appendAsOf(`/portfolio/assets/${assetId}?portfolioId=${portfolioId}`, past);
    expect(assetHref).toBe(`/portfolio/assets/${assetId}?portfolioId=${portfolioId}&asOf=${past}`);

    const accountHref = appendAsOf(
      `/portfolio/accounts/${accountId}?portfolioId=${portfolioId}`,
      past,
    );
    expect(accountHref).toContain(`asOf=${past}`);

    expect(assetStateQueryKey(portfolioId, assetId, past)).toEqual([
      'portfolio-asset',
      portfolioId,
      assetId,
      past,
    ]);
    expect(accountStateQueryKey(portfolioId, accountId, past)).toEqual([
      'portfolio-account',
      portfolioId,
      accountId,
      past,
    ]);
  });

  it('clears asOf when returning to today', () => {
    expect(appendAsOf('/portfolio?portfolioId=p1', null)).toBe('/portfolio?portfolioId=p1');
  });
});
