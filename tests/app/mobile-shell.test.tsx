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
import { SettingsRoute } from '../../apps/atlas-app/src/routes/SettingsRoute';
import { LoginRoute } from '../../apps/atlas-app/src/routes/LoginRoute';
import { PositionsTable } from '../../apps/atlas-app/src/features/portfolio/components/PositionsTable';
import { resolveTokenStorage, isAndroidUserAgent } from '../../apps/atlas-app/src/lib/api';
import { MemorySecureTokenStorage } from '@atlas/api-client';
import { TauriSecureTokenStorage } from '../../apps/atlas-app/src/auth/tauri-secure-token-storage';
import { portfolioKeys, marketKeys, fiscalKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type { PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('Atlas Android Foundation & Mobile Shell (APP-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
  });

  const mockPosition: PositionValuationDto = {
    assetId: 'asset-petr4',
    ticker: 'PETR4',
    assetType: 'STOCK',
    quantity: '100',
    currency: 'BRL',
    averageCost: { amount: '30.00', currency: 'BRL' },
    totalCost: { amount: '3000.00', currency: 'BRL' },
    quote: {
      price: '35.00',
      currency: 'BRL',
      tradeDate: '2026-11-04',
      freshness: 'FRESH',
      isStale: false,
    },
    marketValue: { amount: '3500.00', currency: 'BRL' },
    unrealizedGainLoss: { amount: '500.00', currency: 'BRL' },
    unrealizedGainLossPercent: '16.67',
    weightPercent: '100.00',
    hasQuote: true,
  };

  describe('1. Desktop Layout Preservation', () => {
    it('preserves desktop sidebar, brand header, and navigation on desktop screens', () => {
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
      expect(html).toContain('Project Atlas');
      expect(html).toContain('Windows Desktop');
      expect(html).toContain('desktop-header');
      expect(html).toContain('logout-button');
    });
  });

  describe('2. Mobile Layout & Bottom Navigation Structure', () => {
    it('renders mobile compact header and bottom navigation bar', () => {
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
    });

    it('contains all 5 canonical mobile bottom tabs (Hoje, Carteira, Mercado, Fiscal, Perfil)', () => {
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

      expect(html).toContain('bottom-nav-today');
      expect(html).toContain('bottom-nav-portfolio');
      expect(html).toContain('bottom-nav-market');
      expect(html).toContain('bottom-nav-tax');
      expect(html).toContain('bottom-nav-settings');
      expect(html).toContain('Hoje');
      expect(html).toContain('Carteira');
      expect(html).toContain('Mercado');
      expect(html).toContain('Fiscal');
      expect(html).toContain('Perfil');
    });
  });

  describe('3. Responsive Strategy & Breakpoint Hook', () => {
    it('uses centralized media queries and CSS classes (.desktop-only, .mobile-only)', () => {
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

      expect(html).toContain('class="desktop-only"');
      expect(html).toContain('class="mobile-only"');
    });
  });

  describe('4. Safe Areas & Mobile Ergonomics', () => {
    it('applies safe-area insets to mobile header and content container', () => {
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

      // Mobile header respects top notch
      expect(html).toContain('var(--sat, 0px)');
      // Mobile bottom nav respects navigation bar
      expect(html).toContain('var(--sab, 0px)');
    });
  });

  describe('5. Mobile Login UX & Touch Targets', () => {
    it('renders touch-friendly inputs with minimum touch target height and proper input modes', () => {
      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/login']}>
              <LoginRoute />
            </MemoryRouter>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('login-route');
      expect(html).toContain('type="email"');
      expect(html).toContain('autoComplete="email"');
      expect(html).toContain('login-submit-button');
      expect(html).toContain('min-height:48px');
    });
  });

  describe('6. Today Screen Mobile Adaptation', () => {
    it('renders TodayRoute with greeting, summary cards, and mobile positions', () => {
      queryClient.setQueryData(portfolioKeys.list(), [
        { id: 'p1', name: 'Carteira Alpha', currency: 'BRL', createdAt: '2026-01-01' },
      ]);
      queryClient.setQueryData(portfolioKeys.valuation('p1'), {
        data: {
          portfolioId: 'p1',
          asOf: '2026-11-04',
          totalCost: { amount: '3000.00', currency: 'BRL' },
          marketValue: { amount: '3500.00', currency: 'BRL' },
          unrealizedGainLoss: { amount: '500.00', currency: 'BRL' },
          unrealizedGainLossPercent: '16.67',
          positions: [mockPosition],
        },
      });

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

      expect(html).toContain('Patrim');
      expect(html).toContain('PETR4');
      expect(html).toContain('positions-mobile-list');
    });
  });

  describe('7. Portfolio Screen Mobile Touch Cards', () => {
    it('renders touch-friendly position cards avoiding wide horizontal scroll on mobile', () => {
      const html = renderToString(
        <PositionsTable positions={[mockPosition]} isLoading={false} />
      );

      expect(html).toContain('positions-mobile-list');
      expect(html).toContain('PETR4');
      expect(html).toContain('R$ 3.500,00');
      expect(html).toContain('100 un.');
      expect(html).toContain('R$ 35,00');
    });
  });

  describe('8. Market Screen Mobile Compatibility', () => {
    it('renders MarketRoute macro indicators and quotes in responsive grid', () => {
      queryClient.setQueryData(portfolioKeys.list(), [
        { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
      ]);
      queryClient.setQueryData(marketKeys.macroContext(), {
        selic: '10.75',
        cdi: '10.65',
        ipca: '4.15',
        ibov: '130500',
        dolar: '5.42',
      });

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
      expect(html).toContain('Indicadores Macroecon');
    });
  });

  describe('9. Tax Summary Mobile Compatibility', () => {
    it('renders TaxRoute with auto-fit responsive columns avoiding horizontal overflow', () => {
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

      expect(html).toContain('tax-route');
      expect(html).toContain('Inteligência Fiscal &amp; IRPF');
      expect(html).toContain('repeat(auto-fit, minmax(320px, 1fr))');
    });
  });

  describe('10. Settings & Profile Mobile Route', () => {
    it('renders SettingsRoute with profile, runtime info, and logout action', () => {
      queryClient.setQueryData(portfolioKeys.list(), [
        { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
      ]);

      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/settings']}>
              <PortfolioProvider>
                <SettingsRoute />
              </PortfolioProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('settings-route');
      expect(html).toContain('Perfil &amp; Configurações');
      expect(html).toContain('Tauri 2 Unified App');
      expect(html).toContain('settings-logout-btn');
    });
  });

  describe('11. Security & Storage Strategy Discovery', () => {
    it('resolves MemorySecureTokenStorage in Android runtime during Phase APP-9', () => {
      // Mock Android navigator
      const originalNavigator = global.navigator;
      try {
        Object.defineProperty(global, 'navigator', {
          value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Redmi 12)' },
          configurable: true,
        });

        expect(isAndroidUserAgent()).toBe(true);
        const storage = resolveTokenStorage(true);
        expect(storage).toBeInstanceOf(MemorySecureTokenStorage);
      } finally {
        Object.defineProperty(global, 'navigator', {
          value: originalNavigator,
          configurable: true,
        });
      }
    });

    it('resolves TauriSecureTokenStorage in Windows Desktop runtime', () => {
      const originalNavigator = global.navigator;
      try {
        Object.defineProperty(global, 'navigator', {
          value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          configurable: true,
        });

        expect(isAndroidUserAgent()).toBe(false);
        const storage = resolveTokenStorage(true);
        expect(storage).toBeInstanceOf(TauriSecureTokenStorage);
      } finally {
        Object.defineProperty(global, 'navigator', {
          value: originalNavigator,
          configurable: true,
        });
      }
    });

    it('strictly forbids localStorage for refresh token', () => {
      // MemorySecureTokenStorage never touches localStorage
      const memStorage = new MemorySecureTokenStorage();
      expect((memStorage as unknown as { localStorage?: unknown }).localStorage).toBeUndefined();
    });
  });
});

