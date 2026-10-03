'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualTaxReadinessQueryKey,
  buildAnnualTaxReadinessViewModel,
  type AnnualEvidenceRequirementVM,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import { Card, SectionHeader, ErrorState, Skeleton } from '@/components/ui';

export function AnnualReadinessSection() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear() - 1;
  const [calendarYear, setCalendarYear] = useState<number>(currentYear > 2000 ? currentYear : 2025);
  const [selectedReq, setSelectedReq] = useState<AnnualEvidenceRequirementVM | null>(null);
  const [confirmationNotes, setConfirmationNotes] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: annualTaxReadinessQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          calendarYear: number;
          declarationExercise: number;
          overallStatus: 'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';
          isReadyForDirpf: boolean;
          sections: ReadonlyArray<{
            section:
              | 'OPENING_POSITIONS'
              | 'ANNUAL_POSITIONS'
              | 'CAPITAL_MARKET_FISCAL'
              | 'PAYMENTS_6015'
              | 'TRANSITION_EVIDENCE'
              | 'FII_ELIGIBILITY'
              | 'WITHHOLDING_EVIDENCE'
              | 'INVESTMENT_INCOME'
              | 'TAXPAYER_CONFIRMATIONS';
            title: string;
            status: 'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';
            isComplete: boolean;
            blockingReasons: readonly string[];
            requirementIds: readonly string[];
          }>;
          requirements: ReadonlyArray<{
            requirementId: string;
            section:
              | 'OPENING_POSITIONS'
              | 'ANNUAL_POSITIONS'
              | 'CAPITAL_MARKET_FISCAL'
              | 'PAYMENTS_6015'
              | 'TRANSITION_EVIDENCE'
              | 'FII_ELIGIBILITY'
              | 'WITHHOLDING_EVIDENCE'
              | 'INVESTMENT_INCOME'
              | 'TAXPAYER_CONFIRMATIONS';
            subjectId: string;
            title: string;
            description: string;
            status: 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE';
            blockingReason: string;
            sourceFingerprint: string;
            satisfiedByConfirmationId?: string;
            actionableUrl?: string;
          }>;
          confirmations: ReadonlyArray<{
            id: string;
            confirmationType: string;
            subjectReference: string;
            decision: string;
            statementVersion: string;
            sourceFingerprint: string;
            revision: number;
            confirmedAt: string;
            notes?: string | null;
          }>;
          blockingReasons: readonly string[];
          fingerprint: string;
        };
      }>(`/api/v1/fiscal/annual/${calendarYear}/readiness`);

      return res.data;
    },
    enabled: Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const confirmMutation = useMutation({
    mutationFn: async (req: AnnualEvidenceRequirementVM) => {
      let confType = 'GENERAL_TAX_DATA';
      if (req.section === 'TRANSITION_EVIDENCE') {
        confType = 'DIVIDEND_TRANSITION_EVIDENCE';
      } else if (req.section === 'FII_ELIGIBILITY') {
        confType = 'FII_EXEMPTION_REQUIREMENTS';
      } else if (req.section === 'OPENING_POSITIONS') {
        confType = 'OPENING_COST_BASIS';
      } else if (req.section === 'WITHHOLDING_EVIDENCE') {
        confType = 'WITHHOLDING_PROOF';
      }

      await apiClient.post(`/api/v1/fiscal/annual/${calendarYear}/confirmations`, {
        confirmationType: confType,
        subjectReference: req.subjectId,
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: req.sourceFingerprint,
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        notes: confirmationNotes || null,
      });
    },
    onSuccess: () => {
      setSelectedReq(null);
      setConfirmationNotes('');
      queryClient.invalidateQueries({ queryKey: annualTaxReadinessQueryKey(calendarYear) });
      refetch();
    },
  });

  const viewModel = useMemo(() => (data ? buildAnnualTaxReadinessViewModel(data) : null), [data]);

  return (
    <div
      data-testid="annual-tax-readiness-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.md}px`,
        marginTop: `${spacing.lg}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <SectionHeader
          title={`Prontidão e Evidências Anuais (DIRPF ${viewModel?.declarationExercise ?? calendarYear + 1})`}
          description="Auditoria de completude, integridade probatória e confirmações formais do contribuinte."
        />

        <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
          {[2024, 2025, 2026].map((yr) => (
            <button
              key={yr}
              type="button"
              data-testid={`readiness-year-selector-${yr}`}
              onClick={() => setCalendarYear(yr)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${calendarYear === yr ? colors.accent : colors.border}`,
                backgroundColor: calendarYear === yr ? colors.surfaceElevated : colors.surface,
                color: calendarYear === yr ? colors.accent : colors.textPrimary,
                fontWeight: calendarYear === yr ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="120px" />
        </Card>
      )}

      {isError && (
        <ErrorState
          title="Erro ao carregar prontidão fiscal"
          message={(error as Error)?.message ?? 'Falha ao consultar prontidão anual.'}
          onRetry={() => refetch()}
        />
      )}

      {viewModel && !isLoading && (
        <>
          {/* Overall status banner */}
          <Card
            data-testid="overall-readiness-card"
            style={{
              padding: `${spacing.base}px`,
              borderLeft: `4px solid ${
                viewModel.overallStatusVariant === 'success'
                  ? colors.positive
                  : viewModel.overallStatusVariant === 'danger'
                    ? colors.negative
                    : colors.warning
              }`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: `${spacing.sm}px`,
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  Status Consolidado de Prontidão
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: colors.textPrimary }}>
                  {viewModel.overallStatusLabel}
                </div>
              </div>
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: `${borderRadius.sm}px`,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor:
                    viewModel.overallStatusVariant === 'success'
                      ? `${colors.positive}20`
                      : viewModel.overallStatusVariant === 'danger'
                        ? `${colors.negative}20`
                        : `${colors.warning}20`,
                  color:
                    viewModel.overallStatusVariant === 'success'
                      ? colors.positive
                      : viewModel.overallStatusVariant === 'danger'
                        ? colors.negative
                        : colors.warning,
                }}
              >
                {viewModel.overallStatus}
              </div>
            </div>
            <div
              style={{
                marginTop: `${spacing.sm}px`,
                fontSize: '0.875rem',
                color: colors.textSecondary,
              }}
            >
              {viewModel.summaryText}
            </div>
            <div
              style={{
                marginTop: `${spacing.xs}px`,
                fontSize: '0.75rem',
                color: colors.textMuted,
                fontFamily: 'monospace',
              }}
            >
              Fingerprint: {viewModel.fingerprint}
            </div>
          </Card>

          {/* 9 Canonical sections list */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: `${spacing.md}px`,
            }}
          >
            {viewModel.sections.map((sec) => (
              <Card
                key={sec.section}
                data-testid={`readiness-section-${sec.section}`}
                style={{ padding: `${spacing.base}px` }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: `${spacing.xs}px`,
                  }}
                >
                  <div
                    style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem' }}
                  >
                    {sec.title}
                  </div>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: `${borderRadius.sm}px`,
                      backgroundColor:
                        sec.statusVariant === 'success'
                          ? `${colors.positive}20`
                          : sec.statusVariant === 'danger'
                            ? `${colors.negative}20`
                            : sec.statusVariant === 'neutral'
                              ? `${colors.border}40`
                              : `${colors.warning}20`,
                      color:
                        sec.statusVariant === 'success'
                          ? colors.positive
                          : sec.statusVariant === 'danger'
                            ? colors.negative
                            : sec.statusVariant === 'neutral'
                              ? colors.textSecondary
                              : colors.warning,
                    }}
                  >
                    {sec.statusLabel}
                  </span>
                </div>
                {sec.blockingReasons.length > 0 && (
                  <div
                    style={{
                      marginTop: `${spacing.xs}px`,
                      fontSize: '0.75rem',
                      color: colors.negative,
                    }}
                  >
                    {sec.blockingReasons.join(', ')}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Requirements to confirm */}
          {viewModel.requirements.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  fontWeight: 600,
                  color: colors.textPrimary,
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                Exigências Probatórias & Ações Necessárias ({viewModel.requirements.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                {viewModel.requirements.map((req) => (
                  <div
                    key={req.requirementId}
                    data-testid={`requirement-item-${req.requirementId}`}
                    style={{
                      padding: `${spacing.sm}px`,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surfaceElevated,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: `${spacing.sm}px`,
                    }}
                  >
                    <div style={{ maxWidth: '70%' }}>
                      <div
                        style={{ fontWeight: 600, fontSize: '0.875rem', color: colors.textPrimary }}
                      >
                        {req.title}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                        {req.description}
                      </div>
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          color: colors.textMuted,
                          fontFamily: 'monospace',
                        }}
                      >
                        Hash: {req.sourceFingerprint.substring(0, 16)}...
                      </div>
                    </div>
                    <div>
                      {req.isSatisfied ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: colors.positive,
                            padding: `${spacing.xs}px ${spacing.sm}px`,
                            backgroundColor: `${colors.positive}20`,
                            borderRadius: `${borderRadius.sm}px`,
                          }}
                        >
                          Confirmado
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`confirm-btn-${req.requirementId}`}
                          onClick={() => setSelectedReq(req)}
                          style={{
                            padding: `${spacing.xs}px ${spacing.sm}px`,
                            borderRadius: `${borderRadius.md}px`,
                            border: `1px solid ${colors.accent}`,
                            backgroundColor: colors.accent,
                            color: '#fff',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Confirmar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Confirmations audit list */}
          {viewModel.confirmations.length > 0 && (
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  fontWeight: 600,
                  color: colors.textPrimary,
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                Histórico de Confirmações Auditadas ({viewModel.confirmations.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                {viewModel.confirmations.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`confirmation-row-${c.id}`}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: '0.8125rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{c.confirmationType}</span>:{' '}
                      {c.subjectReference} (rev {c.revision})
                    </div>
                    <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>
                      {new Date(c.confirmedAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Confirmation Modal */}
          {selectedReq && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  backgroundColor: colors.surface,
                  padding: `${spacing.lg}px`,
                  borderRadius: `${borderRadius.lg}px`,
                  maxWidth: '500px',
                  width: '90%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.md}px`,
                }}
              >
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
                  Confirmar Declaração Probatória
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  {selectedReq.title}
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textMuted }}>
                  {selectedReq.description}
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      marginBottom: `${spacing.xs}px`,
                      color: colors.textPrimary,
                    }}
                  >
                    Observações / Justificativa Documental (opcional):
                  </label>
                  <textarea
                    rows={3}
                    value={confirmationNotes}
                    onChange={(e) => setConfirmationNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs}px`,
                      borderRadius: `${borderRadius.sm}px`,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textPrimary,
                      fontSize: '0.875rem',
                    }}
                    placeholder="Ex: Ata de assembleia de 20/12/2025 arquivada na JUCESP"
                  />
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReq(null);
                      setConfirmationNotes('');
                    }}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                      color: colors.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    data-testid="submit-confirmation-btn"
                    disabled={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate(selectedReq)}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.accent}`,
                      backgroundColor: colors.accent,
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {confirmMutation.isPending ? 'Gravando...' : 'Confirmar e Assinar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
