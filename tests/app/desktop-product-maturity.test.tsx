import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { SettingsRoute } from '../../apps/atlas-app/src/routes/SettingsRoute';
import { LocalBackupCard, RestoreReadinessCard } from '../../apps/atlas-app/src/features/backup';
import { OperationalHealthSummary } from '../../apps/atlas-app/src/features/portfolio/components/OperationalHealthSummary';
import { ImportSourceGuidanceCard } from '../../apps/atlas-app/src/features/imports/components/ImportSourceGuidanceCard';
import { ReviewInboxSection } from '../../apps/atlas-app/src/features/imports/components/ReviewInboxSection';
import type { ReviewItem } from '../../apps/atlas-app/src/features/imports/types';

describe('Project Atlas — APP-16D: Desktop Product Maturity', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  describe('1. Local Backup UX & Retention (PARTE B, C, D, E, F)', () => {
    it('renders LocalBackupCard with backup action and cryptographic integrity info', () => {
      queryClient.setQueryData(['backups', 'status'], {
        lastBackup: {
          filename: 'atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql',
          filePath: 'C:\\Projetos\\atlas-invest\\backups\\atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql',
          checksumPath: 'C:\\Projetos\\atlas-invest\\backups\\atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql.sha256',
          checksumValid: true,
          sizeBytes: 262293,
          createdAt: '2026-11-09T10:00:00.000Z',
          isManual: true,
        },
        totalBackups: 5,
        backupDir: 'C:\\Projetos\\atlas-invest\\backups',
        backups: [],
        retentionSummary: { maxDaily: 7, maxWeekly: 4, maxMonthly: 3 },
      });

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <LocalBackupCard />
        </QueryClientProvider>
      );

      expect(html).toContain('Backup Local do Banco de Dados');
      expect(html).toContain('Criar Backup Agora');
      expect(html).toContain('SHA-256 Verificado');
      expect(html).toContain('256.1 KB');
      expect(html).toContain('7 diários • 4 semanais • 3 mensais');
    });

    it('renders RestoreReadinessCard with documented fail-safe recovery steps', () => {
      queryClient.setQueryData(['backups', 'status'], {
        lastBackup: {
          filename: 'atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql',
          filePath: 'C:\\Projetos\\atlas-invest\\backups\\atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql',
          checksumValid: true,
          sizeBytes: 262293,
          createdAt: '2026-11-09T10:00:00.000Z',
          isManual: true,
        },
        totalBackups: 1,
        backupDir: 'backups',
        backups: [],
        retentionSummary: { maxDaily: 7, maxWeekly: 4, maxMonthly: 3 },
      });

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <RestoreReadinessCard />
        </QueryClientProvider>
      );

      expect(html).toContain('Prontidão de Recuperação (Restore Readiness)');
      expect(html).toContain('Pronto para Contingência');
      expect(html).toContain('Procedimento de Recuperação Segura (Fail-Safe Restore)');
      expect(html).toContain('atlas_backup_atlas_local_manual_2026-11-09T10-00-00-000Z.sql');
    });
  });

  describe('2. Operational Health Summary (PARTE L, M, N)', () => {
    it('renders "Atlas em dia" pill when quotes are complete and backup is fresh', () => {
      queryClient.setQueryData(['backups', 'status'], {
        lastBackup: {
          filename: 'backup.sql',
          createdAt: new Date().toISOString(),
          sizeBytes: 200000,
        },
      });
      queryClient.setQueryData(['reviews', 'count'], 0);
      queryClient.setQueryData(['macro', 'context'], {
        data: {
          selicTarget: { rate: '14.25', source: 'BCB', effectiveDate: '2026-11-09' },
          selicEffective: { rate: '14.15', source: 'BCB', effectiveDate: '2026-11-09' },
          ipcaMonthly: { value: '0.44', source: 'IBGE', referenceMonth: '2026-10' },
          ibovespa: { value: '168498', source: 'BRAPI', status: 'AVAILABLE' },
          asOf: '2026-11-09',
          generatedAt: '2026-11-09T10:00:00Z',
        },
      });

      const mockValuation = {
        asOf: '2026-11-09',
        totalPositions: 36,
        positions: [],
        quoteSummary: {
          totalPositions: 36,
          quotesAvailable: 36,
          quotesStale: 0,
          percentageCovered: 100,
        },
      } as any;

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <OperationalHealthSummary valuation={mockValuation} />
        </QueryClientProvider>
      );

      expect(html).toContain('Atlas em dia');
      expect(html).toContain('36/36 cotações');
      expect(html).toContain('Backup verificado');
    });
  });

  describe('3. Import Daily Guidance & Workflow (PARTE J, K)', () => {
    it('renders 4-step workflow and supported format specifications', () => {
      const html = renderToString(<ImportSourceGuidanceCard />);

      expect(html).toContain('Fluxo Seguro de Importação &amp; Arquivos Suportados');
      expect(html).toContain('1');
      expect(html).toContain('Selecionar Arquivo');
      expect(html).toContain('2');
      expect(html).toContain('Preview &amp; Validação');
      expect(html).toContain('3');
      expect(html).toContain('Confirmação');
      expect(html).toContain('4');
      expect(html).toContain('Conciliação');
    });
  });

  describe('4. Review Inbox Actionable vs Historical Isolation (PARTE G, H, I)', () => {
    it('separates actionable items from historical superseded runs', () => {
      const mockReviews: ReviewItem[] = [
        {
          id: 'run-active',
          runId: 'run-active',
          portfolioId: 'p1',
          portfolioName: 'Carteira Principal',
          source: 'B3',
          trigger: 'MANUAL',
          status: 'AWAITING_REVIEW',
          severity: 'WARNING',
          reasonCodes: ['NEW_RECORDS'],
          metrics: {
            newRecords: 5,
            probableDuplicates: 0,
            conflicts: 0,
            unsupported: 0,
            invalid: 0,
            divergent: 0,
            missingLocal: 0,
            missingSource: 0,
            unresolved: 0,
            partial: false,
          },
          pairReview: { status: 'NOT_ACTIONABLE', totalPairs: 0, decidedPairs: 0 },
          createdAt: '2026-11-06T19:07:46.044Z',
          action: { kind: 'REVIEW_RUN', runId: 'run-active', portfolioId: 'p1' },
          isActionable: true,
          isHistorical: false,
          isInformative: false,
        },
        {
          id: 'run-historical-1',
          runId: 'run-historical-1',
          portfolioId: 'p1',
          portfolioName: 'Carteira Principal',
          source: 'B3',
          trigger: 'MANUAL',
          status: 'AWAITING_REVIEW',
          severity: 'WARNING',
          reasonCodes: ['NEW_RECORDS'],
          metrics: {
            newRecords: 9,
            probableDuplicates: 0,
            conflicts: 0,
            unsupported: 127,
            invalid: 0,
            divergent: 0,
            missingLocal: 0,
            missingSource: 0,
            unresolved: 0,
            partial: false,
          },
          pairReview: { status: 'NOT_ACTIONABLE', totalPairs: 0, decidedPairs: 0 },
          createdAt: '2026-11-06T18:35:00.000Z',
          action: { kind: 'REVIEW_RUN', runId: 'run-historical-1', portfolioId: 'p1' },
          isActionable: false,
          isHistorical: true,
          isInformative: false,
        },
      ];

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <ReviewInboxSection
            reviews={mockReviews}
            isLoading={false}
            selectedSeverity="ALL"
            onSelectSeverity={vi.fn()}
          />
        </QueryClientProvider>
      );

      expect(html).toContain('Ação Necessária');
      expect(html).toContain('Histórico');
      expect(html).toContain('Informativo');
      expect(html).toContain('Todas');
      // In default ACTIONABLE tab, only the active run is rendered
      expect(html).toContain('run-acti');
      expect(html).not.toContain('run-historical-1');
    });
  });

  describe('5. Settings Organization & Version Metadata (PARTE P, W)', () => {
    it('renders categorized tabs and accurate build metadata', () => {
      const html = renderToString(
        <AuthProvider runtimeMode="DESKTOP_LOCAL_OWNER">
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <PortfolioProvider>
                <SettingsRoute />
              </PortfolioProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('Perfil &amp; Configurações');
      expect(html).toContain('Todas as Seções');
      expect(html).toContain('Perfil');
      expect(html).toContain('Mercado');
      expect(html).toContain('Backup');
      expect(html).toContain('Notificações');
      expect(html).toContain('Diagnóstico');
      expect(html).toContain('Sistema');
      expect(html).toContain('Estratégia de Atualização &amp; Manutenção Local');
      expect(html).toContain('atlas_local (Porta 5434)');
    });
  });
});
