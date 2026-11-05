import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { usePortfolio } from '../providers/PortfolioProvider';
import {
  FileDropzone,
  ImportPreviewSection,
  ConfirmationGateSection,
  ImportReceiptCard,
  ImportHistorySection,
  ReviewInboxSection,
} from '../features/imports/components';
import {
  usePreviewImport,
  useConfirmImport,
  useImportRuns,
  useRetryImportRun,
  useIntegrationReviews,
  usePendingReviewsCount,
} from '../features/imports/hooks';
import { getConfirmEligibility } from '../features/imports/helpers';
import { Card, EmptyState, Badge, OfflineBanner } from '../components/ui';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import type { SelectedFilePayload } from '../features/imports/components/FileDropzone';
import type { RowDecisionState } from '../features/imports/helpers';
import type { RowDecision, ConfirmPayload } from '../features/imports/types';

export const ImportRoute: React.FC = () => {
  const navigate = useNavigate();
  const { selectedPortfolio, selectedPortfolioId } = usePortfolio();
  const { isOnline } = useAppLifecycle();

  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'reviews'>('new');
  const [selectedFile, setSelectedFile] = useState<SelectedFilePayload | null>(null);
  const [decisions, setDecisions] = useState<Record<number, RowDecisionState>>({});
  const [reviewSeverity, setReviewSeverity] = useState<string>('ALL');

  // Hooks
  const previewMutation = usePreviewImport(selectedPortfolioId);
  const confirmMutation = useConfirmImport(selectedPortfolioId);
  const { data: runsData, isLoading: isLoadingRuns } = useImportRuns(selectedPortfolioId);
  const retryRunMutation = useRetryImportRun(selectedPortfolioId);
  const { data: reviewsData, isLoading: isLoadingReviews } = useIntegrationReviews({
    portfolioId: selectedPortfolioId ?? undefined,
    severity: reviewSeverity,
  });
  const { data: pendingCount = 0 } = usePendingReviewsCount();

  const preview = previewMutation.data ?? null;
  const receipt = confirmMutation.data ?? null;

  // File Handling
  const handleFileSelect = (payload: SelectedFilePayload) => {
    setSelectedFile(payload);
    setDecisions({});
    previewMutation.reset();
    confirmMutation.reset();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setDecisions({});
    previewMutation.reset();
    confirmMutation.reset();
  };

  // Decisions
  const handleToggleSkip = (rowNumber: number) => {
    setDecisions((prev) => {
      const current = prev[rowNumber] ?? { skipped: false, forceImport: false };
      return {
        ...prev,
        [rowNumber]: { ...current, skipped: !current.skipped },
      };
    });
  };

  const handleToggleForce = (rowNumber: number) => {
    setDecisions((prev) => {
      const current = prev[rowNumber] ?? { skipped: false, forceImport: false };
      return {
        ...prev,
        [rowNumber]: { ...current, forceImport: !current.forceImport },
      };
    });
  };

  // Eligibility
  const eligibility = useMemo(() => {
    if (!preview) return null;
    const rows = preview.candidates.map((c) => ({
      candidate: c,
      decision: decisions[c.rowNumber],
    }));
    return getConfirmEligibility(rows);
  }, [preview, decisions]);

  // Actions
  const handleAnalyzeFile = () => {
    if (!isOnline || !selectedFile || !selectedPortfolioId) return;
    previewMutation.mutate({
      sourceType: selectedFile.hint.sourceType,
      fileName: selectedFile.name,
      content: selectedFile.content,
      provider: selectedFile.isXlsx ? 'B3' : 'Corretora',
    });
  };

  const handleConfirmImport = () => {
    if (!isOnline || !preview || !selectedFile || !selectedPortfolioId) return;

    const rowDecisions: RowDecision[] = Object.entries(decisions).map(([rowStr, dec]) => ({
      rowNumber: Number(rowStr),
      action: dec.skipped ? 'skip' : 'import',
      ...(dec.resolution
        ? {
            resolution: {
              type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT' as const,
              reason: dec.resolution.reason,
              declaredSettlementDate: dec.resolution.declaredSettlementDate,
            },
          }
        : {}),
    }));

    const payload: ConfirmPayload = {
      sourceType: selectedFile.hint.sourceType,
      fileName: selectedFile.name,
      content: selectedFile.content,
      provider: selectedFile.isXlsx ? 'B3' : 'Corretora',
      decisions: rowDecisions,
      ...(preview.runId ? { runId: preview.runId } : {}),
    };

    confirmMutation.mutate(payload);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setDecisions({});
    previewMutation.reset();
    confirmMutation.reset();
  };

  if (!selectedPortfolio) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Card>
          <EmptyState
            title="Nenhuma carteira ativa"
            description="Selecione ou crie uma carteira no topo para gerenciar importações e conciliação."
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: `${spacing.xl}px` }}>
      {/* Route Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.textPrimary, margin: '0 0 4px 0' }}>
          Importações & Conciliação
        </h1>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          Carteira ativa: <strong style={{ color: colors.textPrimary }}>{selectedPortfolio.name}</strong> ·
          Importe extratos B3/CSV, visualize a prévia e reconcilie divergências no livro-razão.
        </p>
      </div>

      {/* Offline Alert */}
      <OfflineBanner
        isOffline={!isOnline}
        message="Modo Offline — importações e conciliações exigem conexão online com o servidor"
      />

      {/* Tabs Subnavigation */}
      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: `${spacing.sm}px`,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: `${borderRadius.md}px`,
            fontSize: '0.875rem',
            fontWeight: activeTab === 'new' ? 600 : 500,
            border: 'none',
            backgroundColor: activeTab === 'new' ? `${colors.accent}15` : 'transparent',
            color: activeTab === 'new' ? colors.accent : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Nova Importação
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: `${borderRadius.md}px`,
            fontSize: '0.875rem',
            fontWeight: activeTab === 'history' ? 600 : 500,
            border: 'none',
            backgroundColor: activeTab === 'history' ? `${colors.accent}15` : 'transparent',
            color: activeTab === 'history' ? colors.accent : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Histórico de Execuções
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: `${borderRadius.md}px`,
            fontSize: '0.875rem',
            fontWeight: activeTab === 'reviews' ? 600 : 500,
            border: 'none',
            backgroundColor: activeTab === 'reviews' ? `${colors.accent}15` : 'transparent',
            color: activeTab === 'reviews' ? colors.accent : colors.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            transition: 'all 0.15s ease',
          }}
        >
          <span>Pendências & Conciliação</span>
          {pendingCount > 0 && <Badge variant="warning">{pendingCount}</Badge>}
        </button>
      </div>

      {/* Tab 1: Nova Importação */}
      {activeTab === 'new' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xl}px` }}>
          {receipt ? (
            <ImportReceiptCard
              receipt={receipt}
              onNewImport={handleReset}
              onViewPortfolio={() => navigate('/portfolio')}
            />
          ) : (
            <>
              {/* Step 1: Dropzone */}
              <FileDropzone
                onFileSelect={handleFileSelect}
                onClear={handleClearFile}
                selectedFile={selectedFile}
                isLoading={previewMutation.isPending || confirmMutation.isPending}
              />

              {/* Step 2: Analyze Button (before preview) */}
              {selectedFile && !preview && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleAnalyzeFile}
                    disabled={previewMutation.isPending}
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: `${borderRadius.md}px`,
                      backgroundColor: colors.accent,
                      color: '#FFFFFF',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: previewMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: previewMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    {previewMutation.isPending ? 'Analisando arquivo…' : 'Analisar Prévia'}
                  </button>
                </div>
              )}

              {/* Preview Error */}
              {previewMutation.isError && (
                <div
                  style={{
                    padding: `${spacing.md}px`,
                    backgroundColor: `${colors.negative}15`,
                    border: `1px solid ${colors.negative}40`,
                    borderRadius: `${borderRadius.md}px`,
                    color: colors.negative,
                    fontSize: '0.875rem',
                  }}
                >
                  ⚠️ Erro ao analisar o arquivo:{' '}
                  {previewMutation.error instanceof Error
                    ? previewMutation.error.message
                    : 'Falha desconhecida'}
                </div>
              )}

              {/* Step 3: Preview Section */}
              {preview && (
                <>
                  <ImportPreviewSection
                    preview={preview}
                    decisions={decisions}
                    onToggleSkip={handleToggleSkip}
                    onToggleForce={handleToggleForce}
                  />

                  {/* Step 4: Confirmation Gate */}
                  {eligibility && (
                    <ConfirmationGateSection
                      eligibility={eligibility}
                      isConfirming={confirmMutation.isPending}
                      onConfirm={handleConfirmImport}
                      onCancel={handleReset}
                    />
                  )}

                  {/* Confirm Error */}
                  {confirmMutation.isError && (
                    <div
                      style={{
                        padding: `${spacing.md}px`,
                        backgroundColor: `${colors.negative}15`,
                        border: `1px solid ${colors.negative}40`,
                        borderRadius: `${borderRadius.md}px`,
                        color: colors.negative,
                        fontSize: '0.875rem',
                      }}
                    >
                      ⚠️ Erro ao confirmar importação:{' '}
                      {confirmMutation.error instanceof Error
                        ? confirmMutation.error.message
                        : 'Falha desconhecida'}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: Histórico de Execuções */}
      {activeTab === 'history' && (
        <ImportHistorySection
          runs={runsData?.data ?? []}
          isLoading={isLoadingRuns}
          onRetryRun={(runId) => retryRunMutation.mutate(runId)}
          isRetrying={retryRunMutation.isPending}
        />
      )}

      {/* Tab 3: Pendências & Conciliação */}
      {activeTab === 'reviews' && (
        <ReviewInboxSection
          reviews={reviewsData?.data ?? []}
          isLoading={isLoadingReviews}
          selectedSeverity={reviewSeverity}
          onSelectSeverity={setReviewSeverity}
        />
      )}
    </div>
  );
};
