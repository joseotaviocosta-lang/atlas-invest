'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button, Badge } from '@/components/ui';
import { colors, spacing, borderRadius, getTodayCivilDateString } from '@atlas/ui';
import {
  describePlanStatus,
  describeScenarioLimitation,
  formatCentsBr,
  formatPlanDate,
  formatScenarioMoney,
  parseScenarioMoneyToCents,
  scenarioCategoryLabel,
  type AllocationScenarioRowView,
} from '@atlas/ui';
import { LiveResultTable } from './PortfolioSavedScenarios';

const PLAN_CATEGORIES = [
  'STOCK',
  'FII',
  'ETF',
  'BDR',
  'FIXED_INCOME',
  'TREASURY',
  'FUND',
  'CASH',
  'OTHER',
] as const;

export const CREATE_PLAN_EVENT = 'atlas:create-plan';

interface PlanItemDto {
  category: string;
  amount: string;
}

interface ContributionPlanDto {
  id: string;
  portfolioId: string;
  name: string;
  plannedDate: string;
  status: string;
  currency: string;
  sourceScenarioId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PlanItemDto[];
  total: string;
}

interface PlanLiveView {
  totals: { current: string; scenario: string; projected: string; currency: string };
  rows: AllocationScenarioRowView[];
  beforeOutsideCount: number;
  afterOutsideCount: number;
  beforeTotalAbsDeviationBp: number;
  afterTotalAbsDeviationBp: number;
  worstGap: { category: string; deviationBp: number } | null;
  qualified: boolean;
  denominator: string;
  generatedAt: string;
  marketDataAsOf: string | null;
}

interface PlanDetailData {
  plan: ContributionPlanDto;
  live: PlanLiveView | null;
  limitations: string[];
}

interface PlanListData {
  upcoming: ContributionPlanDto[];
  history: ContributionPlanDto[];
  activeLimit: number;
}

export function contributionPlansQueryKey(portfolioId: string) {
  return ['portfolio-contribution-plans', portfolioId];
}

/** Fires a cross-section prefill: scenario/simulator → plans form. */
export function dispatchCreatePlan(prefill: {
  name: string;
  items: Array<{ category: string; amount: string }>;
}) {
  window.dispatchEvent(new CustomEvent(CREATE_PLAN_EVENT, { detail: prefill }));
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return fallback;
}

function outsideLabel(count: number): string {
  return count === 1 ? '1 categoria fora da meta' : `${count} categorias fora da meta`;
}

function statusBadge(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED') return 'neutral';
  return 'warning';
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  fontSize: '0.875rem',
};

/**
 * Phase 5Q-F — contribution planning workspace (intent only).
 * Lists upcoming + history, creates/edits PLANNED plans, marks complete
 * or cancels with explicit confirmation, and shows live impact. Never
 * creates transactions, orders or recommendations.
 */
export function PortfolioContributionPlans({ portfolioId }: { portfolioId: string | null }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const today = useMemo(() => getTodayCivilDateString(), []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    kind: 'complete' | 'cancel' | 'delete';
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const listQuery = useQuery({
    queryKey: contributionPlansQueryKey(portfolioId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<{ data: PlanListData }>(
        `/api/v1/portfolios/${portfolioId}/contribution-plans`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: [...contributionPlansQueryKey(portfolioId ?? ''), 'detail', openId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PlanDetailData }>(
        `/api/v1/portfolios/${portfolioId}/contribution-plans/${openId}`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null && openId !== null,
    staleTime: 30_000,
  });

  // Cross-section prefill: scenario detail / ephemeral simulator hand over
  // user-declared inputs (never server-computed values). Date stays empty:
  // the user must choose it.
  useEffect(() => {
    const handler = (event: Event) => {
      const prefill = (event as CustomEvent).detail as {
        name?: string;
        items?: Array<{ category: string; amount: string }>;
      };
      const values: Record<string, string> = {};
      for (const item of prefill?.items ?? []) {
        if (typeof item?.category === 'string' && typeof item?.amount === 'string') {
          values[item.category] = item.amount.replace('.', ',');
        }
      }
      setEditingId(null);
      setFormName(typeof prefill?.name === 'string' ? prefill.name : '');
      setFormDate('');
      setFormValues(values);
      setFormOpen(true);
      setAnnouncement('Valores trazidos para o plano. Escolha a data planejada e salve.');
      document.getElementById('contribution-plans')?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener(CREATE_PLAN_EVENT, handler);
    return () => window.removeEventListener(CREATE_PLAN_EVENT, handler);
  }, []);

  const parsed = useMemo(() => {
    const entries: Array<{ category: string; amount: string }> = [];
    let invalid: string | null = null;
    let totalCents = BigInt(0);
    const name = formName.trim();
    if (name === '') invalid = 'Informe um nome para o plano.';
    else if (name.length > 80) invalid = 'O nome precisa ter até 80 caracteres.';
    else if (name.includes('<') || name.includes('>')) invalid = 'O nome não pode conter < ou >.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      invalid = invalid ?? 'Informe a data planejada (dia/mês/ano).';
    } else if (!editingId && formDate < today) {
      invalid = invalid ?? 'A data planejada não pode estar no passado para um novo plano.';
    }
    for (const category of PLAN_CATEGORIES) {
      const raw = formValues[category] ?? '';
      if (raw.trim() === '') continue;
      const cents = parseScenarioMoneyToCents(raw);
      if (cents === null || cents <= BigInt(0)) {
        invalid = `Valor inválido em ${scenarioCategoryLabel(category)}. Use formato como 10.000,50.`;
        break;
      }
      totalCents += cents;
      entries.push({ category, amount: raw.trim() });
    }
    if (invalid === null && entries.length === 0) invalid = 'Informe ao menos um valor.';
    return { entries, invalid, totalCents };
  }, [formName, formDate, formValues, editingId, today]);

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: contributionPlansQueryKey(portfolioId ?? ''),
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: formName.trim(), plannedDate: formDate, items: parsed.entries };
      if (editingId) {
        const res = await apiClient.put<{ data: unknown }>(
          `/api/v1/portfolios/${portfolioId}/contribution-plans/${editingId}`,
          body,
        );
        return res.data;
      }
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/contribution-plans`,
        body,
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateAll();
      setAnnouncement(editingId ? 'Alterações salvas.' : 'Plano criado.');
      closeForm();
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (action: { id: string; kind: 'complete' | 'cancel' }) => {
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/contribution-plans/${action.id}/${action.kind}`,
      );
      return res.data;
    },
    onSuccess: async (_data, action) => {
      await invalidateAll();
      setConfirmAction(null);
      setAnnouncement(
        action.kind === 'complete'
          ? 'Plano marcado como realizado. Nenhuma operação foi criada.'
          : 'Plano cancelado.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      await apiClient.delete(`/api/v1/portfolios/${portfolioId}/contribution-plans/${planId}`);
    },
    onSuccess: async (_data, planId) => {
      await invalidateAll();
      if (openId === planId) setOpenId(null);
      setConfirmAction(null);
      setAnnouncement('Plano excluído.');
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormName('');
    setFormDate('');
    setFormValues({});
  };

  const startCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormDate('');
    setFormValues({});
    setFormOpen(true);
  };

  const startEdit = (plan: ContributionPlanDto) => {
    const values: Record<string, string> = {};
    for (const item of plan.items) {
      values[item.category] = item.amount.replace('.', ',');
    }
    setEditingId(plan.id);
    setFormName(plan.name);
    setFormDate(plan.plannedDate);
    setFormValues(values);
    setFormOpen(true);
  };

  const upcoming = listQuery.data?.upcoming ?? [];
  const history = listQuery.data?.history ?? [];
  const rawDetail = detailQuery.data ?? null;
  const detail = rawDetail && rawDetail.plan.id === openId ? rawDetail : null;

  const renderCard = (plan: ContributionPlanDto) => {
    const overdue = plan.status === 'PLANNED' && plan.plannedDate < today;
    const confirming = confirmAction?.id === plan.id ? confirmAction.kind : null;
    return (
      <li
        key={plan.id}
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          padding: '12px',
          backgroundColor: colors.surface,
        }}
        data-testid={`contribution-plan-${plan.id}`}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>
              {plan.name}
            </span>
            <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textSecondary }}>
              {formatPlanDate(plan.plannedDate)} •{' '}
              {formatCentsBr(parseScenarioMoneyToCents(plan.total) ?? BigInt(0))}
            </span>
            <span style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <Badge variant={statusBadge(plan.status)}>{describePlanStatus(plan.status)}</Badge>
              {overdue ? <Badge variant="warning">Data planejada já passou</Badge> : null}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenId(openId === plan.id ? null : plan.id)}
            style={{ minHeight: 44 }}
            aria-label={`${openId === plan.id ? 'Fechar' : 'Abrir'} ${plan.name}`}
            data-testid={`plan-open-${plan.id}`}
          >
            {openId === plan.id ? 'Fechar' : 'Abrir'}
          </Button>
          {plan.status === 'PLANNED' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEdit(plan)}
                style={{ minHeight: 44 }}
                aria-label={`Editar ${plan.name}`}
              >
                Editar
              </Button>
              {confirming ? (
                <>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      alignSelf: 'center',
                    }}
                  >
                    {confirming === 'complete'
                      ? 'Marcar este plano como realizado? Isso apenas atualiza o status do planejamento. Nenhuma operação será criada ou executada no Atlas.'
                      : confirming === 'cancel'
                        ? 'Cancelar este plano? Sua carteira, estratégia e operações não serão alteradas.'
                        : 'Excluir este plano? Sua carteira, estratégia e operações não serão alteradas.'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirming === 'delete') deleteMutation.mutate(plan.id);
                      else transitionMutation.mutate({ id: plan.id, kind: confirming });
                    }}
                    disabled={transitionMutation.isPending || deleteMutation.isPending}
                    style={{ minHeight: 44 }}
                    aria-label={`Confirmar ${confirming === 'complete' ? 'realização' : confirming === 'cancel' ? 'cancelamento' : 'exclusão'} de ${plan.name}`}
                    data-testid={`plan-confirm-${confirming}-${plan.id}`}
                  >
                    {confirming === 'complete'
                      ? 'Marcar como realizado'
                      : confirming === 'cancel'
                        ? 'Confirmar cancelamento'
                        : 'Confirmar exclusão'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction(null)}
                    style={{ minHeight: 44 }}
                  >
                    Manter
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ id: plan.id, kind: 'complete' })}
                    style={{ minHeight: 44 }}
                    aria-label={`Marcar ${plan.name} como realizado`}
                  >
                    Marcar como realizado
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ id: plan.id, kind: 'cancel' })}
                    style={{ minHeight: 44 }}
                    aria-label={`Cancelar ${plan.name}`}
                  >
                    Cancelar plano
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ id: plan.id, kind: 'delete' })}
                    style={{ minHeight: 44 }}
                    aria-label={`Excluir ${plan.name}`}
                  >
                    Excluir
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
        {(transitionMutation.isError || deleteMutation.isError) && confirming ? (
          <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
            {errorMessage(
              transitionMutation.error ?? deleteMutation.error,
              'Não foi possível concluir. Tente novamente.',
            )}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div
      id="contribution-plans"
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="contribution-plans"
    >
      <SectionHeader
        title="Planejamento de aportes"
        description="O que você pretende aportar. Planos não executam nada: marcar como realizado apenas atualiza o status."
      />
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {announcement}
      </div>

      {listQuery.isLoading ? (
        <Skeleton width="100%" height="80px" />
      ) : listQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os planos"
          message="Tente novamente."
          onRetry={() => listQuery.refetch()}
        />
      ) : (
        <>
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0' }}>
            Próximos aportes
          </h4>
          {upcoming.length === 0 && !formOpen ? (
            <EmptyState
              title="Nenhum aporte planejado"
              description="Declare uma intenção futura: nome, data e valores por categoria."
              actionLabel="Criar plano"
              onAction={startCreate}
            />
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {upcoming.map(renderCard)}
            </ul>
          )}
          {!formOpen ? (
            <div style={{ marginTop: 8 }}>
              <Button
                variant="outline"
                onClick={startCreate}
                style={{ minHeight: 44 }}
                aria-label="Criar novo plano de aporte"
                data-testid="plan-create-open"
              >
                Criar plano
              </Button>
            </div>
          ) : null}

          {formOpen ? (
            <div
              style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}
              data-testid="plan-form"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {editingId ? 'Editar plano' : 'Novo plano'}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 12px' }}>
                O Atlas salvará apenas a sua intenção. Nada será comprado, executado ou recomendado.
              </p>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                  Nome do plano
                </span>
                <input
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="Aporte de novembro"
                  maxLength={80}
                  aria-label="Nome do plano"
                  data-testid="plan-form-name"
                  style={{ ...inputStyle, width: '100%', minHeight: 44 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                  Data planejada
                </span>
                <input
                  type="date"
                  value={formDate}
                  min={today}
                  onChange={(event) => setFormDate(event.target.value)}
                  aria-label="Data planejada do aporte"
                  data-testid="plan-form-date"
                  style={{ ...inputStyle, minHeight: 44 }}
                />
              </label>
              {PLAN_CATEGORIES.map((category) => (
                <label
                  key={category}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                >
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>
                    {scenarioCategoryLabel(category)}
                  </span>
                  <input
                    value={formValues[category] ?? ''}
                    onChange={(event) =>
                      setFormValues((previous) => ({ ...previous, [category]: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    aria-label={`Valor planejado em ${scenarioCategoryLabel(category)} em reais`}
                    data-testid={`plan-form-${category}`}
                    style={{ ...inputStyle, width: 140, minHeight: 44, textAlign: 'right' }}
                  />
                </label>
              ))}
              <p style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Total planejado:{' '}
                <strong data-testid="plan-form-total">{formatCentsBr(parsed.totalCents)}</strong>
              </p>
              {parsed.invalid ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {parsed.invalid}
                </p>
              ) : null}
              {saveMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    saveMutation.error,
                    'Não foi possível salvar. Verifique os valores.',
                  )}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => saveMutation.mutate()}
                  disabled={parsed.invalid !== null || saveMutation.isPending}
                  style={{ minHeight: 44 }}
                  aria-label={editingId ? 'Salvar alterações do plano' : 'Salvar plano'}
                  data-testid="plan-form-save"
                >
                  {saveMutation.isPending
                    ? 'Salvando…'
                    : editingId
                      ? 'Salvar alterações'
                      : 'Salvar plano'}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeForm}
                  style={{ minHeight: 44 }}
                  aria-label="Cancelar edição"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {openId && detail ? (
            <div
              style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}
              data-testid="plan-detail"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {detail.plan.name}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}>
                {formatPlanDate(detail.plan.plannedDate)} •{' '}
                {formatCentsBr(parseScenarioMoneyToCents(detail.plan.total) ?? BigInt(0))} •{' '}
                {describePlanStatus(detail.plan.status)}
              </p>
              <ul style={{ fontSize: '0.8125rem', margin: '8px 0', paddingLeft: 18 }}>
                {detail.plan.items.map((item) => (
                  <li key={item.category}>
                    {scenarioCategoryLabel(item.category)}:{' '}
                    {formatScenarioMoney(item.amount, detail.plan.currency)}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}>
                O impacto abaixo é recalculado com a carteira e as metas atuais. Ele pode ser
                diferente do que você viu quando criou o plano.
              </p>
              {detail.live ? (
                <>
                  <p
                    style={{ fontSize: '0.875rem', margin: '8px 0' }}
                    data-testid="plan-detail-impact"
                  >
                    Antes: {outsideLabel(detail.live.beforeOutsideCount)}. Após a hipótese:{' '}
                    {outsideLabel(detail.live.afterOutsideCount)}.
                  </p>
                  <LiveResultTable live={detail.live} />
                </>
              ) : (
                <p
                  style={{ fontSize: '0.875rem', color: colors.textSecondary }}
                  data-testid="plan-detail-unavailable"
                >
                  {detail.limitations.length > 0
                    ? describeScenarioLimitation(detail.limitations[0]!)
                    : 'Não foi possível calcular o impacto atual deste plano.'}
                </p>
              )}
              <div style={{ marginTop: 8 }}>
                <Button
                  variant="outline"
                  onClick={() => setOpenId(null)}
                  style={{ minHeight: 44 }}
                  aria-label="Fechar plano aberto"
                >
                  Fechar
                </Button>
              </div>
            </div>
          ) : openId && detailQuery.isLoading ? (
            <Skeleton width="100%" height="120px" />
          ) : null}

          {history.length > 0 ? (
            <>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '16px 0 8px' }}>
                Histórico de planos
              </h4>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {history.map(renderCard)}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
