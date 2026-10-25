'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button, Badge } from '@/components/ui';
import { colors, spacing, getTodayCivilDateString } from '@atlas/ui';
import {
  describeInsightsLimitation,
  formatPlanDate,
  formatPlanMonthLong,
  formatScenarioMoney,
} from '@atlas/ui';
import { dispatchCreatePlan } from './PortfolioContributionPlans';

interface CalendarTotals {
  currency: string;
  planned: string;
  plannedCount: number;
  completedCount: number;
  cancelledCount: number;
  confirmed: string;
  confirmedCount: number;
}

interface CalendarPlanRow {
  id: string;
  name: string;
  plannedDate: string;
  status: string;
  currency: string;
  total: string;
}

interface CalendarActualRow {
  tradeDate: string;
  amount: string;
  currency: string;
  type: string;
  linkedPlanId: string;
  linkedPlanName: string;
}

interface CalendarMonth {
  month: string;
  isCurrentMonth: boolean;
  goal: { amount: string; currency: string } | null;
  goalChange: boolean;
  totalsByCurrency: CalendarTotals[];
  plannedDifferenceToGoal: string | null;
  confirmedDifferenceToGoal: string | null;
  plans: CalendarPlanRow[];
  confirmedActuals: CalendarActualRow[];
}

interface CalendarSummary {
  currency: string;
  goalTotal: string;
  plannedTotal: string;
  confirmedTotal: string;
  plannedDifference: string | null;
  confirmedDifference: string | null;
  monthsWithGoal: number;
  monthsWithoutGoal: number;
}

interface CalendarData {
  range: { from: string; to: string };
  generatedAt: string;
  currencies: string[];
  months: CalendarMonth[];
  summaryByCurrency: CalendarSummary[];
  limitations: string[];
}

export function contributionCalendarQueryKey(portfolioId: string, year: string) {
  return ['portfolio-contribution-calendar', portfolioId, year];
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Depósito',
};

function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}

function formatSignedMoney(canonical: string, currency: string): string {
  const negative = canonical.trim().startsWith('-');
  const abs = negative ? canonical.trim().slice(1) : canonical;
  return `${negative ? '-' : ''}${formatScenarioMoney(abs, currency)}`;
}

function planStatusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Realizado';
  if (status === 'CANCELLED') return 'Cancelado';
  return 'Planejado';
}

function planStatusVariant(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED') return 'neutral';
  return 'warning';
}

/**
 * Phase 5Q-K — contribution planning calendar (read-only temporal view).
 *
 * Monthly timeline composing the user-defined goal, plans and CONFIRMED
 * actuals. Organizes existing facts only: the "Criar plano" action merely
 * opens the 5Q-F form with the month's date pre-filled — amounts are
 * never pre-filled, nothing is generated or executed.
 */
export function PortfolioContributionCalendar({
  portfolioId,
  onOpenPlan,
}: {
  portfolioId: string | null;
  onOpenPlan: (planId: string) => void;
}) {
  const authReady = useAuthReady();
  const today = useMemo(() => getTodayCivilDateString(), []);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const [year, setYear] = useState<string>(currentYear);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const calendarQuery = useQuery({
    queryKey: contributionCalendarQueryKey(portfolioId ?? '', year),
    queryFn: async () => {
      const res = await apiClient.get<{ data: CalendarData }>(
        `/api/v1/portfolios/${portfolioId}/contribution-calendar?from=${year}-01&to=${year}-12`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const data = calendarQuery.data ?? null;

  useEffect(() => {
    if (data) {
      const current = data.months.find((row) => row.isCurrentMonth);
      if (current) {
        setExpanded((previous) =>
          previous[current.month] === undefined ? { ...previous, [current.month]: true } : previous,
        );
      }
    }
  }, [data]);

  const toggleMonth = (month: string) => {
    setExpanded((previous) => ({ ...previous, [month]: !previous[month] }));
  };

  const scrollToGoal = () => {
    document.getElementById('contribution-goal')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      id="contribution-calendar"
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="contribution-calendar"
    >
      <SectionHeader
        title="Visão mensal"
        description="Mês a mês: a meta definida por você, os planos criados e as operações confirmadas no ledger."
      />
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          margin: '12px 0',
          flexWrap: 'wrap',
        }}
        role="group"
        aria-label="Ano do calendário"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setYear((previous) => String(Number(previous) - 1))}
          style={{ minHeight: 44 }}
          aria-label="Ver ano anterior"
          data-testid="calendar-year-prev"
        >
          ←
        </Button>
        <span style={{ fontSize: '0.9375rem', fontWeight: 700 }} data-testid="calendar-year">
          {year}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setYear((previous) => String(Number(previous) + 1))}
          style={{ minHeight: 44 }}
          aria-label="Ver próximo ano"
          data-testid="calendar-year-next"
        >
          →
        </Button>
        {year !== currentYear ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setYear(currentYear)}
            style={{ minHeight: 44 }}
            aria-label="Voltar ao ano atual"
            data-testid="calendar-year-today"
          >
            Hoje
          </Button>
        ) : null}
      </div>

      {calendarQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : calendarQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar o calendário"
          message="Tente novamente."
          onRetry={() => calendarQuery.refetch()}
        />
      ) : !data || data.months.length === 0 ? (
        <EmptyState
          title="Nenhuma meta, plano ou operação confirmada neste período."
          description="Meses com metas, planos ou operações confirmadas aparecerão aqui."
        />
      ) : (
        <>
          {data.limitations.map((limitation) => (
            <p
              key={limitation}
              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              data-testid={`calendar-limitation-${limitation}`}
            >
              {describeInsightsLimitation(limitation)}
            </p>
          ))}
          {data.summaryByCurrency.length > 0 &&
          data.summaryByCurrency.some(
            (row) =>
              row.monthsWithGoal > 0 || row.plannedTotal !== '0' || row.confirmedTotal !== '0',
          ) ? (
            <p style={{ fontSize: '0.9375rem', margin: '8px 0' }} data-testid="calendar-summary">
              {data.summaryByCurrency.map((row, index) => (
                <span key={row.currency}>
                  {index > 0 ? ' ' : null}
                  No período ({row.currency}): meta definida{' '}
                  {formatScenarioMoney(row.goalTotal, row.currency)} · planejado{' '}
                  {formatScenarioMoney(row.plannedTotal, row.currency)} · confirmado{' '}
                  {formatScenarioMoney(row.confirmedTotal, row.currency)}.
                </span>
              ))}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {data.months.map((month) => {
              const isExpanded = expanded[month.month] ?? false;
              const pastDue = !month.isCurrentMonth && month.month < currentMonth;
              return (
                <article
                  key={month.month}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: colors.surface,
                  }}
                  data-testid={`calendar-month-${month.month}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <h4
                      id={`calendar-month-heading-${month.month}`}
                      style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}
                    >
                      {formatPlanMonthLong(month.month)}
                    </h4>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      {month.isCurrentMonth ? (
                        <Badge variant="warning">Mês atual</Badge>
                      ) : month.month > currentMonth ? (
                        <Badge variant="neutral">Planejamento</Badge>
                      ) : (
                        <Badge variant="neutral">Histórico</Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMonth(month.month)}
                        style={{ minHeight: 44 }}
                        aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${formatPlanMonthLong(month.month)}`}
                        aria-expanded={isExpanded}
                        aria-controls={`calendar-month-detail-${month.month}`}
                        data-testid={`calendar-month-toggle-${month.month}`}
                      >
                        {isExpanded ? 'Recolher' : 'Expandir'}
                      </Button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: 4 }}>
                    {month.goal ? (
                      <>
                        Meta definida: {formatScenarioMoney(month.goal.amount, month.goal.currency)}
                        {month.goalChange ? (
                          <>
                            {' '}
                            <span data-testid={`calendar-goal-change-${month.month}`}>
                              Meta passa a{' '}
                              {formatScenarioMoney(month.goal.amount, month.goal.currency)}
                              /mês neste mês.
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Sem meta definida{' '}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={scrollToGoal}
                          style={{ minHeight: 44 }}
                          aria-label="Definir meta de aporte"
                          data-testid={`calendar-define-goal-${month.month}`}
                        >
                          Definir meta
                        </Button>
                      </>
                    )}
                  </div>

                  {month.totalsByCurrency.map((totals) => (
                    <div
                      key={totals.currency}
                      style={{ fontSize: '0.8125rem', marginTop: 4 }}
                      data-testid={`calendar-totals-${month.month}-${totals.currency}`}
                    >
                      Planejado {formatScenarioMoney(totals.planned, totals.currency)} · Confirmado{' '}
                      {totals.confirmedCount > 0
                        ? formatScenarioMoney(totals.confirmed, totals.currency)
                        : month.month >= currentMonth
                          ? 'nenhuma operação confirmada ainda'
                          : formatScenarioMoney(totals.confirmed, totals.currency)}
                      {month.plannedDifferenceToGoal !== null &&
                      totals.currency === month.goal?.currency ? (
                        <>
                          {' '}
                          · Diferença planejada{' '}
                          {formatSignedMoney(month.plannedDifferenceToGoal, totals.currency)}
                        </>
                      ) : null}
                    </div>
                  ))}

                  {isExpanded ? (
                    <div id={`calendar-month-detail-${month.month}`} style={{ marginTop: 8 }}>
                      {month.plans.length > 0 ? (
                        <ul
                          style={{
                            listStyle: 'none',
                            margin: '8px 0 0',
                            padding: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          {month.plans.map((plan) => (
                            <li
                              key={plan.id}
                              style={{ fontSize: '0.8125rem' }}
                              data-testid={`calendar-plan-${plan.id}`}
                            >
                              {formatPlanDate(plan.plannedDate)} · {plan.name} ·{' '}
                              <Badge variant={planStatusVariant(plan.status)}>
                                {planStatusLabel(plan.status)}
                              </Badge>{' '}
                              {formatScenarioMoney(plan.total, plan.currency)}
                              {plan.status === 'PLANNED' && plan.plannedDate < today ? (
                                <>
                                  {' '}
                                  <Badge variant="warning">Data planejada já passou</Badge>
                                </>
                              ) : null}{' '}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenPlan(plan.id)}
                                style={{ minHeight: 44 }}
                                aria-label={`Ver plano ${plan.name}`}
                                data-testid={`calendar-plan-open-${plan.id}`}
                              >
                                Ver plano
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {month.confirmedActuals.length > 0 ? (
                        <ul
                          style={{
                            listStyle: 'none',
                            margin: '8px 0 0',
                            padding: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          {month.confirmedActuals.map((actual, index) => (
                            <li
                              key={`${actual.tradeDate}-${actual.amount}-${index}`}
                              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                              data-testid={`calendar-actual-${month.month}-${index}`}
                            >
                              {formatPlanDate(actual.tradeDate)} ·{' '}
                              {transactionTypeLabel(actual.type)} ·{' '}
                              {formatScenarioMoney(actual.amount, actual.currency)} · Confirmado no
                              ledger · Vinculado ao plano {actual.linkedPlanName}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {(month.isCurrentMonth || month.month > currentMonth) && portfolioId ? (
                        <div style={{ marginTop: 8 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              dispatchCreatePlan({
                                plannedDate:
                                  month.month === currentMonth ? today : `${month.month}-01`,
                              })
                            }
                            style={{ minHeight: 44 }}
                            aria-label={`Criar plano em ${formatPlanMonthLong(month.month)}`}
                            data-testid={`calendar-create-plan-${month.month}`}
                          >
                            Criar plano
                          </Button>
                        </div>
                      ) : null}
                      {pastDue &&
                      month.plans.length === 0 &&
                      month.confirmedActuals.length === 0 ? (
                        <p
                          style={{
                            fontSize: '0.8125rem',
                            color: colors.textSecondary,
                            margin: '8px 0 0',
                          }}
                        >
                          Até agora, nenhuma operação confirmada para este mês.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
