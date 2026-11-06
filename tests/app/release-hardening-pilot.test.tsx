import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getRuntimeConfig } from '../../apps/atlas-app/src/config/runtime';
import {
  sanitizeLogString,
  generateSanitizedDiagnostics,
  recordDiagnosticError,
  clearDiagnosticErrorHistory,
  getDiagnosticErrorHistory,
  exportDiagnostics,
} from '../../apps/atlas-app/src/lib/diagnostics';
import { ErrorBoundary } from '../../apps/atlas-app/src/components/ui/ErrorBoundary';
import { SettingsRoute } from '../../apps/atlas-app/src/routes/SettingsRoute';

// Mock Auth and Portfolio providers
vi.mock('../../apps/atlas-app/src/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'usr-123', email: 'piloto@atlas.com.br', name: 'Investidor Piloto' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock('../../apps/atlas-app/src/providers/PortfolioProvider', () => ({
  usePortfolio: () => ({
    portfolios: [{ id: 'p-1', name: 'Carteira Principal' }],
    selectedPortfolio: { id: 'p-1', name: 'Carteira Principal' },
    selectPortfolio: vi.fn(),
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderHtml = (ui: React.ReactElement): string => {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

// Component that throws to test ErrorBoundary
const CrashingComponent: React.FC<{ shouldCrash: boolean }> = ({ shouldCrash }) => {
  if (shouldCrash) {
    throw new Error('Simulation of catastrophic client crash with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak');
  }
  return <div>Componente Saudavel</div>;
};

describe('Atlas Pilot Release Hardening & Diagnostics (APP-14)', () => {
  beforeEach(() => {
    clearDiagnosticErrorHistory();
    vi.restoreAllMocks();
  });

  describe('1. Versioning & Build Metadata (PARTE L & M)', () => {
    it('formalizes SemVer candidate version 0.1.0-pilot.1', () => {
      const config = getRuntimeConfig();
      expect(config.version).toBe('0.1.0-pilot.1');
      expect(config.version).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
    });

    it('exposes environment, commitSha, and build metadata without secrets', () => {
      const config = getRuntimeConfig();
      expect(['development', 'staging', 'pilot', 'production']).toContain(config.environment);
      expect(typeof config.commitSha).toBe('string');
      expect(config.commitSha.length).toBeGreaterThanOrEqual(7);
      expect(['debug', 'release']).toContain(config.buildType);
      expect(typeof config.buildDate).toBe('string');
    });
  });

  describe('2. Privacy Sanitization for Logs & Diagnostics (PARTE Q & S)', () => {
    it('masks Bearer authorization headers and raw JWT tokens', () => {
      const raw = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const sanitized = sanitizeLogString(raw);
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(sanitized).toContain('Bearer [MASKED_TOKEN]');
    });

    it('masks password strings in JSON payloads', () => {
      const raw = '{"email":"test@example.com","password":"SuperSecretPassword123!"}';
      const sanitized = sanitizeLogString(raw);
      expect(sanitized).not.toContain('SuperSecretPassword123!');
      expect(sanitized).toContain('"password":"[MASKED]"');
    });

    it('masks CPF numbers and formatted identifiers', () => {
      const raw = 'Investidor com CPF 123.456.789-00 realizou operacao';
      const sanitized = sanitizeLogString(raw);
      expect(sanitized).not.toContain('123.456.789-00');
      expect(sanitized).toContain('[MASKED_CPF]');
    });

    it('masks exact financial currency amounts', () => {
      const raw = 'Patrimonio total calculado em R$ 1.250.742,88 em 2026-11-05';
      const sanitized = sanitizeLogString(raw);
      expect(sanitized).not.toContain('1.250.742,88');
      expect(sanitized).toContain('[MASKED_AMOUNT]');
    });
  });

  describe('3. Crash Safety & React Error Boundary (PARTE T)', () => {
    it('renders normal children when no error occurs', () => {
      const html = renderHtml(
        <ErrorBoundary>
          <CrashingComponent shouldCrash={false} />
        </ErrorBoundary>,
      );
      expect(html).toContain('Componente Saudavel');
    });

    it('catches crashes via getDerivedStateFromError and displays user-friendly fallback', () => {
      const boundary = new ErrorBoundary({ children: <div /> });
      const testErr = new Error('Simulation of catastrophic client crash with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak');

      // Test static error derivation
      const derived = ErrorBoundary.getDerivedStateFromError(testErr);
      expect(derived.hasError).toBe(true);
      expect(derived.error).toBe(testErr);

      // Test componentDidCatch recording sanitized diagnostics
      boundary.componentDidCatch(testErr, { componentStack: '\n at CrashingComponent' });
      const history = getDiagnosticErrorHistory();
      expect(history.length).toBe(1);
      expect(history[0].message).toContain('Simulation of catastrophic client crash');
      expect(history[0].message).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(history[0].message).toContain('[MASKED_TOKEN]');
    });
  });

  describe('4. Diagnostic Package Generation & Export (PARTE S)', () => {
    it('generates structured diagnostic package without sensitive personal credentials', () => {
      recordDiagnosticError(new Error('Sample caught warning'));

      const pkg = generateSanitizedDiagnostics({
        isAuthenticated: true,
        hasActivePortfolio: true,
      });

      expect(pkg.app.name).toBe('Atlas');
      expect(pkg.app.version).toBe('0.1.0-pilot.1');
      expect(pkg.device.platform).toBeDefined();
      expect(pkg.session.isAuthenticated).toBe(true);
      expect(pkg.session.hasActivePortfolio).toBe(true);
      expect(pkg.recentErrors.length).toBe(1);
      expect(pkg.recentErrors[0].message).toBe('Sample caught warning');
      expect(pkg.exportedAt).toBeDefined();
    });

    it('exports diagnostics safely without throwing', async () => {
      const res = await exportDiagnostics();
      expect(res.success).toBe(true);
      expect(['download', 'clipboard']).toContain(res.mode);
      const parsed = JSON.parse(res.content);
      expect(parsed.app.version).toBe('0.1.0-pilot.1');
      expect(parsed.app.commitSha).toBeDefined();
    });
  });

  describe('5. Settings Route Pilot Version & Diagnostic Integration (PARTE L & S)', () => {
    it('renders app version, build SHA, and environment in SettingsRoute', () => {
      const html = renderHtml(<SettingsRoute />);

      expect(html).toContain('v0.1.0-pilot.1');
      expect(html).toContain('03dfe82');
      expect(html).toContain('Ambiente e Plataforma');
      expect(html).toContain('Exportar Diagnóstico Sanitizado');
    });
  });
});
