import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import {
  buildPortfolioAccountsViewModel,
  buildAccountDetailViewModel,
  PortfolioStateDto,
} from '@atlas/ui';

describe('Web: Accounts Overview & Detail (Fase 2E)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountXp = 'd0000000-0000-4000-8000-000000000001';
  const accountNu = 'd0000000-0000-4000-8000-000000000002';
  const instXp = 'b0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

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
        accountId: accountXp,
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
      { accountId: accountNu, positions: [] },
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

  const accountsDirectory = [
    {
      id: accountXp,
      portfolioId,
      institutionId: instXp,
      name: 'XP Conta Investimentos',
      currency: 'BRL',
      status: 'ACTIVE',
    },
    {
      id: accountNu,
      portfolioId,
      institutionId: 'b0000000-0000-4000-8000-000000000002',
      name: 'NuInvest Custodia',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  ];

  const institutionsDirectory = [{ id: instXp, name: 'XP Investimentos' }];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the account directory and maps the overview with institution metadata', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: accountsDirectory }),
    }) as unknown as typeof fetch;

    const res = await apiClient.get<{ data: typeof accountsDirectory }>(
      `/api/v1/portfolios/${portfolioId}/accounts`,
    );
    expect(res.data).toHaveLength(2);

    const vm = buildPortfolioAccountsViewModel({
      portfolioId,
      portfolioName: 'Carteira Principal',
      state: mockState,
      accountsMeta: res.data,
      institutionsMeta: institutionsDirectory,
    });

    expect(vm.accountsCount).toBe(2);
    const xp = vm.accounts.find((a) => a.accountId === accountXp)!;
    expect(xp.institutionName).toBe('XP Investimentos');
    expect(xp.openPositionsCount).toBe(1);
    expect(xp.isEmpty).toBe(false);

    // Unknown institution degrades to null (metadata only, never invented)
    const nu = vm.accounts.find((a) => a.accountId === accountNu)!;
    expect(nu.institutionName).toBeNull();
    expect(nu.isEmpty).toBe(true);
  });

  it('projects account detail positions and hides foreign accounts', () => {
    const vm = buildAccountDetailViewModel({
      portfolioId,
      accountId: accountXp,
      state: mockState,
      accountsMeta: accountsDirectory,
      institutionsMeta: institutionsDirectory,
      assetsMeta: [{ id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN' }],
    });

    expect(vm.found).toBe(true);
    expect(vm.positions).toHaveLength(1);
    expect(vm.positions[0]!.assetTicker).toBe('PETR4');
    expect(vm.positions[0]!.averageCost).toBe('R$ 32,00');
    expect(vm.positions[0]!.totalCost).toBe('R$ 3.200,00');
    expect(vm.positions[0]!.canNavigateToAsset).toBe(true);

    const foreign = buildAccountDetailViewModel({
      portfolioId,
      accountId: 'd0000000-0000-4000-8000-999999999999',
      state: mockState,
      accountsMeta: accountsDirectory,
      institutionsMeta: institutionsDirectory,
    });
    expect(foreign.found).toBe(false);
    expect(foreign.positions).toHaveLength(0);
  });

  it('forwards accountId to the history endpoint for account-scoped views', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
          meta: { limit: 25, cursor: null, nextCursor: null, hasMore: false, totalCount: 0 },
        }),
      };
    }) as unknown as typeof fetch;

    // Same request shape the history/income/cash-flow screens issue (server-side filter)
    for (const type of ['income', 'cash-flow']) {
      const qs = new URLSearchParams({ type, accountId: accountXp, limit: '25' }).toString();
      await apiClient.get(`/api/v1/portfolios/${portfolioId}/history?${qs}`);
    }

    expect(calls).toHaveLength(2);
    for (const url of calls) {
      expect(url).toContain(`accountId=${accountXp}`);
    }
  });

  it('creates an account scoped to the active portfolio (H4 first-account flow)', async () => {
    const created = {
      id: 'd0000000-0000-4000-8000-000000000003',
      portfolioId,
      institutionId: instXp,
      name: 'Conta XP Principal',
      currency: 'BRL',
      status: 'ACTIVE',
    };

    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn().mockImplementation(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      };
    }) as unknown as typeof fetch;

    const res = await apiClient.post<{ data: typeof created }>(
      `/api/v1/portfolios/${portfolioId}/accounts`,
      { institutionId: instXp, name: 'Conta XP Principal', currency: 'BRL' },
    );

    // Portfolio association is automatic via the URL (no manual portfolioId field)
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`/api/v1/portfolios/${portfolioId}/accounts`);
    expect(calls[0]!.body).toEqual({
      institutionId: instXp,
      name: 'Conta XP Principal',
      currency: 'BRL',
    });
    expect(res.data.id).toBe(created.id);
    expect(res.data.portfolioId).toBe(portfolioId);
  });

  it('surfaces cross-user portfolio rejection as a visible error (no silent failure)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        statusCode: 404,
        error: 'Not Found',
        code: 'ACCOUNT.PORTFOLIO_NOT_FOUND',
        message: 'Portfolio not found.',
      }),
    }) as unknown as typeof fetch;

    await expect(
      apiClient.post(`/api/v1/portfolios/${portfolioId}/accounts`, {
        institutionId: instXp,
        name: 'Conta Estrangeira',
        currency: 'BRL',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
