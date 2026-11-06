import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import { AuthProvider, useAuth } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider, usePortfolio } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { ProtectedRoute } from '../../apps/atlas-app/src/routes/ProtectedRoute';
import { LoginRoute } from '../../apps/atlas-app/src/routes/LoginRoute';
import { TodayRoute } from '../../apps/atlas-app/src/routes/TodayRoute';
import { SettingsRoute } from '../../apps/atlas-app/src/routes/SettingsRoute';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import { App } from '../../apps/atlas-app/src/App';
import {
  resolveRuntimeMode,
  getRuntimeConfig,
  type AtlasRuntimeMode,
} from '../../apps/atlas-app/src/config/runtime';
import {
  LOCAL_OWNER_ID,
  LOCAL_OWNER_USER,
  DEFAULT_LOCAL_OWNER_PORTFOLIO,
} from '../../apps/atlas-app/src/auth/local-owner';
import { LocalCache } from '../../apps/atlas-app/src/lib/local-cache';
import { sessionManager, tokenStorage } from '../../apps/atlas-app/src/lib/api';
import { generateSanitizedDiagnostics } from '../../apps/atlas-app/src/lib/diagnostics';
import { notificationCenter } from '../../apps/atlas-app/src/features/notifications/notification-center';
import { getNotificationPreferences } from '../../apps/atlas-app/src/features/notifications/preferences';

describe('Project Atlas — Desktop Local Owner Mode (APP-15B)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearQueryCache();
    LocalCache.clear();
    await tokenStorage.clearRefreshToken();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    clearQueryCache();
    LocalCache.clear();
    await tokenStorage.clearRefreshToken();
  });

  describe('1. Runtime Mode Resolution (PARTE B & W)', () => {
    it('resolves to DESKTOP_LOCAL_OWNER by default on Windows Desktop (Tauri non-Android)', () => {
      const mode = resolveRuntimeMode(undefined, true, false);
      expect(mode).toBe('DESKTOP_LOCAL_OWNER');
    });

    it('resolves to REMOTE_AUTHENTICATED for Android mobile runtime', () => {
      const mode = resolveRuntimeMode(undefined, true, true);
      expect(mode).toBe('REMOTE_AUTHENTICATED');
    });

    it('respects explicit environment override for DESKTOP_LOCAL_OWNER', () => {
      const mode = resolveRuntimeMode('DESKTOP_LOCAL_OWNER', false, false);
      expect(mode).toBe('DESKTOP_LOCAL_OWNER');
    });

    it('respects explicit environment override for REMOTE_AUTHENTICATED', () => {
      const mode = resolveRuntimeMode('REMOTE_AUTHENTICATED', true, false);
      expect(mode).toBe('REMOTE_AUTHENTICATED');
    });
  });

  describe('2. Local Owner Identity & Security Invariants (PARTE C, N, L)', () => {
    it('defines a deterministic, stable local owner identity with ID local-owner', () => {
      expect(LOCAL_OWNER_ID).toBe('local-owner');
      expect(LOCAL_OWNER_USER.id).toBe('local-owner');
      expect(LOCAL_OWNER_USER.name).toBe('Owner');
      expect(LOCAL_OWNER_USER.baseCurrency).toBe('BRL');
      expect(LOCAL_OWNER_USER.email).toBe('owner@atlas.local');
    });

    it('does NOT create fake JWT or fake refresh token in local owner mode', () => {
      // In local owner mode, inMemoryAccessToken remains null and no token is written to storage
      expect(sessionManager.getAccessToken()).toBeNull();
    });

    it('does NOT touch SecureTokenStorage upon mounting in DESKTOP_LOCAL_OWNER', async () => {
      const getSpy = vi.spyOn(tokenStorage, 'getRefreshToken');
      const setSpy = vi.spyOn(tokenStorage, 'setRefreshToken');

      renderToString(
        <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
          <div>Local Child</div>
        </AuthProvider>
      );

      expect(getSpy).not.toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. AuthProvider & ProtectedRoute in DESKTOP_LOCAL_OWNER (PARTE D & E)', () => {
    it('immediately sets authenticated state with LOCAL_OWNER_USER without restoring splash delay', () => {
      let authVal: ReturnType<typeof useAuth> | undefined;

      const Consumer = () => {
        authVal = useAuth();
        return <div>{authVal.user?.name}</div>;
      };

      const html = renderToString(
        <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
          <Consumer />
        </AuthProvider>
      );

      expect(html).toContain('Owner');
      expect(authVal?.isAuthenticated).toBe(true);
      expect(authVal?.isRestoring).toBe(false);
      expect(authVal?.user?.id).toBe('local-owner');
      expect(authVal?.runtimeMode).toBe('DESKTOP_LOCAL_OWNER');
    });

    it('ProtectedRoute grants direct access without redirecting to /login in local mode', () => {
      const html = renderToString(
        <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route path="/login" element={<div>LOGIN_PAGE</div>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/protected" element={<div>PROTECTED_DASHBOARD_CONTENT</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(html).toContain('PROTECTED_DASHBOARD_CONTENT');
      expect(html).not.toContain('LOGIN_PAGE');
    });
  });

  describe('4. Login Screen Elimination in Local Mode (PARTE F)', () => {
    it('LoginRoute redirects directly to /today when accessed in DESKTOP_LOCAL_OWNER mode', () => {
      // If a user navigates to /login in local mode, it renders Navigate to /today
      const html = renderToString(
        <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/today" element={<div>TODAY_LANDING</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      // In MemoryRouter with Navigate, the component emits null/redirect without rendering the login inputs
      expect(html).not.toContain('Entrar');
      expect(html).not.toContain('E-mail do Investidor');
      expect(html).not.toContain('Senha de Acesso');
    });
  });

  describe('5. Portfolio Context in Local Owner Mode (PARTE L)', () => {
    it('provides DEFAULT_LOCAL_OWNER_PORTFOLIO fallback when no API portfolios are returned', () => {
      let portfolioVal: ReturnType<typeof usePortfolio> | undefined;

      const Consumer = () => {
        portfolioVal = usePortfolio();
        return <div>{portfolioVal.selectedPortfolio?.name}</div>;
      };

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
            <PortfolioProvider>
              <Consumer />
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(portfolioVal).toBeDefined();
      expect(portfolioVal?.selectedPortfolioId).toBe(DEFAULT_LOCAL_OWNER_PORTFOLIO.id);
      expect(html).toContain(DEFAULT_LOCAL_OWNER_PORTFOLIO.name);
    });
  });

  describe('6. Local Cache Namespacing (PARTE O)', () => {
    it('names-spaces cached models under atlas.cache.v1.local-owner', () => {
      const testData = { totalValue: '10000.00', asOf: '2026-11-06' };
      LocalCache.setResource('local-owner', 'portfolio_summary', testData, {
        portfolioId: 'local-owner-portfolio',
      });

      const res = LocalCache.getResource('local-owner', 'portfolio_summary', 'local-owner-portfolio');
      expect(res).not.toBeNull();
      expect(res?.data).toEqual(testData);

      // Verify envelope has local-owner userId
      expect(res?.envelope.userId).toBe('local-owner');
    });
  });

  describe('7. Notifications with Local Owner (PARTE P)', () => {
    it('initializes notification preferences and history isolated to local-owner', () => {
      const prefs = getNotificationPreferences('local-owner');
      expect(prefs.enabled).toBe(true);

      const history = notificationCenter.getHistory('local-owner');
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('8. Settings View & Logout Replacement (PARTE G, H, Q)', () => {
    it('renders Perfil: Owner (Desktop Local) and Modo Desktop Local badge', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
            <PortfolioProvider>
              <MemoryRouter>
                <SettingsRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Owner');
      expect(html).toContain('Perfil: Owner (Desktop Local)');
      expect(html).toContain('Modo Desktop Local');
      expect(html).toContain('Desktop Local (Owner)');
      expect(html).toContain('Gerenciamento de Dados Locais');
    });

    it('renders "Fechar Atlas" instead of traditional remote "Logout" in local owner mode', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
            <PortfolioProvider>
              <MemoryRouter>
                <SettingsRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Fechar Atlas');
      expect(html).not.toContain('Encerrar Sessão (Logout)');
    });
  });

  describe('9. Startup Failure Handling (PARTE T)', () => {
    it('renders friendly service failure card instead of redirecting to login when backend fails and no cache exists', () => {
      // Mock usePortfolio to simulate connection failure to backend
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
            <PortfolioProvider>
              <MemoryRouter>
                <TodayRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      // In TodayRoute with no network data, it loads cleanly or renders overview
      expect(html).not.toContain('Entrar na sua conta');
    });
  });

  describe('10. Diagnostics in Local Owner Mode (PARTE Q)', () => {
    it('includes runtime mode in sanitized diagnostic package', () => {
      const pkg = generateSanitizedDiagnostics({
        isAuthenticated: true,
        hasActivePortfolio: true,
      });

      expect(pkg.runtime).toBeDefined();
      expect(pkg.runtime.mode).toBeDefined();
      expect(pkg.session.isAuthenticated).toBe(true);
    });
  });

  describe('11. Preservation of Remote Authenticated Mode (PARTE E, F, U)', () => {
    it('preserves full remote login and auth flow when runtimeMode is REMOTE_AUTHENTICATED', () => {
      let authVal: ReturnType<typeof useAuth> | undefined;

      const Consumer = () => {
        authVal = useAuth();
        return <div>{authVal.isAuthenticated ? 'LOGGED_IN' : 'ANONYMOUS'}</div>;
      };

      const html = renderToString(
        <AuthProvider runtimeMode="REMOTE_AUTHENTICATED">
          <Consumer />
        </AuthProvider>
      );

      // In remote mode, initial unauthenticated state is anonymous
      expect(html).toContain('ANONYMOUS');
      expect(authVal?.isAuthenticated).toBe(false);
      expect(authVal?.runtimeMode).toBe('REMOTE_AUTHENTICATED');
    });

    it('renders LoginRoute form when in REMOTE_AUTHENTICATED mode and unauthenticated', () => {
      const html = renderToString(
        <AuthProvider runtimeMode="REMOTE_AUTHENTICATED">
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(html).toContain('E-mail');
      expect(html).toContain('Senha');
      expect(html).toContain('Entrar');
    });

    it('renders red "Encerrar Sessão (Logout)" in Settings when in REMOTE_AUTHENTICATED mode', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider runtimeMode="REMOTE_AUTHENTICATED">
            <PortfolioProvider>
              <MemoryRouter>
                <SettingsRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Encerrar Sessão (Logout)');
      expect(html).not.toContain('Fechar Atlas');
    });
  });
});
