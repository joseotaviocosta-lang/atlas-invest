import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { getRuntimeConfig } from '../../apps/atlas-app/src/config/runtime';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import { apiClient, sessionManager, tokenStorage } from '../../apps/atlas-app/src/lib/api';
import { RootRoute } from '../../apps/atlas-app/src/routes/RootRoute';
import { App } from '../../apps/atlas-app/src/App';
import { colors, spacing, borderRadius } from '@atlas/ui';

describe('Atlas Desktop Foundation (APP-3)', () => {
  beforeEach(() => {
    clearQueryCache();
  });

  describe('Runtime Configuration', () => {
    it('provides default configuration with local API target and version', () => {
      const config = getRuntimeConfig();
      expect(config.version).toBe('0.1.0');
      expect(config.apiUrl).toContain('3001');
      expect(typeof config.isTauri).toBe('boolean');
    });

    it('detects Tauri native window when Tauri internals exist on window', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error test mock
      globalThis.window = { __TAURI_INTERNALS__: {} };

      const config = getRuntimeConfig();
      expect(config.isTauri).toBe(true);

      globalThis.window = originalWindow;
    });

    it('detects browser harness when Tauri internals are not present', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error test mock
      globalThis.window = {};

      const config = getRuntimeConfig();
      expect(config.isTauri).toBe(false);

      globalThis.window = originalWindow;
    });
  });

  describe('Query Client & Cache Isolation', () => {
    it('configures QueryClient with safe defaults for desktop', () => {
      const defaultOptions = queryClient.getDefaultOptions();
      expect(defaultOptions.queries?.retry).toBe(1);
      expect(defaultOptions.queries?.staleTime).toBe(120000);
      expect(defaultOptions.mutations?.retry).toBe(0);
    });

    it('clears query cache safely upon session transition', () => {
      queryClient.setQueryData(['test-key'], { value: 123 });
      expect(queryClient.getQueryData(['test-key'])).toEqual({ value: 123 });

      clearQueryCache();
      expect(queryClient.getQueryData(['test-key'])).toBeUndefined();
    });
  });

  describe('API Client Integration', () => {
    it('initializes shared ApiClient with configured baseUrl', () => {
      expect(apiClient).toBeDefined();
      expect(apiClient.getBaseUrl()).toBe(getRuntimeConfig().apiUrl);
    });

    it('initializes SessionManager with tokenStorage and initial unauthenticated/anonymous state', () => {
      expect(sessionManager).toBeDefined();
      expect(sessionManager.getAuthState().status).toBe('anonymous');
    });

    it('supports memory secure token storage operations', async () => {
      await tokenStorage.setRefreshToken('test-refresh-token');
      expect(await tokenStorage.getRefreshToken()).toBe('test-refresh-token');

      await tokenStorage.clearRefreshToken();
      expect(await tokenStorage.getRefreshToken()).toBeNull();
    });
  });

  describe('UI & Design Tokens Integration', () => {
    it('uses canonical @atlas/ui tokens in RootRoute layout', () => {
      expect(colors.background).toBeDefined();
      expect(colors.surface).toBeDefined();
      expect(colors.positive).toBeDefined();
      expect(spacing.xl).toBeDefined();
      expect(borderRadius.lg).toBeDefined();
    });

    it('renders RootRoute with Atlas branding and foundation status', () => {
      const html = renderToString(<RootRoute />);
      expect(html).toContain('Atlas');
      expect(html).toContain('Desktop Foundation');
      expect(html).toContain('Windows Native');
      expect(html).toContain('v0.1.0');
      expect(html).toContain(getRuntimeConfig().apiUrl);
    });

    it('renders full App shell with router and providers without throwing', () => {
      const html = renderToString(<App />);
      expect(html).toContain('Atlas');
      expect(html).toContain('Carregando Atlas Desktop');
    });
  });
});

