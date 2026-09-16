import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient, clearQueryCache } from '../../apps/mobile/src/lib/react-query';
import { portfoliosApi } from '../../apps/mobile/src/api/portfolios';

describe('Mobile Portfolio Flow: Data Fetching & Cross-User Cache Isolation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearQueryCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should fetch and cache portfolio list for authenticated user', async () => {
    const mockPortfolios = [
      {
        id: 'p-1',
        userId: 'u-1',
        name: 'Carteira Conservadora',
        description: 'Foco em renda fixa',
        baseCurrency: 'BRL',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: mockPortfolios }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const queryData = await queryClient.fetchQuery({
      queryKey: ['portfolios'],
      queryFn: () => portfoliosApi.listPortfolios(),
    });

    expect(queryData.data).toHaveLength(1);
    expect(queryData.data[0].name).toBe('Carteira Conservadora');

    // Cached data is present in queryClient
    const cached = queryClient.getQueryData<{ data: typeof mockPortfolios }>(['portfolios']);
    expect(cached?.data[0].id).toBe('p-1');
  });

  it('Cross-User Cache Isolation: should wipe cache completely when user logs out', async () => {
    // 1. User A loads portfolios into cache
    queryClient.setQueryData(['portfolios'], {
      data: [{ id: 'p-user-a', name: 'Carteira do Usuario A' }],
    });

    expect(queryClient.getQueryData(['portfolios'])).toBeDefined();

    // 2. User A logs out -> clearQueryCache is executed
    clearQueryCache();

    // 3. User B opens the app -> cache must be completely empty!
    const cacheAfterLogout = queryClient.getQueryData(['portfolios']);
    expect(cacheAfterLogout).toBeUndefined();
  });

  it('should create new portfolio and return created DTO', async () => {
    const newPortfolio = {
      id: 'p-new-99',
      userId: 'u-1',
      name: 'Acoes Brasil',
      description: 'Longo prazo',
      baseCurrency: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    };

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: newPortfolio }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await portfoliosApi.createPortfolio({
      name: 'Acoes Brasil',
      description: 'Longo prazo',
      baseCurrency: 'BRL',
    });

    expect(result.data.id).toBe('p-new-99');
    expect(result.data.name).toBe('Acoes Brasil');
  });
});
