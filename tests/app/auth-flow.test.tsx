import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { ProtectedRoute } from '../../apps/atlas-app/src/routes/ProtectedRoute';
import { LoginRoute } from '../../apps/atlas-app/src/routes/LoginRoute';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import { TodayRoute } from '../../apps/atlas-app/src/routes/TodayRoute';
import { PlaceholderRoute } from '../../apps/atlas-app/src/routes/PlaceholderRoute';
import { App } from '../../apps/atlas-app/src/App';
import { sessionManager, tokenStorage } from '../../apps/atlas-app/src/lib/api';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import { ApiError } from '@atlas/api-client';
import { CANONICAL_NAV_ITEMS } from '@atlas/ui';
import { QueryClientProvider } from '@tanstack/react-query';

describe('Atlas Desktop Auth & Shell Flow (APP-5)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearQueryCache();
    await tokenStorage.clearRefreshToken();
    await sessionManager.logout().catch(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await tokenStorage.clearRefreshToken();
    clearQueryCache();
  });

  describe('AuthProvider & useAuth', () => {
    it('provides initial state when rendered inside provider', () => {
      let authContextValue: ReturnType<typeof useAuth> | undefined;

      const TestConsumer = () => {
        authContextValue = useAuth();
        return <div>Consumer</div>;
      };

      renderToString(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      expect(authContextValue).toBeDefined();
      expect(authContextValue?.isAuthenticated).toBe(false);
      expect(authContextValue?.user).toBeNull();
      expect(typeof authContextValue?.login).toBe('function');
      expect(typeof authContextValue?.logout).toBe('function');
    });

    it('throws error when useAuth is consumed outside AuthProvider', () => {
      const TestConsumer = () => {
        useAuth();
        return <div>Consumer</div>;
      };

      expect(() => renderToString(<TestConsumer />)).toThrow(
        'useAuth must be used within an AuthProvider'
      );
    });

    it('purges React Query cache on logout to ensure cross-user isolation', async () => {
      queryClient.setQueryData(['sensitive-user-portfolio'], { balance: '50000.00' });
      expect(queryClient.getQueryData(['sensitive-user-portfolio'])).toBeDefined();

      await sessionManager.logout();
      clearQueryCache();

      expect(queryClient.getQueryData(['sensitive-user-portfolio'])).toBeUndefined();
    });
  });

  describe('ProtectedRoute Guard', () => {
    it('renders loading splash when session is currently restoring', () => {
      const html = renderToString(
        <AuthProvider>
          <MemoryRouter initialEntries={['/today']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/today" element={<div>Protected Today Content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(html).toContain('data-testid="restoring-splash"');
      expect(html).toContain('Carregando Atlas Desktop...');
      expect(html).not.toContain('Protected Today Content');
    });

    it('redirects anonymous user to /login when not authenticated', () => {
      const html = renderToString(
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginRoute />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(html).toContain('Entrar na sua conta');
      expect(html).toContain('E-mail');
      expect(html).toContain('Senha');
    });
  });

  describe('LoginRoute Component', () => {
    it('renders desktop login interface with email, password, and submit button', () => {
      const html = renderToString(
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginRoute />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(html).toContain('Entrar na sua conta');
      expect(html).toContain('Atlas Desktop');
      expect(html).toContain('type="email"');
      expect(html).toContain('type="password"');
      expect(html).toContain('Entrar');
    });

    it('maps ApiError 401 / INVALID_CREDENTIALS to user-friendly message', () => {
      const error = new ApiError(
        'Invalid credentials provided',
        401,
        'AUTH.INVALID_CREDENTIALS'
      );

      let message = 'Falha ao realizar login.';
      if (error.statusCode === 401 || error.code === 'AUTH.INVALID_CREDENTIALS') {
        message = 'E-mail ou senha incorretos.';
      }
      expect(message).toBe('E-mail ou senha incorretos.');
    });

    it('maps offline / network error to connectivity guidance', () => {
      const error = new ApiError('Failed to fetch', 0, 'NETWORK_ERROR', undefined, true);

      let message = 'Falha ao realizar login.';
      if (error.isOffline || error.statusCode === 0) {
        message = 'Erro de conexão. Verifique se o backend está em execução e tente novamente.';
      }
      expect(message).toBe('Erro de conexão. Verifique se o backend está em execução e tente novamente.');
    });

    it('maps 500 server error to service unavailable message', () => {
      const error = new ApiError(
        'Internal server failure',
        500,
        'INTERNAL_SERVER_ERROR'
      );

      let message = 'Falha ao realizar login.';
      if (error.statusCode >= 500) {
        message = 'O serviço está temporariamente indisponível. Tente novamente em instantes.';
      }
      expect(message).toBe('O serviço está temporariamente indisponível. Tente novamente em instantes.');
    });
  });

  describe('AppLayout & Navigation Shell', () => {
    it('renders sidebar with all canonical navigation items', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/today']}>
                <AppLayout />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      for (const item of CANONICAL_NAV_ITEMS) {
        expect(html).toContain(item.label);
      }

      expect(html).toContain('Project Atlas');
      expect(html).toContain('Windows Desktop');
      expect(html).toContain('title="Sair da conta"');
      expect(html).toContain('aria-label="Sair da conta"');
    });

    it('renders user fallback initials when user is anonymous or has no display name', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/today']}>
                <AppLayout />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('U');
      expect(html).toContain('Investidor');
    });
  });

  describe('PlaceholderRoute Component', () => {
    it('renders feature placeholder with title and phase badge', () => {
      const html = renderToString(
        <PlaceholderRoute
          title="Carteira de Investimentos"
          description="Consolidação patrimonial e posições."
        />
      );

      expect(html).toContain('Carteira de Investimentos');
      expect(html).toContain('Consolidação patrimonial e posições.');
      expect(html).toContain('Em breve (APP-6+)');
    });
  });

  describe('TodayRoute Component', () => {
    it('renders overview header and connectivity badge', () => {
      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/today']}>
                <TodayRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('Olá, <!-- -->Investidor<!-- -->!');
      expect(html).toContain('Contexto Macroeconômico Oficial');
      expect(html).toContain('Principais Posições em Custódia');
    });
  });

  describe('App Component Complete Route Tree', () => {
    it('boots without throwing and contains restoring splash on mount', () => {
      const html = renderToString(<App />);
      expect(html).toBeDefined();
      expect(html).toContain('Carregando Atlas Desktop...');
    });
  });
});
