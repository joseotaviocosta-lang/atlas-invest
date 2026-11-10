import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Skeleton, EmptyState, Select } from '../../../components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatQuantity } from '@atlas/ui';
import {
  COST_EVIDENCE_TYPE_LABELS,
  COST_EVIDENCE_STATUS_LABELS,
  COST_EVIDENCE_FAIL_CLOSED_DISCLOSURE,
  getEvidenceRowViewState,
} from '../cost-evidence-entry';
import { CostEvidenceModal } from './CostEvidenceModal';
import { CostAssessmentCard } from './CostAssessmentCard';
import {
  useCostEvidence,
  useCostEvidenceAssessment,
  usePortfolioAccounts,
  useSubmitCostEvidence,
  useVerifyCostEvidence,
  useRejectCostEvidence,
} from '../hooks';
import type { PositionValuationDto } from '../../portfolio/types';
import type { CostEvidenceRowDto } from '../types';

export interface CostEvidenceSectionProps {
  portfolioId: string;
  positions?: PositionValuationDto[];
  selectedAssetId?: string | null;
  autoOpenRegularize?: boolean;
  onNavigateBack?: () => void;
}

export const CostEvidenceSection: React.FC<CostEvidenceSectionProps> = ({
  portfolioId,
  positions = [],
  selectedAssetId: initialAssetId,
  autoOpenRegularize = false,
  onNavigateBack,
}) => {
  // 1. Identify incomplete positions
  const incompletePositions = positions.filter((p) => p.costBasisStatus === 'INCOMPLETE');

  // 2. Default to initialAssetId or first incomplete position or first available
  const [activeAssetId, setActiveAssetId] = useState<string>(() => {
    if (initialAssetId && positions.some((p) => p.assetId === initialAssetId)) {
      return initialAssetId;
    }
    if (incompletePositions.length > 0 && incompletePositions[0]?.assetId) {
      return incompletePositions[0].assetId;
    }
    return positions[0]?.assetId || '';
  });

  useEffect(() => {
    if (initialAssetId && positions.some((p) => p.assetId === initialAssetId)) {
      setActiveAssetId(initialAssetId);
    }
  }, [initialAssetId, positions]);

  const activePosition = positions.find((p) => p.assetId === activeAssetId);
  const activeTicker = activePosition?.ticker || activePosition?.assetId.slice(0, 6) || 'Ativo';

  // 3. Accounts query
  const { data: accounts = [], isLoading: isLoadingAccounts } = usePortfolioAccounts(portfolioId);
  const activeAccountId = accounts[0]?.id || '';

  // 4. Modal state
  const [isModalOpen, setIsModalOpen] = useState(autoOpenRegularize);

  useEffect(() => {
    if (autoOpenRegularize && activeAssetId) {
      setIsModalOpen(true);
    }
  }, [autoOpenRegularize, activeAssetId]);

  // 5. Cost evidence list & assessment queries
  const {
    data: evidenceRows = [],
    isLoading: isLoadingList,
    refetch: refetchList,
  } = useCostEvidence(portfolioId, {
    accountId: activeAccountId || undefined,
    assetId: activeAssetId || undefined,
  });

  const {
    data: assessment,
    isLoading: isLoadingAssessment,
    refetch: refetchAssessment,
  } = useCostEvidenceAssessment(
    portfolioId,
    activeAccountId || null,
    activeAssetId || null
  );

  // 6. Action mutations
  const submitMutation = useSubmitCostEvidence(portfolioId);
  const verifyMutation = useVerifyCostEvidence(portfolioId);
  const rejectMutation = useRejectCostEvidence(portfolioId);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleVerify = async (evidenceId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await verifyMutation.mutateAsync(evidenceId);
      setActionSuccess('Comprovação confirmada e incorporada com sucesso!');
      refetchList();
      refetchAssessment();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao confirmar comprovação.');
    }
  };

  const handleSubmit = async (evidenceId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await submitMutation.mutateAsync(evidenceId);
      setActionSuccess('Comprovação enviada para revisão.');
      refetchList();
      refetchAssessment();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao submeter comprovação.');
    }
  };

  const handleRejectConfirm = async (evidenceId: string) => {
    if (!rejectReason.trim()) {
      setActionError('Informe o motivo da rejeição.');
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      await rejectMutation.mutateAsync({ evidenceId, reason: rejectReason.trim() });
      setRejectingId(null);
      setRejectReason('');
      setActionSuccess('Comprovação rejeitada.');
      refetchList();
      refetchAssessment();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao rejeitar comprovação.');
    }
  };

  const assetOptions = positions.map((p) => ({
    value: p.assetId,
    label: `${p.ticker || p.assetId.slice(0, 8)} (${p.costBasisStatus === 'INCOMPLETE' ? '⚠️ Custo Pendente' : 'Auditado'})`,
  }));

  return (
    <div
      data-testid="cost-evidence-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.lg}px`,
      }}
    >
      {/* Header with Navigation Breadcrumb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: `${spacing.md}px` }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onNavigateBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateBack}
                data-testid="evidence-back-btn"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                ← Voltar
              </Button>
            )}
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: colors.textPrimary,
                margin: 0,
              }}
            >
              Base de Custo & Evidências Documentais
            </h2>
          </div>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              margin: '4px 0 0 0',
              lineHeight: 1.5,
            }}
          >
            Auditoria, regularização e histórico de documentos de aquisição anterior a 28/11/2019.
          </p>
        </div>

        {/* Global Protection Badge */}
        <Badge variant={incompletePositions.length > 0 ? 'warning' : 'positive'}>
          {incompletePositions.length > 0
            ? `${incompletePositions.length} pendências documentais`
            : '100% dos ativos regularizados'}
        </Badge>
      </div>

      {/* Action Alerts */}
      {actionSuccess && (
        <div
          role="status"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${colors.positive}`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.sm}px ${spacing.md}px`,
            color: colors.positive,
            fontSize: '0.8125rem',
          }}
        >
          ✓ {actionSuccess}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${colors.negative}`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.sm}px ${spacing.md}px`,
            color: colors.negative,
            fontSize: '0.8125rem',
          }}
        >
          ⚠️ {actionError}
        </div>
      )}

      {/* Contextual Guidance on Historical Acquisitions */}
      <div
        data-testid="cost-evidence-guidance-card"
        style={{
          backgroundColor: `${colors.accent}10`,
          border: `1px solid ${colors.accent}30`,
          borderRadius: `${borderRadius.md}px`,
          padding: `${spacing.md}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '1.25rem' }}>📋</span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: colors.textPrimary }}>
            Origem das Pendências &amp; Orientações Fiscais
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.6 }}>
          Para ativos com compras anteriores a <strong>28/11/2019</strong>, o custo histórico não consta no arquivo oficial inicial da B3.
          Comprove a aquisição original utilizando sua <strong>DIRPF 2020 (Ano-calendário 2019 — Bens e Direitos)</strong> ou nota de corretagem original.
        </p>
      </div>

      {/* Pending Items Fast-Selector */}
      {incompletePositions.length > 0 && (
        <div
          data-testid="incomplete-assets-chips"
          style={{
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
            padding: `${spacing.md}px`,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: `${spacing.sm}px`,
            }}
          >
            Ativos que Requerem Comprovação de Custo ({incompletePositions.length})
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            {incompletePositions.map((pos) => {
              const ticker = pos.ticker || pos.assetId.slice(0, 6);
              const isSelected = pos.assetId === activeAssetId;
              return (
                <button
                  key={pos.assetId}
                  type="button"
                  data-testid={`select-asset-chip-${ticker}`}
                  onClick={() => {
                    setActiveAssetId(pos.assetId);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  style={{
                    backgroundColor: isSelected ? `${colors.accent}20` : colors.surface,
                    border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                    borderRadius: `${borderRadius.md}px`,
                    padding: `${spacing.xs}px ${spacing.md}px`,
                    color: isSelected ? colors.accent : colors.textPrimary,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8125rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>⚠️ {ticker}</span>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    ({pos.quantity} ações)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selector for other portfolio assets if needed */}
      <div style={{ maxWidth: '380px' }}>
        <Select
          label="Selecionar Ativo da Carteira"
          options={assetOptions}
          value={activeAssetId}
          onChange={(e) => {
            setActiveAssetId(e.target.value);
            setActionError(null);
            setActionSuccess(null);
          }}
        />
      </div>

      {/* Main Assessment Card */}
      {isLoadingAssessment || isLoadingAccounts ? (
        <Skeleton height={200} />
      ) : activePosition ? (
        <CostAssessmentCard
          assessment={assessment ?? null}
          activeTicker={activeTicker}
          accountName={accounts[0]?.name || 'Custódia Principal'}
          positionQuantity={activePosition.quantity}
          onOpenRegularize={() => setIsModalOpen(true)}
        />
      ) : null}

      {/* Evidence Table */}
      <Card
        data-testid="evidence-list-card"
        style={{
          padding: `${spacing.lg}px`,
          backgroundColor: colors.surfaceElevated,
          borderRadius: `${borderRadius.lg}px`,
          border: `1px solid ${colors.border}`,
        }}
      >
        <h4
          style={{
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: colors.textPrimary,
            margin: `0 0 ${spacing.md}px 0`,
          }}
        >
          Documentos & Evidências Registradas ({evidenceRows.length})
        </h4>

        {isLoadingList ? (
          <Skeleton height={120} />
        ) : evidenceRows.length === 0 ? (
          <EmptyState
            title="Nenhuma evidência registrada para este ativo"
            description="Clique em 'Regularizar Custo / Adicionar Evidência' para registrar a nota de corretagem ou declaração de IR."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                textAlign: 'left',
              }}
              data-testid="evidence-rows-table"
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.textSecondary,
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: `${spacing.sm}px` }}>Versão</th>
                  <th style={{ padding: `${spacing.sm}px` }}>Tipo de Documento</th>
                  <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Qtd Comprovada</th>
                  <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Custo Total</th>
                  <th style={{ padding: `${spacing.sm}px` }}>Data Aquisição</th>
                  <th style={{ padding: `${spacing.sm}px` }}>Origem / Referência</th>
                  <th style={{ padding: `${spacing.sm}px` }}>Situação</th>
                  <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {evidenceRows.map((ev: CostEvidenceRowDto) => {
                  const viewState = getEvidenceRowViewState(ev, evidenceRows);
                  return (
                    <tr
                      key={ev.id}
                      data-testid={`evidence-row-${ev.id}`}
                      style={{
                        borderBottom: `1px solid ${colors.border}`,
                        opacity: viewState.isCurrent ? 1 : 0.6,
                      }}
                    >
                      <td style={{ padding: `${spacing.sm}px`, fontWeight: 700, color: colors.textPrimary }}>
                        v{ev.version}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, color: colors.textPrimary }}>
                        {COST_EVIDENCE_TYPE_LABELS[ev.evidenceType] || ev.evidenceType}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, textAlign: 'right', fontWeight: 600 }}>
                        {formatQuantity(ev.quantityCovered)}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, textAlign: 'right', fontWeight: 600 }}>
                        {ev.totalCost ? formatCurrency(ev.totalCost, ev.currency || 'BRL') : '—'}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                        {ev.acquisitionDate}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary, maxWidth: '200px', wordBreak: 'break-word' }}>
                        {ev.sourceReference}
                      </td>
                      <td style={{ padding: `${spacing.sm}px` }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.sm}px`,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color:
                              ev.status === 'VERIFIED'
                                ? colors.positive
                                : ev.status === 'REJECTED'
                                  ? colors.negative
                                  : colors.warning,
                            backgroundColor:
                              ev.status === 'VERIFIED'
                                ? 'rgba(34, 197, 94, 0.1)'
                                : ev.status === 'REJECTED'
                                  ? 'rgba(239, 68, 68, 0.1)'
                                  : 'rgba(234, 179, 8, 0.1)',
                          }}
                        >
                          {COST_EVIDENCE_STATUS_LABELS[ev.status] || ev.status}
                        </span>
                        {viewState.historicalLabel && (
                          <div style={{ fontSize: '0.6875rem', color: colors.textSecondary, marginTop: '2px' }}>
                            {viewState.historicalLabel}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                          {viewState.showSubmit && (
                            <Button
                              variant="secondary"
                              size="sm"
                              data-testid={`submit-evidence-${ev.id}`}
                              onClick={() => handleSubmit(ev.id)}
                              disabled={submitMutation.isPending}
                              style={{ fontSize: '0.6875rem', padding: '3px 8px' }}
                            >
                              Submeter
                            </Button>
                          )}

                          {viewState.showVerify && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                data-testid={`verify-evidence-${ev.id}`}
                                onClick={() => handleVerify(ev.id)}
                                disabled={verifyMutation.isPending}
                                style={{ fontSize: '0.6875rem', padding: '3px 8px' }}
                              >
                                Validar
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`reject-evidence-${ev.id}`}
                                onClick={() => setRejectingId(ev.id)}
                                style={{ fontSize: '0.6875rem', padding: '3px 8px', borderColor: colors.negative, color: colors.negative }}
                              >
                                Rejeitar
                              </Button>
                            </>
                          )}
                        </div>

                        {rejectingId === ev.id && (
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input
                              type="text"
                              placeholder="Motivo da rejeição"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              style={{
                                padding: '4px 6px',
                                fontSize: '0.75rem',
                                backgroundColor: colors.surface,
                                color: colors.textPrimary,
                                border: `1px solid ${colors.border}`,
                                borderRadius: `${borderRadius.sm}px`,
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRejectingId(null)}
                                style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleRejectConfirm(ev.id)}
                                disabled={rejectMutation.isPending}
                                style={{ fontSize: '0.6875rem', padding: '2px 6px', backgroundColor: colors.negative }}
                              >
                                Confirmar Rejeição
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Fail-Closed Integrity Callout */}
      <div
        style={{
          border: `1px solid ${colors.warning}33`,
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: `${colors.warning}08`,
          padding: `${spacing.md}px`,
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          color: colors.textSecondary,
        }}
      >
        🛡️ <strong>Garantia de Segurança Tributária:</strong> {COST_EVIDENCE_FAIL_CLOSED_DISCLOSURE}
      </div>

      {/* The Regularization Form Modal */}
      {isModalOpen && (
        <CostEvidenceModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          portfolioId={portfolioId}
          accountId={activeAccountId}
          assetId={activeAssetId}
          assetTicker={activeTicker}
          positionQuantity={activePosition?.quantity}
          onSuccess={() => {
            refetchList();
            refetchAssessment();
          }}
        />
      )}
    </div>
  );
};
