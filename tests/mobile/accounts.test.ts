import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';
import {
  buildPortfolioAccountsViewModel,
  buildAccountDetailViewModel,
  PortfolioStateDto,
} from '@atlas/ui';

describe('Mobile: Accounts Overview & Detail (Fase 2E)', () => {
  const originalFetch = global.fetch;
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const portfolioId2 = 'c0000000-0000-4000-8000-000000000002';
  const accountXp = 'd0000000-0000-4000-8000-000000000001';
  const instXp = 'b0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  const mockAccounts = [
    {
      id: accountXp,
      portfolioId,
      institutionId: instXp,
      name: 'XP Conta Investimentos',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  ];

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

  it('fetches the account directory and institutions via mobile portfoliosApi', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/v1/institutions')) {
        return new Response(JSON.stringify({ data: [{ id: instXp, name: 'XP Investimentos' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: mockAccounts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const accounts = await queryClient.fetchQuery({
      queryKey: ['portfolio-accounts', portfolioId],
      queryFn: () => portfoliosApi.listAccounts(portfolioId),
    });
    expect(accounts.data).toHaveLength(1);
    expect(accounts.data[0]!.institutionId).toBe(instXp);

    const institutions = await queryClient.fetchQuery({
      queryKey: ['institutions'],
      queryFn: () => portfoliosApi.listInstitutions(),
    });
    expect(institutions.data[0]!.name).toBe('XP Investimentos');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/portfolios/${portfolioId}/accounts`),
      expect.anything(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/institutions'),
      expect.anything(),
    );
  });

  it('maps overview and detail view models with — for incomplete costs', () => {
    const overview = buildPortfolioAccountsViewModel({
      portfolioId,
      state: mockState,
      accountsMeta: mockAccounts,
      institutionsMeta: [{ id: instXp, name: 'XP Investimentos' }],
    });
    expect(overview.accountsCount).toBe(1);
    expect(overview.accounts[0]!.institutionName).toBe('XP Investimentos');
    expect(overview.accounts[0]!.openPositionsCount).toBe(1);

    const detail = buildAccountDetailViewModel({
      portfolioId,
      accountId: accountXp,
      state: mockState,
      accountsMeta: mockAccounts,
      institutionsMeta: [{ id: instXp, name: 'XP Investimentos' }],
      assetsMeta: [{ id: assetPetr4, ticker: 'PETR4' }],
    });
    expect(detail.found).toBe(true);
    expect(detail.positions[0]!.assetTicker).toBe('PETR4');
    expect(detail.positions[0]!.totalCost).toBe('R$ 3.200,00');
  });

  it('isolates account queries per portfolio (switch safety)', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = String(url);
      const pid = u.includes(portfolioId2) ? portfolioId2 : portfolioId;
      return new Response(
        JSON.stringify({
          data: pid === portfolioId ? mockAccounts : [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const p1 = await queryClient.fetchQuery({
      queryKey: ['portfolio-accounts', portfolioId],
      queryFn: () => portfoliosApi.listAccounts(portfolioId),
    });
    const p2 = await queryClient.fetchQuery({
      queryKey: ['portfolio-accounts', portfolioId2],
      queryFn: () => portfoliosApi.listAccounts(portfolioId2),
    });

    expect(p1.data).toHaveLength(1);
    expect(p2.data).toHaveLength(0);
  });

  it('builds deep-link routes for account detail and account-scoped filters', () => {
    const detailRoute = `/(app)/portfolio/accounts/${accountXp}?portfolioId=${portfolioId}`;
    expect(detailRoute).toContain(accountXp);
    expect(detailRoute).toContain(`portfolioId=${portfolioId}`);

    for (const screen of ['history', 'income', 'cash-flow'] as const) {
      const route = `/(app)/portfolio/${screen}?portfolioId=${portfolioId}&accountId=${accountXp}`;
      expect(route).toContain(`accountId=${accountXp}`);
    }
  });
});
