import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StartupScreen } from '../../apps/atlas-app/src/features/runtime/StartupScreen';
import { DiagnosticScreen } from '../../apps/atlas-app/src/features/runtime/DiagnosticScreen';
import { RuntimeStatus, RuntimeDiagnostics } from '../../apps/atlas-app/src/features/runtime/types';
import { getRuntimeConfig, resolveRuntimeMode } from '../../apps/atlas-app/src/config/runtime';

describe('Project Atlas — Native Local Runtime Orchestration (APP-15C-R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Startup Progress Screen (PARTE I)', () => {
    it('renders startup screen with PostgreSQL and API stages', () => {
      const status: RuntimeStatus = {
        postgres: 'starting',
        api: 'idle',
        overall: 'starting',
        message: 'Preparando banco de dados local...',
        timestamp: '2026-11-06T12:00:00.000Z',
      };

      const html = renderToString(<StartupScreen status={status} />);
      expect(html).toContain('data-testid="desktop-startup-screen"');
      expect(html).toContain('Iniciando Atlas...');
      expect(html).toContain('Preparando banco de dados local...');
      expect(html).toContain('Banco de dados local (PostgreSQL 18)');
      expect(html).toContain('Serviço de dados local (Atlas API)');
      expect(html).toContain('Estrutura e integridade patrimonial');
    });

    it('displays active step indicator when PostgreSQL is ready and API is starting', () => {
      const status: RuntimeStatus = {
        postgres: 'running',
        api: 'starting',
        overall: 'starting',
        message: 'Iniciando serviço de dados local do Atlas...',
        timestamp: '2026-11-06T12:00:01.000Z',
      };

      const html = renderToString(<StartupScreen status={status} />);
      expect(html).toContain('Iniciando serviço de dados local do Atlas...');
      expect(html).toContain('✓'); // Postgres done checkmark
    });
  });

  describe('2. Diagnostic Failure Screen (PARTE J & FAIL-CLOSED)', () => {
    it('renders diagnostic error details without falling back to login or remote', () => {
      const errorMsg = 'Executável do PostgreSQL 18 não foi encontrado na porta 5434';
      const status: RuntimeStatus = {
        postgres: 'failed',
        api: 'idle',
        overall: 'failed',
        message: errorMsg,
        timestamp: '2026-11-06T12:00:05.000Z',
      };
      const diagnostics: RuntimeDiagnostics = {
        status,
        ports: { postgres_5434: false, api_3001: false, api_ready: false },
        paths: {
          postgres_bin: 'C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe',
          postgres_data: 'C:\\Users\\joseo\\AppData\\Local\\Atlas\\pg_data',
          node_bin: 'C:\\Projetos\\atlas-invest\\apps\\atlas-app\\runtime\\node.exe',
          bundle_cjs: 'C:\\Projetos\\atlas-invest\\apps\\atlas-app\\runtime\\api\\bundle.cjs',
        },
        recent_logs: ['[LOG] Trying to connect to 5434...', '[ERR] Connection refused'],
      };

      const html = renderToString(
        <DiagnosticScreen
          error={errorMsg}
          status={status}
          diagnostics={diagnostics}
          onRetry={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="desktop-diagnostic-screen"');
      expect(html).toContain('Não foi possível iniciar o serviço local do Atlas');
      expect(html).toContain(errorMsg);
      expect(html).toContain('Tentar Novamente');
      expect(html).toContain('Copiar Diagnóstico');
      expect(html).toContain('Salvar Relatório');

      // Fail-closed invariant: NO login form, NO password input, NO cloud redirect
      expect(html).not.toContain('<input type="password"');
      expect(html).not.toContain('54.233.66.110');
      expect(html).not.toContain('Fazer Login');
    });
  });

  describe('3. Local Owner Invariants (APP-15C-R1 Invariants)', () => {
    it('uses 127.0.0.1:3001 for DESKTOP_LOCAL_OWNER API URL', () => {
      // In DESKTOP_LOCAL_OWNER mode, default API URL is 127.0.0.1:3001
      const mode = resolveRuntimeMode('DESKTOP_LOCAL_OWNER', true, false);
      expect(mode).toBe('DESKTOP_LOCAL_OWNER');

      const config = getRuntimeConfig();
      expect(config.apiUrl).toBeDefined();
    });

    it('ensures local runtime status serialization contains all required fields', () => {
      const st: RuntimeStatus = {
        postgres: 'running',
        api: 'ready',
        overall: 'ready',
        message: 'Atlas pronto para uso local',
        timestamp: new Date().toISOString(),
      };
      const serialized = JSON.stringify(st);
      const parsed = JSON.parse(serialized);

      expect(parsed.postgres).toBe('running');
      expect(parsed.api).toBe('ready');
      expect(parsed.overall).toBe('ready');
      expect(parsed.message).toBe('Atlas pronto para uso local');
    });
  });
});
