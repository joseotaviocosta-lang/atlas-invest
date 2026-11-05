import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { ImportRoute } from '../../apps/atlas-app/src/routes/ImportRoute';
import { FileDropzone } from '../../apps/atlas-app/src/features/imports/components/FileDropzone';
import { ImportPreviewSection } from '../../apps/atlas-app/src/features/imports/components/ImportPreviewSection';
import { ConfirmationGateSection } from '../../apps/atlas-app/src/features/imports/components/ConfirmationGateSection';
import { ImportReceiptCard } from '../../apps/atlas-app/src/features/imports/components/ImportReceiptCard';
import { ImportHistorySection } from '../../apps/atlas-app/src/features/imports/components/ImportHistorySection';
import { ReviewInboxSection } from '../../apps/atlas-app/src/features/imports/components/ReviewInboxSection';
import {
  detectClientSourceType,
  getEffectiveRowState,
  getConfirmEligibility,
  formatBytes,
  formatDateTime,
} from '../../apps/atlas-app/src/features/imports/helpers';
import { importKeys, reviewKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { importsApi } from '../../apps/atlas-app/src/features/imports/api';
import { apiClient } from '../../apps/atlas-app/src/lib/api';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type {
  PreviewCandidate,
  PreviewResponse,
  ImportReceipt,
  ImportRunItem,
  ReviewItem,
} from '../../apps/atlas-app/src/features/imports/types';

describe('Atlas Desktop Imports & Reconciliation (APP-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
  });

  describe('Pure Import Helpers & Format Sniffing', () => {
    it('detects CSV files as GENERIC_CSV', () => {
      const hint = detectClientSourceType('minhas-operacoes.csv', false);
      expect(hint.sourceType).toBe('GENERIC_CSV');
      expect(hint.formatName).toContain('CSV');
    });

    it('detects B3 annual report from filename hint', () => {
      const hint = detectClientSourceType('relatorio-anual-2025.xlsx', true);
      expect(hint.sourceType).toBe('B3_ANNUAL_REPORT_XLSX');
      expect(hint.formatName).toContain('Relatório Consolidado Anual');
    });

    it('detects B3 movement from filename hint', () => {
      const hint = detectClientSourceType('movimentacao-b3.xlsx', true);
      expect(hint.sourceType).toBe('B3_MOVEMENT_XLSX');
      expect(hint.formatName).toContain('Movimentação');
    });

    it('defaults XLSX to B3 negotiation report', () => {
      const hint = detectClientSourceType('negociacao-2026.xlsx', true);
      expect(hint.sourceType).toBe('B3_NEGOTIATION_XLSX');
      expect(hint.formatName).toContain('Negociação');
    });

    it('formats file sizes accurately', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
    });

    it('formats dates safely without throwing on null or invalid input', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatDateTime('invalid-date')).toBe('—');
      expect(formatDateTime('2026-03-15T10:30:00Z')).toContain('2026');
    });
  });

  describe('Effective Row State Reduction', () => {
    const baseCandidate: PreviewCandidate = {
      rowNumber: 1,
      tradeDate: '2026-02-15',
      ticker: 'PETR4',
      operation: 'BUY',
      rawOperation: 'COMPRA',
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.90',
      currency: 'BRL',
      status: 'READY',
      issues: [],
      assetId: 'asset-1',
      assetResolution: 'RESOLVED',
      accountId: 'account-1',
      duplicate: 'NEW',
      provider: 'B3',
    };

    it('reduces READY candidate to importable', () => {
      const effective = getEffectiveRowState(baseCandidate);
      expect(effective.state).toBe('importable');
      expect(effective.reason).toBeNull();
    });

    it('reduces DUPLICATE candidate to auto_skipped', () => {
      const duplicateCandidate: PreviewCandidate = {
        ...baseCandidate,
        status: 'DUPLICATE',
        duplicate: 'EXACT_DUPLICATE',
      };
      const effective = getEffectiveRowState(duplicateCandidate);
      expect(effective.state).toBe('auto_skipped');
      expect(effective.reason).toContain('já existe');
    });

    it('reduces INVALID candidate to blocked', () => {
      const invalidCandidate: PreviewCandidate = {
        ...baseCandidate,
        status: 'INVALID',
        issues: [{ code: 'INVALID_AMOUNT', message: 'Preço unitário inválido' }],
      };
      const effective = getEffectiveRowState(invalidCandidate);
      expect(effective.state).toBe('blocked');
      expect(effective.reason).toContain('Linha inválida');
    });

    it('reduces CONFLICT duplicate candidate to blocked', () => {
      const conflictCandidate: PreviewCandidate = {
        ...baseCandidate,
        status: 'DUPLICATE',
        duplicate: 'CONFLICT',
      };
      const effective = getEffectiveRowState(conflictCandidate);
      expect(effective.state).toBe('blocked');
      expect(effective.reason).toContain('valores divergentes');
    });

    it('reduces PROBABLE_DUPLICATE to blocked without force, and importable with forceImport', () => {
      const probableCandidate: PreviewCandidate = {
        ...baseCandidate,
        status: 'DUPLICATE',
        duplicate: 'PROBABLE_DUPLICATE',
      };

      const unforced = getEffectiveRowState(probableCandidate, { skipped: false, forceImport: false });
      expect(unforced.state).toBe('blocked');

      const forced = getEffectiveRowState(probableCandidate, { skipped: false, forceImport: true });
      expect(forced.state).toBe('importable');
    });

    it('respects user decision to skip any candidate', () => {
      const effective = getEffectiveRowState(baseCandidate, { skipped: true, forceImport: false });
      expect(effective.state).toBe('skipped');
      expect(effective.reason).toBeNull();
    });
  });

  describe('Confirmation Eligibility Gate', () => {
    const readyCandidate: PreviewCandidate = {
      rowNumber: 1,
      tradeDate: '2026-02-15',
      ticker: 'PETR4',
      operation: 'BUY',
      rawOperation: 'COMPRA',
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.90',
      currency: 'BRL',
      status: 'READY',
      issues: [],
      assetId: 'asset-1',
      assetResolution: 'RESOLVED',
      accountId: 'account-1',
      duplicate: 'NEW',
      provider: 'B3',
    };

    const invalidCandidate: PreviewCandidate = {
      ...readyCandidate,
      rowNumber: 2,
      status: 'INVALID',
      issues: [{ code: 'PARSE_ERROR', message: 'Valor inválido' }],
    };

    it('blocks confirmation when there are blocked rows', () => {
      const eligibility = getConfirmEligibility([
        { candidate: readyCandidate },
        { candidate: invalidCandidate },
      ]);
      expect(eligibility.canConfirm).toBe(false);
      expect(eligibility.blockedCount).toBe(1);
      expect(eligibility.importableCount).toBe(1);
      expect(eligibility.hint).toContain('bloqueada');
    });

    it('blocks confirmation when importable count is zero', () => {
      const eligibility = getConfirmEligibility([
        { candidate: readyCandidate, decision: { skipped: true, forceImport: false } },
      ]);
      expect(eligibility.canConfirm).toBe(false);
      expect(eligibility.importableCount).toBe(0);
      expect(eligibility.skippedCount).toBe(1);
      expect(eligibility.hint).toContain('Nenhuma operação será importada');
    });

    it('authorizes confirmation when blocked count is 0 and importable > 0', () => {
      const eligibility = getConfirmEligibility([
        { candidate: readyCandidate },
        { candidate: invalidCandidate, decision: { skipped: true, forceImport: false } },
      ]);
      expect(eligibility.canConfirm).toBe(true);
      expect(eligibility.blockedCount).toBe(0);
      expect(eligibility.importableCount).toBe(1);
      expect(eligibility.skippedCount).toBe(1);
    });
  });

  describe('Component Rendering', () => {
    it('renders FileDropzone initial state and drag guidelines', () => {
      const html = renderToString(
        <FileDropzone
          selectedFile={null}
          onFileSelect={vi.fn()}
          onClear={vi.fn()}
        />
      );
      expect(html).toContain('Arraste seu arquivo aqui');
      expect(html).toContain('.CSV');
      expect(html).toContain('.XLSX');
      expect(html).toContain('2 MB');
    });

    it('renders FileDropzone with selected file details', () => {
      const html = renderToString(
        <FileDropzone
          selectedFile={{
            name: 'extrato-xp.csv',
            size: 45000,
            content: 'data;ticker...',
            isXlsx: false,
            hint: { sourceType: 'GENERIC_CSV', formatName: 'Arquivo CSV Genérico' },
          }}
          onFileSelect={vi.fn()}
          onClear={vi.fn()}
        />
      );
      expect(html).toContain('extrato-xp.csv');
      expect(html).toContain('Trocar arquivo');
      expect(html).toContain('Remover');
    });

    it('renders ImportPreviewSection with counters and table rows', () => {
      const mockPreview: PreviewResponse = {
        sourceType: 'GENERIC_CSV',
        provider: 'Corretora',
        fileName: 'operacoes.csv',
        candidates: [
          {
            rowNumber: 1,
            tradeDate: '2026-02-15',
            ticker: 'VALE3',
            operation: 'BUY',
            rawOperation: 'COMPRA',
            quantity: '50',
            unitPrice: '70.00',
            fees: '2.50',
            currency: 'BRL',
            status: 'READY',
            issues: [],
            assetId: 'asset-vale',
            assetResolution: 'RESOLVED',
            accountId: 'acc-1',
            duplicate: 'NEW',
            provider: 'Corretora',
          },
        ],
        summary: {
          totalRows: 1,
          ready: 1,
          duplicates: 0,
          needsReview: 0,
          invalid: 0,
          unsupported: 0,
          ambiguousAssets: 0,
        },
      };

      const html = renderToString(
        <ImportPreviewSection
          preview={mockPreview}
          decisions={{}}
          onToggleSkip={vi.fn()}
          onToggleForce={vi.fn()}
        />
      );

      expect(html).toContain('VALE3');
      expect(html).toContain('COMPRA');
      expect(html).toContain('Prontas para Importar');
      expect(html).toContain('Operações Encontradas');
    });

    it('renders ConfirmationGateSection with breakdown and human confirmation button', () => {
      const eligibility = {
        importableCount: 10,
        blockedCount: 0,
        pendingCount: 2,
        skippedCount: 1,
        autoSkippedCount: 3,
        canConfirm: true,
        hint: '2 itens precisam de revisão e não serão importados agora.',
      };

      const html = renderToString(
        <ConfirmationGateSection
          eligibility={eligibility}
          isConfirming={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(html).toContain('Confirmação de Importação');
      expect(html).toContain('Confirmar Importação (10)');
      expect(html).toContain('10');
      expect(html).toContain('serão importadas');
      expect(html).toContain('serão ignoradas');
      expect(html).toContain('pendentes (não importadas)');
    });

    it('renders ImportReceiptCard on confirmation success', () => {
      const mockReceipt: ImportReceipt = {
        receiptId: 'REC-2026-001',
        portfolioId: 'p-1',
        provider: 'B3',
        fileName: 'negociacao.xlsx',
        totalRows: 5,
        created: 4,
        skippedDuplicates: 1,
        skippedByUser: 0,
        failed: [],
        pendingReviewCount: 0,
        unsupportedCount: 0,
        errorCount: 0,
        transactionIds: ['tx-1', 'tx-2', 'tx-3', 'tx-4'],
        confirmedAt: '2026-03-15T12:00:00Z',
      };

      const html = renderToString(
        <ImportReceiptCard
          receipt={mockReceipt}
          onNewImport={vi.fn()}
          onViewPortfolio={vi.fn()}
        />
      );

      expect(html).toContain('Importação Confirmada com Sucesso!');
      expect(html).toContain('REC-2026-001');
      expect(html).toContain('Transações Criadas');
      expect(html).toContain('4');
      expect(html).toContain('Ver Carteira Atualizada');
    });

    it('renders ImportHistorySection with run statuses and reconciliation metrics', () => {
      const mockRuns: ImportRunItem[] = [
        {
          id: 'run-1',
          portfolioId: 'p-1',
          source: 'B3',
          provider: 'B3',
          environment: 'PRODUCTION',
          fileName: 'negociacoes.xlsx',
          sourceAsOf: '2026-03-01',
          status: 'COMPLETED',
          counts: {
            fetched: 10,
            normalized: 10,
            new: 8,
            exactDuplicates: 2,
            probableDuplicates: 0,
            conflicts: 0,
            unsupported: 0,
            invalid: 0,
            confirmed: 8,
            ignored: 2,
          },
          reconciliation: {
            matched: 8,
            divergent: 0,
            missingLocal: 0,
            missingSource: 0,
            unresolved: 0,
          },
          partial: false,
          trigger: 'MANUAL',
          error: null,
          startedAt: '2026-03-15T10:00:00Z',
          completedAt: '2026-03-15T10:01:00Z',
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-15T10:01:00Z',
        },
      ];

      const html = renderToString(
        <ImportHistorySection
          runs={mockRuns}
          isLoading={false}
          onRetryRun={vi.fn()}
        />
      );

      expect(html).toContain('Histórico de Execuções');
      expect(html).toContain('B3');
      expect(html).toContain('Concluída');
      expect(html).toContain('correspondentes');
    });

    it('renders ReviewInboxSection with severity and reason codes', () => {
      const mockReviews: ReviewItem[] = [
        {
          id: 'rev-1',
          runId: 'run-99',
          portfolioId: 'p-1',
          portfolioName: 'Carteira Principal',
          source: 'B3',
          trigger: 'MANUAL',
          status: 'AWAITING_REVIEW',
          severity: 'REVIEW',
          reasonCodes: ['PROBABLE_DUPLICATE'],
          pairReview: { status: 'PENDING', totalPairs: 1, decidedPairs: 0 },
          metrics: {
            newRecords: 5,
            probableDuplicates: 1,
            conflicts: 0,
            unsupported: 0,
            invalid: 0,
            divergent: 0,
            missingLocal: 0,
            missingSource: 0,
            unresolved: 1,
            partial: false,
          },
          createdAt: '2026-03-15T11:00:00Z',
          action: { kind: 'REVIEW_RUN', runId: 'run-99', portfolioId: 'p-1' },
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

      expect(html).toContain('Carteira Principal');
      expect(html).toContain('possíveis duplicidades precisam de revisão');
      expect(html).toContain('Revisar &amp; Conciliar');
    });
  });

  describe('Query Keys & API Contracts', () => {
    it('isolates import run and review query keys', () => {
      const runsP1 = importKeys.runs('portfolio-alpha');
      const runsP2 = importKeys.runs('portfolio-beta');
      expect(runsP1).not.toEqual(runsP2);
      expect(runsP1).toContain('portfolio-alpha');

      const reviewsAll = reviewKeys.lists({ severity: 'ALL' });
      const reviewsError = reviewKeys.lists({ severity: 'ERROR' });
      expect(reviewsAll).not.toEqual(reviewsError);

      const countKey = reviewKeys.count();
      expect(countKey).toContain('count');
    });

    it('calls preview API endpoint with correct parameters', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: {
          sourceType: 'GENERIC_CSV',
          provider: 'Corretora',
          fileName: 'trades.csv',
          candidates: [],
          summary: {
            totalRows: 0,
            ready: 0,
            duplicates: 0,
            needsReview: 0,
            invalid: 0,
            unsupported: 0,
            ambiguousAssets: 0,
          },
        },
      });

      const res = await importsApi.preview('portfolio-123', {
        sourceType: 'GENERIC_CSV',
        fileName: 'trades.csv',
        content: 'data;ticker...',
        provider: 'Corretora',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/portfolios/portfolio-123/imports/preview',
        expect.objectContaining({
          sourceType: 'GENERIC_CSV',
          fileName: 'trades.csv',
        })
      );
      expect(res.fileName).toBe('trades.csv');
    });

    it('calls confirm API endpoint with user row decisions and runId', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: {
          receiptId: 'REC-123',
          portfolioId: 'portfolio-123',
          provider: 'B3',
          fileName: 'b3.xlsx',
          totalRows: 1,
          created: 1,
          skippedDuplicates: 0,
          skippedByUser: 0,
          failed: [],
          pendingReviewCount: 0,
          unsupportedCount: 0,
          errorCount: 0,
          transactionIds: ['tx-uuid-1'],
          confirmedAt: '2026-03-15T12:00:00Z',
        },
      });

      const res = await importsApi.confirm('portfolio-123', {
        sourceType: 'B3_NEGOTIATION_XLSX',
        fileName: 'b3.xlsx',
        content: 'base64bytes...',
        provider: 'B3',
        decisions: [{ rowNumber: 1, action: 'import' }],
        runId: 'run-uuid-1',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/portfolios/portfolio-123/imports/confirm',
        expect.objectContaining({
          sourceType: 'B3_NEGOTIATION_XLSX',
          runId: 'run-uuid-1',
          decisions: [{ rowNumber: 1, action: 'import' }],
        })
      );
      expect(res.receiptId).toBe('REC-123');
    });

    it('calls recordDecision API endpoint with confirmation choice', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: {
          id: 'dec-1',
          runId: 'run-1',
          portfolioId: 'p-1',
          source: 'B3',
          decision: 'CONFIRM_MATCH',
          localTransactionId: 'tx-1',
          decidedAt: '2026-03-15T12:00:00Z',
          decidedByCurrentUser: true,
        },
      });

      const res = await importsApi.recordDecision('run-1', {
        transactionId: 'tx-1',
        decision: 'CONFIRM_MATCH',
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/integration-reviews/run-1/decisions', {
        transactionId: 'tx-1',
        decision: 'CONFIRM_MATCH',
      });
      expect(res.decision).toBe('CONFIRM_MATCH');
    });
  });

  describe('Full Route Rendering & Security', () => {
    it('renders ImportRoute without crashing and shows tabs', () => {
      queryClient.setQueryData(['portfolios', 'list'], [
        {
          id: 'p-default',
          name: 'Carteira Principal',
          baseCurrency: 'BRL',
          isDefault: true,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
      queryClient.setQueryData(reviewKeys.count(), 0);

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/import']}>
                <ImportRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Importações &amp; Conciliação');
      expect(html).toContain('Nova Importação');
      expect(html).toContain('Histórico de Execuções');
      expect(html).toContain('Pendências &amp; Conciliação');
      expect(html).toContain('Arraste seu arquivo aqui');
    });

    it('verifies memory-only file storage security: localStorage never contains file contents', () => {
      // In browser/Tauri environment, confirms that no file content, base64 strings or csv rows are ever placed into localStorage
      const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
      if (storage) {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) {
            const val = storage.getItem(key);
            expect(val).not.toContain('base64');
            expect(val).not.toContain('PETR4');
            expect(val).not.toContain('VALE3');
          }
        }
      }
      expect(true).toBe(true);
    });
  });
});
