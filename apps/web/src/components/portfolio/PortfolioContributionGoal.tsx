'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, Button } from '@/components/ui';
import { colors, spacing, getTodayCivilDateString } from '@atlas/ui';
import { formatScenarioMoney, parseScenarioMoneyToCents } from '@atlas/ui';

export interface ContributionGoalView {
  id: string;
  portfolioId: string;
  amount: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContributionGoalState {
  current: ContributionGoalView | null;
  upcoming: ContributionGoalView | null;
  history: ContributionGoalView[];
}

export function contributionGoalQueryKey(portfolioId: string) {
  return ['portfolio-contribution-goal', portfolioId];
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (message.trim().length > 0) return message;
  }
  return fallback;
}

function formatMonthDay(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
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
 * Phase 5Q-J — user-defined monthly contribution goal (intent only).
 * The user declares amount + effective month; the Atlas only compares.
 * No suggested amounts, no auto-tuning, no scheduler, no transactions.
 */
export function PortfolioContributionGoalSection({ portfolioId }: { portfolioId: string | null }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const todayMonth = getTodayCivilDateString().slice(0, 7);
  const [formOpen, setFormOpen] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formMonth, setFormMonth] = useState('');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const goalQuery = useQuery({
    queryKey: contributionGoalQueryKey(portfolioId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<{ data: ContributionGoalState }>(
        `/api/v1/portfolios/${portfolioId}/contribution-goal`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: contributionGoalQueryKey(portfolioId ?? '') });
    await queryClient.invalidateQueries({
      queryKey: ['portfolio-contribution-insights', portfolioId ?? ''],
    });
  };

  const parsed = (() => {
    const trimmed = formAmount.trim();
    if (trimmed === '') return { valid: false as const, reason: 'Informe o valor mensal da meta.' };
    const cents = parseScenarioMoneyToCents(trimmed);
    if (cents === null || cents <= BigInt(0)) {
      return { valid: false as const, reason: 'Valor inválido. Use o formato R$ 0,00.' };
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(formMonth)) {
      return { valid: false as const, reason: 'Informe o mês de início (ano-mês).' };
    }
    if (formMonth < todayMonth) {
      return {
        valid: false as const,
        reason: 'A meta passa a valer no mês atual ou em um mês futuro.',
      };
    }
    return { valid: true as const, reason: null };
  })();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/contribution-goal`,
        { amount: formAmount.trim(), effectiveMonth: formMonth },
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateAll();
      setAnnouncement(
        'Meta de aporte salva. Ela vale a partir do mês escolhido, sem reescrever o passado.',
      );
      closeForm();
    },
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/contribution-goal`,
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateAll();
      setConfirmingEnd(false);
      setAnnouncement('Meta de aporte encerrada. O histórico foi preservado.');
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setFormAmount('');
    setFormMonth('');
  };

  const openForm = (presetAmount?: string) => {
    setFormAmount(presetAmount ?? '');
    setFormMonth('');
    setFormOpen(true);
    setConfirmingEnd(false);
  };

  const data = goalQuery.data ?? null;
  const current = data?.current ?? null;

  return (
    <div
      id="contribution-goal"
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="contribution-goal"
    >
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
        Meta de aporte mensal
      </h3>
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
      {goalQuery.isLoading ? (
        <Skeleton width="100%" height="80px" />
      ) : goalQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar a meta"
          message="Tente novamente."
          onRetry={() => goalQuery.refetch()}
        />
      ) : !current && !formOpen ? (
        <EmptyState
          title="Você ainda não definiu uma meta mensal de aporte para esta carteira."
          description="A meta é um valor que você escolhe. O Atlas apenas compara planos e operações confirmadas com ela."
          actionLabel="Definir meta"
          onAction={() => openForm()}
        />
      ) : (
        <>
          {current ? (
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 12,
                backgroundColor: colors.surface,
                marginBottom: 8,
              }}
              data-testid="contribution-goal-current"
            >
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Meta definida por você
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {formatScenarioMoney(current.amount, current.currency)}{' '}
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>/ mês</span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Desde {formatMonthDay(current.effectiveFrom)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {!formOpen ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openForm(current.amount.replace('.', ','))}
                      style={{ minHeight: 44 }}
                      aria-label="Alterar meta de aporte"
                      data-testid="goal-edit-open"
                    >
                      Alterar
                    </Button>
                    {confirmingEnd ? (
                      <>
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            color: colors.textSecondary,
                            alignSelf: 'center',
                          }}
                        >
                          Encerrar a meta atual? O histórico de meses anteriores será preservado.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => endMutation.mutate()}
                          disabled={endMutation.isPending}
                          style={{ minHeight: 44 }}
                          aria-label="Confirmar encerramento da meta"
                          data-testid="goal-end-confirm"
                        >
                          {endMutation.isPending ? 'Encerrando…' : 'Confirmar encerramento'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmingEnd(false)}
                          disabled={endMutation.isPending}
                          style={{ minHeight: 44 }}
                        >
                          Manter meta
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormOpen(false);
                          setConfirmingEnd(true);
                        }}
                        style={{ minHeight: 44 }}
                        aria-label="Encerrar meta de aporte"
                        data-testid="goal-end-open"
                      >
                        Encerrar
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
              {endMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    endMutation.error,
                    'Não foi possível encerrar a meta. Tente novamente.',
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {data?.upcoming ? (
            <p
              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              data-testid="goal-upcoming"
            >
              A partir de {formatMonthDay(data.upcoming.effectiveFrom)}:{' '}
              {formatScenarioMoney(data.upcoming.amount, data.upcoming.currency)}/mês.
            </p>
          ) : null}
          {formOpen ? (
            <div
              style={{ marginTop: 8, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}
              data-testid="goal-form"
            >
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 4px' }}>
                {current ? 'Alterar meta' : 'Definir meta'}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 12px' }}>
                O Atlas salvará apenas o valor que você informar, a partir do mês escolhido. A
                alteração não reescreve os meses anteriores.
              </p>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                  Valor mensal
                </span>
                <input
                  value={formAmount}
                  onChange={(event) => setFormAmount(event.target.value)}
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  aria-label="Valor mensal da meta em reais"
                  data-testid="goal-form-amount"
                  style={{ ...inputStyle, width: 200, minHeight: 44, textAlign: 'right' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                  Aplicar a partir de
                </span>
                <input
                  type="month"
                  value={formMonth}
                  min={todayMonth}
                  onChange={(event) => setFormMonth(event.target.value)}
                  aria-label="Mês de início da meta"
                  data-testid="goal-form-month"
                  style={{ ...inputStyle, minHeight: 44 }}
                />
              </label>
              {parsed.reason !== null ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {parsed.reason}
                </p>
              ) : null}
              {saveMutation.isError ? (
                <p role="alert" style={{ fontSize: '0.875rem', color: colors.negative }}>
                  {errorMessage(
                    saveMutation.error,
                    'Não foi possível salvar a meta. Verifique os valores.',
                  )}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => saveMutation.mutate()}
                  disabled={parsed.reason !== null || saveMutation.isPending}
                  style={{ minHeight: 44 }}
                  aria-label={current ? 'Salvar alteração da meta' : 'Salvar meta de aporte'}
                  data-testid="goal-form-save"
                >
                  {saveMutation.isPending ? 'Salvando…' : 'Salvar meta'}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeForm}
                  style={{ minHeight: 44 }}
                  aria-label="Cancelar edição da meta"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
          {data && data.history.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory((previous) => !previous)}
                style={{ minHeight: 44 }}
                aria-label={showHistory ? 'Ocultar histórico de metas' : 'Ver histórico de metas'}
                aria-expanded={showHistory}
                data-testid="goal-history-toggle"
              >
                {showHistory ? 'Ocultar histórico' : 'Histórico de metas'}
              </Button>
              {showHistory ? (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: '8px 0 0',
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                  data-testid="goal-history"
                >
                  {data.history.map((row) => (
                    <li key={row.id} style={{ fontSize: '0.875rem' }}>
                      {formatMonthDay(row.effectiveFrom)} –{' '}
                      {row.effectiveTo ? formatMonthDay(row.effectiveTo) : '…'}:{' '}
                      {formatScenarioMoney(row.amount, row.currency)}/mês
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
