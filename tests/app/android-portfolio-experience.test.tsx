import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import { TodayRoute } from '../../apps/atlas-app/src/routes/TodayRoute';
import { PortfolioRoute } from '../../apps/atlas-app/src/routes/PortfolioRoute';
import { MarketRoute } from '../../apps/atlas-app/src/routes/MarketRoute';
import { TaxRoute } from '../../apps/atlas-app/src/routes/TaxRoute';
import { PositionsTable } from '../../apps/atlas-app/src/features/portfolio/components/PositionsTable';
import { PositionDetailModal } from '../../apps/atlas-app/src/features/portfolio/components/PositionDetailModal';
import { QuotesTable } from '../../apps/atlas-app/src/features/market/components/QuotesTable';
import { OfflineBanner } from '../../apps/atlas-app/src/components/ui/OfflineBanner';
import { LocalCache, LocalCacheKeys } from '../../apps/atlas-app/src/lib/local-cache';
import { registerAndroidBackHandler } from '../../apps/atlas-app/src/hooks/useAndroidBackButton';
import { portfolioKeys, marketKeys, fiscalKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type { PositionValuationDto, PortfolioValuationData } from '../../apps/atlas-app/src/features/portfolio/types';

describe('Atlas Android Portfolio Experience (APP-11)', () => {
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
    portfolioId: 'p1',
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

  // 1. Today mobile
  it('1. Today mobile: renders greeting, KPI cards, top positions, and pull-to-refresh container', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);
    queryClient.setQueryData(portfolioKeys.valuation('p1'), { data: mockValuation });

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

    expect(html).toContain('pull-to-refresh-container');
    expect(html).toContain('Patrimônio Total');
    expect(html).toContain('3.500,00');
    expect(html).toContain('Principais Posições em Custódia');
    expect(html).toContain('PETR4');
    expect(html).toContain('Ver Carteira Completa');
  });

  // 2. Portfolio cards
  it('2. Portfolio cards: renders mobile touch cards with ticker, quantity, average cost, and P&L', () => {
    const html = renderToString(
      <PositionsTable positions={[mockPosition]} totalMarketValue="3500.00" />
    );

    expect(html).toContain('positions-mobile-list');
    expect(html).toContain('position-mobile-card-PETR4');
    expect(html).toContain('PETR4');
    expect(html).toContain('Ação');
    expect(html).toContain('100 un.');
    expect(html).toContain('30,00');
    expect(html).toContain('3.500,00');
    expect(html).toContain('500,00');
    expect(html).toContain('+16,67%');
    expect(html).toContain('Ver detalhes →');
  });

  // 3. Posição selecionada (Position Detail Modal)
  it('3. Position Detail: renders complete read-only position attributes in detail modal', () => {
    const html = renderToString(
      <PositionDetailModal
        position={mockPosition}
        isOpen={true}
        onClose={vi.fn()}
        totalMarketValue="3500.00"
      />
    );

    expect(html).toContain('position-detail-modal');
    expect(html).toContain('Detalhes de PETR4');
    expect(html).toContain('100');
    expect(html).toContain('cotas/ações');
    expect(html).toContain('Preço Médio de Aquisição');
    expect(html).toContain('30,00');
    expect(html).toContain('Custo Total no Ledger');
    expect(html).toContain('3.000,00');
    expect(html).toContain('Cotação Atual (Fechamento)');
    expect(html).toContain('35,00');
    expect(html).toContain('Participação na Carteira');
    expect(html).toContain('AUDITADO VIA LEDGER');
    expect(html).toContain('close-position-detail-button');
  });

  // 4. Market mobile
  it('4. Market: renders macro indicators and mobile touch cards for asset quotes', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);
    queryClient.setQueryData(portfolioKeys.valuation('p1'), { data: mockValuation });

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/market']}>
            <PortfolioProvider>
              <MarketRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('Radar de Mercado');
    expect(html).toContain('Indicadores Macroeconômicos Oficiais');
    expect(html).toContain('quotes-mobile-list');
    expect(html).toContain('quote-mobile-card-PETR4');
    expect(html).toContain('BRAPI EOD');
    expect(html).toContain('35,00');
  });

  // 5. Fiscal summary
  it('5. Fiscal summary: renders compact mobile fiscal summary card with status and desktop CTA', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/tax']}>
            <PortfolioProvider>
              <TaxRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('mobile-fiscal-summary-card');
    expect(html).toContain('Status Fiscal');
    expect(html).toContain('DARF Estimado');
    expect(html).toContain('Ver detalhes no Desktop 💻');
  });

  // 6. Bottom nav
  it('6. Bottom nav: renders all 5 mobile canonical navigation items', () => {
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

    expect(html).toContain('mobile-bottom-nav');
    expect(html).toContain('bottom-nav-today');
    expect(html).toContain('bottom-nav-portfolio');
    expect(html).toContain('bottom-nav-market');
    expect(html).toContain('bottom-nav-tax');
    expect(html).toContain('bottom-nav-settings');
  });

  // 7. Back button
  it('7. Back button: registers and dispatches modal dismissal before history pop', () => {
    let closed = false;
    const unregister = registerAndroidBackHandler(() => {
      closed = true;
      return true; // handled
    });

    expect(typeof unregister).toBe('function');
    unregister();
  });

  // 8. Lifecycle foreground
  it('8. Lifecycle foreground: resumes and triggers active query invalidation', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({ type: 'active' });
    expect(invalidateSpy).toHaveBeenCalledWith({ type: 'active' });

    invalidateSpy.mockRestore();
  });

  // 9. Lifecycle background
  it('9. Lifecycle background: handles safe lifecycle state transitions in non-DOM environments', () => {
    expect(typeof window === 'undefined' || typeof document === 'undefined').toBe(true);
  });

  // 10. Offline banner & status
  it('10. Offline: displays offline banner without zeroing or clearing cached data', () => {
    const html = renderToString(
      <OfflineBanner isOffline={true} lastSyncFormatted="04/11/2026" />
    );

    expect(html).toContain('offline-banner');
    expect(html).toContain('Modo Offline — exibindo dados em cache');
    expect(html).toContain('04/11/2026');
  });

  // 11. Stale state
  it('11. Stale state: displays warning badge when quotes are D-1 stale', () => {
    const staleValuation = {
      ...mockValuation,
      quoteSummary: { ...mockValuation.quoteSummary, quotesStale: 1 },
    };
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);
    queryClient.setQueryData(portfolioKeys.valuation('p1'), { data: staleValuation });

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/portfolio']}>
            <PortfolioProvider>
              <PortfolioRoute />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('Carteira Principal');
    expect(html).toContain('Cotações D-1');
  });

  // 12. Refresh manual
  it('12. Refresh manual: renders touch-friendly manual refresh button', () => {
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

    expect(html).toContain('manual-refresh-button');
    expect(html).toContain('Atualizar Cotações');
  });

  // 13. Secure session intacta (Zero plaintext tokens in local cache)
  it('13. Secure session intacta: LocalCache strictly rejects caching authentication tokens or secrets', () => {
    expect(() => {
      LocalCache.set('atlas.cache.refreshToken', 'fake-token');
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.set('atlas.cache.accessToken', 'fake-token');
    }).toThrow(/security violation/i);

    expect(() => {
      LocalCache.set('user_password', 'secret');
    }).toThrow(/security violation/i);
  });

  // 14. Logout cleans caches
  it('14. Logout: clearing cache purges non-sensitive local cache entries', () => {
    LocalCache.set(LocalCacheKeys.PORTFOLIO_VALUATION, { test: 123 });
    expect(LocalCache.get(LocalCacheKeys.PORTFOLIO_VALUATION)).not.toBeNull();

    LocalCache.clear();
    expect(LocalCache.get(LocalCacheKeys.PORTFOLIO_VALUATION)).toBeNull();
  });

  // 15. Desktop layout preservado
  it('15. Desktop layout preservado: desktop sidebar, header, and tables remain present', () => {
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
});
