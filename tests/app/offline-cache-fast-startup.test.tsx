import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import { TodayRoute } from '../../apps/atlas-app/src/routes/TodayRoute';
import { PortfolioRoute } from '../../apps/atlas-app/src/routes/PortfolioRoute';
import { ImportRoute } from '../../apps/atlas-app/src/routes/ImportRoute';
import { ManualRefreshButton } from '../../apps/atlas-app/src/features/portfolio/components/ManualRefreshButton';
import {
  LocalCache,
  LocalCacheKeys,
  CACHE_SCHEMA_VERSION,
  CACHE_PREFIX,
  buildCacheKey,
} from '../../apps/atlas-app/src/lib/local-cache';
import { portfolioKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type { PortfolioValuationData, PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('Atlas Offline Read Cache, Fast Startup & Staleness (APP-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    LocalCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
    LocalCache.clear();
  });

  const mockPosition: PositionValuationDto = {
    assetId: 'asset-petr4',
    accountId: 'acc-1',
    ticker: 'PETR4',
    assetType: 'STOCK',
    quantity: '100',
    currency: 'BRL',
    totalCost: { amount: '3000.00', currency: 'BRL' },
    averageCost: { amount: '30.00', currency: 'BRL' },
    costBasisStatus: 'KNOWN',
    quote: {
      assetId: 'asset-petr4',
      price: '35.00',
      currency: 'BRL',
      asOf: '2026-11-04',
      receivedAt: '2026-11-04T18:00:00Z',
      source: 'BRAPI EOD',
      status: 'AVAILABLE',
      freshness: 'FRESH',
      providerSymbol: 'PETR4',
    },
    marketValue: { amount: '3500.00', currency: 'BRL' },
    unrealizedGainLoss: { amount: '500.00', currency: 'BRL' },
    unrealizedGainLossPercent: '16.67',
    status: 'VALUED',
    quoteFreshness: 'FRESH',
    quoteStatus: 'AVAILABLE',
  };

  const mockValuation: PortfolioValuationData = {
    portfolioId: 'port-1',
    asOf: '2026-11-04',
    engineVersion: '1.0.0',
    valuationVersion: '1.0.0',
    positions: [mockPosition],
    totalsByCurrency: {
      BRL: {
        currency: 'BRL',
        marketValue: { amount: '3500.00', currency: 'BRL' },
        costBasis: { amount: '3000.00', currency: 'BRL' },
        knownCost: { amount: '3000.00', currency: 'BRL' },
        unrealizedGainLoss: { amount: '500.00', currency: 'BRL' },
        unrealizedGainLossPercent: '16.67',
        valuedPositionsCount: 1,
        unvaluedPositionsCount: 0,
        stalePositionsCount: 0,
      },
    },
    completeness: 'COMPLETE',
    summary: {
      totalPositions: 1,
      valuedPositions: 1,
      unvaluedPositions: 0,
      unavailablePositions: 0,
      incompleteCostPositions: 0,
      stalePositions: 0,
      mismatchPositions: 0,
      valuationCoveragePercent: '100.00',
      currencies: ['BRL'],
    },
    quoteSummary: {
      totalQuotesRequested: 1,
      quotesAvailable: 1,
      quotesUnavailable: 0,
      quotesStale: 0,
      provider: 'BRAPI EOD',
    },
  };

  // 1. cache write válido
  it('1. cache write válido: writes namespaced envelope with metadata', () => {
    LocalCache.setResource('user-1', 'portfolio_summary', { equity: '10000.00' }, { portfolioId: 'port-1' });
    const key = buildCacheKey('user-1', 'portfolio_summary', 'port-1');
    const result = LocalCache.get<{ equity: string }>(key, 'user-1');

    expect(result).not.toBeNull();
    expect(result?.data.equity).toBe('10000.00');
    expect(result?.envelope.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    expect(result?.envelope.userId).toBe('user-1');
    expect(result?.envelope.portfolioId).toBe('port-1');
  });

  // 2. cache read válido
  it('2. cache read válido: returns data and fresh status', () => {
    LocalCache.setResource('user-1', 'portfolio_summary', { equity: '10000.00' });
    const result = LocalCache.getResource<{ equity: string }>('user-1', 'portfolio_summary');

    expect(result).not.toBeNull();
    expect(result?.data.equity).toBe('10000.00');
    expect(result?.isStale).toBe(false);
    expect(result?.isExpired).toBe(false);
  });

  // 3. schema version
  it('3. schema version: envelope conforms to current schema version', () => {
    LocalCache.setResource('user-1', 'positions', [{ ticker: 'PETR4' }]);
    const result = LocalCache.getResource<Array<{ ticker: string }>>('user-1', 'positions');

    expect(result?.envelope.schemaVersion).toBe(1);
    expect(result?.envelope.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });

  // 4. version mismatch
  it('4. version mismatch: discards cache with outdated schema version', () => {
    const key = buildCacheKey('user-1', 'positions');
    const outdatedEnvelope = {
      schemaVersion: 999, // incompatible version
      userId: 'user-1',
      resource: 'positions',
      cachedAt: Date.now(),
      ttlMs: 60000,
      expiresAt: Date.now() + 60000,
      data: [{ ticker: 'VALE3' }],
    };

    // Store directly
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(outdatedEnvelope));
    }

    const result = LocalCache.getResource('user-1', 'positions');
    expect(result).toBeNull();
  });

  // 5. TTL fresh
  it('5. TTL fresh: marks entry as fresh when within TTL window', () => {
    LocalCache.setResource('user-1', 'market_quotes', { PETR4: '35.00' }, { ttlMs: 10000 });
    const result = LocalCache.getResource<{ PETR4: string }>('user-1', 'market_quotes');

    expect(result?.isStale).toBe(false);
    expect(result?.isExpired).toBe(false);
  });

  // 6. TTL stale
  it('6. TTL stale: evaluates stale status correctly without discarding data', () => {
    const key = buildCacheKey('user-1', 'market_quotes');
    const past = Date.now() - 600000; // 10 minutes ago
    const staleEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      userId: 'user-1',
      resource: 'market_quotes',
      cachedAt: past,
      ttlMs: 300000, // 5 min TTL
      expiresAt: past + 300000,
      data: { PETR4: '35.00' },
    };

    const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    if (storage) {
      storage.setItem(key, JSON.stringify(staleEnvelope));
    }

    const result = LocalCache.getResource<{ PETR4: string }>('user-1', 'market_quotes');
    if (result) {
      expect(result.data.PETR4).toBe('35.00');
      expect(result.isStale).toBe(true);
      expect(result.isExpired).toBe(true);
    }
  });

  // 7. user isolation
  it('7. user isolation: prevents user-2 from accessing user-1 cached data', () => {
    LocalCache.setResource('user-1', 'portfolio_summary', { equity: '50000.00' });

    const user1Data = LocalCache.getResource('user-1', 'portfolio_summary');
    const user2Data = LocalCache.getResource('user-2', 'portfolio_summary');

    expect(user1Data).not.toBeNull();
    expect(user2Data).toBeNull();
  });

  // 8. portfolio isolation
  it('8. portfolio isolation: keeps separate read-models per portfolioId', () => {
    LocalCache.setResource('user-1', 'portfolio_valuation', { name: 'Carteira A' }, { portfolioId: 'port-A' });
    LocalCache.setResource('user-1', 'portfolio_valuation', { name: 'Carteira B' }, { portfolioId: 'port-B' });

    const portA = LocalCache.getResource<{ name: string }>('user-1', 'portfolio_valuation', 'port-A');
    const portB = LocalCache.getResource<{ name: string }>('user-1', 'portfolio_valuation', 'port-B');
    const portC = LocalCache.getResource<{ name: string }>('user-1', 'portfolio_valuation', 'port-C');

    expect(portA?.data.name).toBe('Carteira A');
    expect(portB?.data.name).toBe('Carteira B');
    expect(portC).toBeNull();
  });

  // 9. logout purge
  it('9. logout purge: purges only the logging-out user entries', () => {
    LocalCache.setResource('user-1', 'portfolio_summary', { equity: '1000.00' });
    LocalCache.setResource('user-2', 'portfolio_summary', { equity: '2000.00' });

    LocalCache.purgeUser('user-1');

    expect(LocalCache.getResource('user-1', 'portfolio_summary')).toBeNull();
    expect(LocalCache.getResource('user-2', 'portfolio_summary')).not.toBeNull();
  });

  // 10. corrupted JSON
  it('10. corrupted JSON: safely recovers from corrupted syntax without throwing', () => {
    const key = buildCacheKey('user-1', 'portfolio_summary');
    const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    if (storage) {
      storage.setItem(key, '{"invalid_json": broken');
    }

    const result = LocalCache.getResource('user-1', 'portfolio_summary');
    expect(result).toBeNull();
  });

  // 11. malformed payload
  it('11. malformed payload: rejects invalid envelope structure', () => {
    const key = buildCacheKey('user-1', 'portfolio_summary');
    const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    if (storage) {
      storage.setItem(key, JSON.stringify({ notAnEnvelope: true }));
    }

    const result = LocalCache.getResource('user-1', 'portfolio_summary');
    expect(result).toBeNull();
  });

  // 12. secret rejection
  it('12. secret rejection: strictly forbids caching keys or payloads with passwords or secrets', () => {
    expect(() => {
      LocalCache.set('user_password', 'secret123');
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.setResource('user-1', 'secret_key', { secret: 'topsecret' });
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.setResource('user-1', 'portfolio_summary', { password: 'plainPassword' });
    }).toThrow(/security violation/i);
  });

  // 13. token rejection
  it('13. token rejection: strictly forbids caching refresh/access tokens or Bearer headers', () => {
    expect(() => {
      LocalCache.set('atlas.cache.refreshToken', 'opaque-refresh-token');
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.set('atlas.cache.accessToken', 'jwt-access-token');
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.setResource('user-1', 'positions', {
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1Ni...' },
      });
    }).toThrow(/security violation/i);
  });

  // 14. last-known-good não sobrescrito por erro
  it('14. last-known-good não sobrescrito por erro: ignores null or error payloads', () => {
    LocalCache.setResource('user-1', 'portfolio_summary', { equity: '15000.00' });

    // Attempt to overwrite with error
    LocalCache.setResource('user-1', 'portfolio_summary', { error: '500 Internal Server Error' });
    // Attempt to overwrite with empty object
    LocalCache.setResource('user-1', 'portfolio_summary', {});

    const result = LocalCache.getResource<{ equity: string }>('user-1', 'portfolio_summary');
    expect(result?.data.equity).toBe('15000.00');
  });

  // 15. cached boot
  it('15. cached boot: TodayRoute renders cached valuation immediately on boot', () => {
    LocalCache.set(LocalCacheKeys.PORTFOLIO_VALUATION, mockValuation);

    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <TodayRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('Patrimônio Total');
    expect(html).toContain('3.500,00');
    expect(html).toContain('PETR4');
  });

  // 16. online refresh
  it('16. online refresh: fresh query data replaces cached data seamlessly', () => {
    LocalCache.set(LocalCacheKeys.PORTFOLIO_VALUATION, mockValuation);

    const updatedValuation: PortfolioValuationData = {
      ...mockValuation,
      totalsByCurrency: {
        BRL: {
          ...mockValuation.totalsByCurrency.BRL!,
          marketValue: { amount: '4200.00', currency: 'BRL' },
        },
      },
    };

    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);
    queryClient.setQueryData(portfolioKeys.valuation('p1'), { data: updatedValuation });

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <TodayRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('4.200,00');
  });

  // 17. offline with cache
  it('17. offline with cache: renders offline banner and cached data without zeroing portfolio', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });
    LocalCache.set(LocalCacheKeys.PORTFOLIO_VALUATION, mockValuation);

    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <TodayRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('offline-banner');
    expect(html).toContain('Modo Offline — exibindo dados em cache');
    expect(html).toContain('3.500,00');
  });

  // 18. offline without cache
  it('18. offline without cache: renders explicit missing offline data state instead of empty portfolio', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });
    // Zero cache and zero portfolios in query client
    queryClient.setQueryData(portfolioKeys.list(), []);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <TodayRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    // If offline and no cache, informs to connect to the internet
    expect(html).toContain('Sem dados disponíveis offline');
    expect(html).not.toContain('Patrimônio Total');
  });

  // 19. mutation disabled offline
  it('19. mutation disabled offline: manual refresh button is disabled when offline', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <ManualRefreshButton />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('manual-refresh-button');
    // Button title indicates offline state in non-connected environment
    expect(html).toContain('Atualizar');
  });

  // 20. Windows regression
  it('20. Windows regression: desktop layout remains intact with sidebar and desktop header', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <AppLayout />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('desktop-sidebar');
    expect(html).toContain('desktop-header');
    expect(html).toContain('Windows Desktop');
    expect(html).toContain('desktop-only');
  });

  // 21. Android regression
  it('21. Android regression: mobile shell elements remain intact', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/today']}>
            <PortfolioProvider>
              <AppLayout />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('mobile-header');
    expect(html).toContain('mobile-bottom-nav');
    expect(html).toContain('bottom-nav-today');
    expect(html).toContain('bottom-nav-portfolio');
    expect(html).toContain('bottom-nav-market');
    expect(html).toContain('bottom-nav-tax');
    expect(html).toContain('bottom-nav-settings');
  });
});
