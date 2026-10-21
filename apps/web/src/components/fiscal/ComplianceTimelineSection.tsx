'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  mapToTaxComplianceTimelineViewModel,
  taxComplianceTimelineQueryKey,
  type RawTaxComplianceTimeline,
  type TaxComplianceActionType,
  type TaxComplianceObligationViewModel,
} from '@atlas/ui';
import { Card, Skeleton, EmptyState, SectionHeader, Badge, Button } from '@/components/ui';
import { TaxPaymentSupportModal } from './TaxPaymentSupportModal';

export function ComplianceTimelineSection({ initialYear }: { initialYear?: number }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear ?? 2025);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [activeModalKey, setActiveModalKey] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<TaxComplianceActionType | null>(null);
  const [paymentSupportKey, setPaymentSupportKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialYear === undefined) {
      setSelectedYear(new Date().getFullYear());
    }
  }, [initialYear]);

  const {
    data: rawData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: taxComplianceTimelineQueryKey(selectedYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceTimeline }>(
        `/api/v1/fiscal/compliance?calendarYear=${selectedYear}`,
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => mapToTaxComplianceTimelineViewModel(rawData ?? null), [rawData]);

  const actionMutation = useMutation({
    mutationFn: async ({
      obligationKey,
      actionType,
      sourceFingerprint,
      note,
    }: {
      obligationKey: string;
      actionType: TaxComplianceActionType;
      sourceFingerprint: string;
      note?: string;
    }) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }

      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/actions`,
        {
          actionType,
          sourceFingerprint,
          note: note?.trim() || undefined,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
      setActiveModalKey(null);
      setPendingActionType(null);
    },
  });

  const filteredObligations = useMemo(() => {
    if (!viewModel) return [];
    if (statusFilter === 'ALL') return viewModel.obligations;
    return viewModel.obligations.filter((ob) => ob.status === statusFilter);
  }, [viewModel, statusFilter]);

  function handleOpenAction(
    ob: TaxComplianceObligationViewModel,
    actionType: TaxComplianceActionType,
  ) {
    setActiveModalKey(ob.obligationKey);
    setPendingActionType(actionType);
  }

  function handleConfirmAction(ob: TaxComplianceObligationViewModel) {
    if (!pendingActionType) return;
    const note = actionNotes[ob.obligationKey] ?? '';
    actionMutation.mutate({
      obligationKey: ob.obligationKey,
      actionType: pendingActionType,
      sourceFingerprint: ob.sourceFingerprint,
      note,
    });
  }

  return (
    <div style={{ marginTop: `${spacing.xl}px` }} data-testid="compliance-timeline-section">
      <SectionHeader
        title="Painel de Conformidade e Linha do Tempo Fiscal"
        description="Acompanhamento integrado de compromissos tributários anuais e mensais derivados."
      />

      {/* Year & Status filter controls */}
      <div
        style={{
          display: 'flex',
          gap: `${spacing.md}px`,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="compliance-year"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Ano-calendário:
          </label>
          <select
            id="compliance-year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
            }}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="compliance-status-filter"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Status:
          </label>
          <select
            id="compliance-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
            }}
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="DUE_SOON">Vencem em breve</option>
            <option value="OVERDUE">Vencidos</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="DISMISSED">Dispensados</option>
            <option value="SUPERSEDED">Dados Alterados</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
      )}

      {isError && !isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <div style={{ color: colors.negative, fontSize: '0.875rem' }}>
            {(error as ApiError)?.message || 'Erro ao carregar linha do tempo de conformidade.'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            style={{ marginTop: `${spacing.sm}px` }}
          >
            Tentar novamente
          </Button>
        </Card>
      )}

      {viewModel && (
        <>
          {/* Summary counters grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: `${spacing.sm}px`,
              marginBottom: `${spacing.base}px`,
            }}
          >
            <Card style={{ padding: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Total</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}>
                {viewModel.summary.totalObligations}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Pendentes</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textSecondary }}>
                {viewModel.summary.pendingCount}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.75rem', color: colors.warning }}>Vencem em breve</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.warning }}>
                {viewModel.summary.dueSoonCount}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.75rem', color: colors.negative }}>Vencidos</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.negative }}>
                {viewModel.summary.overdueCount}
              </div>
            </Card>
            <Card style={{ padding: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.75rem', color: colors.positive }}>Concluídos</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.positive }}>
                {viewModel.summary.completedCount}
              </div>
            </Card>
            {viewModel.summary.supersededCount > 0 && (
              <Card style={{ padding: `${spacing.sm}px` }}>
                <span style={{ fontSize: '0.75rem', color: colors.warning }}>Dados alterados</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.warning }}>
                  {viewModel.summary.supersededCount}
                </div>
              </Card>
            )}
          </div>

          {/* Obligations list */}
          {filteredObligations.length === 0 ? (
            <Card style={{ padding: `${spacing.lg}px` }}>
              <EmptyState
                title="Nenhuma obrigação encontrada"
                description="Não há compromissos fiscais correspondentes aos filtros selecionados para este ano-calendário."
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              {filteredObligations.map((ob) => (
                <Card
                  key={ob.obligationKey}
                  style={{
                    padding: `${spacing.base}px`,
                    borderLeft: `4px solid ${ob.statusColor}`,
                  }}
                  data-testid={`obligation-card-${ob.period}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                      gap: `${spacing.xs}px`,
                    }}
                  >
                    <div>
                      <strong style={{ color: colors.textPrimary, fontSize: '1rem' }}>
                        {ob.title}
                      </strong>
                      <span
                        style={{
                          marginLeft: `${spacing.sm}px`,
                          fontSize: '0.75rem',
                          color: colors.textMuted,
                        }}
                      >
                        {ob.kindLabel} · Período: {ob.periodLabel}
                      </span>
                    </div>
                    <Badge variant={ob.statusVariant}>{ob.statusLabel}</Badge>
                  </div>

                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginTop: `${spacing.xs}px`,
                    }}
                  >
                    {ob.description}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: `${spacing.sm}px`,
                      marginTop: `${spacing.sm}px`,
                      backgroundColor: colors.surfaceElevated,
                      padding: `${spacing.sm}px`,
                      borderRadius: `${borderRadius.md}px`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>Vencimento</div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: ob.isOverdue ? colors.negative : colors.textPrimary,
                        }}
                      >
                        {ob.dueDateFormatted}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                        Valor Calculado
                      </div>
                      <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                        {ob.amountFormatted}
                      </div>
                    </div>
                    {ob.revenueCode && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                          Código de Receita
                        </div>
                        <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                          {ob.revenueCode}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>Autoridade</div>
                      <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                        {ob.authority}
                      </div>
                    </div>
                  </div>

                  {/* Staleness / Superseded warning */}
                  {ob.isSuperseded && (
                    <div
                      style={{
                        marginTop: `${spacing.sm}px`,
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        backgroundColor: colors.warningSubtle,
                        color: colors.warning,
                        borderRadius: `${borderRadius.sm}px`,
                        fontSize: '0.8125rem',
                      }}
                    >
                      Os dados da apuração subjacente foram recalculados ou modificados após a sua
                      última confirmação. Revise o novo valor e confirme novamente.
                    </div>
                  )}

                  {/* Last Action Note */}
                  {ob.lastAction?.note && (
                    <div
                      style={{
                        marginTop: `${spacing.xs}px`,
                        fontSize: '0.75rem',
                        color: colors.textSecondary,
                        fontStyle: 'italic',
                      }}
                    >
                      Nota do investidor: &ldquo;{ob.lastAction.note}&rdquo;
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div
                    style={{
                      marginTop: `${spacing.sm}px`,
                      display: 'flex',
                      gap: `${spacing.xs}px`,
                      flexWrap: 'wrap',
                    }}
                  >
                    {ob.status !== 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenAction(ob, 'USER_REPORTED_COMPLETION')}
                      >
                        {ob.isSuperseded ? 'Reconfirmar Conclusão' : 'Marcar como Concluído'}
                      </Button>
                    )}

                    {ob.status !== 'DISMISSED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenAction(ob, 'USER_DISMISSED')}
                      >
                        Dispensar
                      </Button>
                    )}

                    {ob.kind === 'MONTHLY_TAX_PAYMENT' && ob.amount && ob.amount !== '0' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentSupportKey(ob.obligationKey)}
                      >
                        Apoio ao Pagamento (DARF)
                      </Button>
                    )}

                    {(ob.status === 'COMPLETED' || ob.status === 'DISMISSED') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenAction(ob, 'USER_REOPENED')}
                      >
                        Reabrir Obrigação
                      </Button>
                    )}
                  </div>

                  {/* In-place Action Confirmation Modal / Drawer */}
                  {activeModalKey === ob.obligationKey && (
                    <div
                      style={{
                        marginTop: `${spacing.sm}px`,
                        padding: `${spacing.sm}px`,
                        border: `1px solid ${colors.border}`,
                        borderRadius: `${borderRadius.md}px`,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <div
                        style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                      >
                        Confirmar ação:{' '}
                        {pendingActionType === 'USER_REPORTED_COMPLETION'
                          ? 'Marcar como Concluído'
                          : pendingActionType === 'USER_DISMISSED'
                            ? 'Dispensar Obrigação'
                            : 'Reabrir Obrigação'}
                      </div>
                      <div
                        style={{ fontSize: '0.75rem', color: colors.textMuted, margin: '4px 0' }}
                      >
                        Esta ação é registrada estritamente para seu controle gerencial interno. O
                        Atlas não realiza transmissões à Receita Federal.
                      </div>
                      <input
                        type="text"
                        placeholder="Nota ou comprovante (opcional, ex: Pago no banco X)"
                        value={actionNotes[ob.obligationKey] ?? ''}
                        onChange={(e) =>
                          setActionNotes((prev) => ({
                            ...prev,
                            [ob.obligationKey]: e.target.value,
                          }))
                        }
                        style={{
                          width: '100%',
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: `${borderRadius.sm}px`,
                          border: `1px solid ${colors.border}`,
                          fontSize: '0.8125rem',
                          marginBottom: `${spacing.xs}px`,
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textPrimary,
                        }}
                      />
                      <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={actionMutation.isPending}
                          onClick={() => handleConfirmAction(ob)}
                        >
                          {actionMutation.isPending ? 'Salvando…' : 'Confirmar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setActiveModalKey(null);
                            setPendingActionType(null);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Mandatory legal disclaimer */}
          <div
            style={{
              marginTop: `${spacing.base}px`,
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              fontSize: '0.75rem',
              color: colors.textMuted,
              lineHeight: 1.5,
            }}
          >
            <strong>Aviso de responsabilidade e independência:</strong> {viewModel.disclaimer}
          </div>
        </>
      )}

      {paymentSupportKey && (
        <TaxPaymentSupportModal
          obligationKey={paymentSupportKey}
          isOpen={Boolean(paymentSupportKey)}
          onClose={() => setPaymentSupportKey(null)}
        />
      )}
    </div>
  );
}
