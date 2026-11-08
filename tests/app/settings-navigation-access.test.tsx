import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import { SettingsRoute } from '../../apps/atlas-app/src/routes/SettingsRoute';
import { portfolioKeys } from '../../apps/atlas-app/src/lib/query-keys';

describe('Project Atlas — APP-16A-R3: Settings Navigation Access', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    queryClient.setQueryData(['market-data-provider-status'], {
      data: {
        provider: 'BRAPI',
        configured: false,
        authenticated: false,
        mode: 'PUBLIC_LIMITED',
        maskedToken: null,
        message: 'Modo público limitado ativo. Insira um token da BRAPI para cobertura completa dos ativos.',
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders Configurações in the desktop sidebar with icon ⚙️ and destination /settings', () => {
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

    // Sidebar navigation exists
    expect(html).toContain('desktop-sidebar');

    // Canonical items present
    expect(html).toContain('Hoje');
    expect(html).toContain('Carteira');
    expect(html).toContain('Importar');
    expect(html).toContain('Mercado');
    expect(html).toContain('Fiscal');
    expect(html).toContain('IA');

    // Settings item present in desktop nav
    expect(html).toContain('Configurações');
    expect(html).toContain('⚙️');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('data-testid="desktop-nav-settings"');
  });

  it('highlights Configurações with active state when current route is /settings', () => {
    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/settings']}>
            <PortfolioProvider>
              <AppLayout />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    );

    // Active state aria-current="page" on settings link
    expect(html).toMatch(/data-testid="desktop-nav-settings"[^>]*aria-current="page"/);

    // Other links should not have aria-current="page"
    expect(html).not.toMatch(/data-testid="desktop-nav-today"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/data-testid="desktop-nav-portfolio"[^>]*aria-current="page"/);
  });

  it('renders MarketDataProviderCard inside SettingsRoute on /settings', () => {
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

    // Settings route root container
    expect(html).toContain('data-testid="settings-route"');

    // Title and sections
    expect(html).toContain('Perfil &amp; Configurações');
    expect(html).toContain('Ambiente e Plataforma');

    // Market data provider card and controls
    expect(html).toContain('data-testid="market-data-provider-card"');
    expect(html).toContain('Provedor de Mercado:');
    expect(html).toContain('BRAPI');
    expect(html).toContain('data-testid="market-provider-token-input"');
    expect(html).toContain('data-testid="market-provider-save-token-btn"');
    expect(html).toContain('Salvar Chave');
  });

  it('renders all canonical sidebar items in correct sequential order', () => {
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

    const todayIdx = html.indexOf('data-testid="desktop-nav-today"');
    const portfolioIdx = html.indexOf('data-testid="desktop-nav-portfolio"');
    const importIdx = html.indexOf('data-testid="desktop-nav-import"');
    const marketIdx = html.indexOf('data-testid="desktop-nav-market"');
    const taxIdx = html.indexOf('data-testid="desktop-nav-tax"');
    const aiIdx = html.indexOf('data-testid="desktop-nav-ai"');
    const settingsIdx = html.indexOf('data-testid="desktop-nav-settings"');

    expect(todayIdx).toBeGreaterThan(-1);
    expect(portfolioIdx).toBeGreaterThan(todayIdx);
    expect(importIdx).toBeGreaterThan(portfolioIdx);
    expect(marketIdx).toBeGreaterThan(importIdx);
    expect(taxIdx).toBeGreaterThan(marketIdx);
    expect(aiIdx).toBeGreaterThan(taxIdx);
    expect(settingsIdx).toBeGreaterThan(aiIdx);
  });
});
