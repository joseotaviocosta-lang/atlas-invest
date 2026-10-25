'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button, Badge } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeInsightsLimitation,
  formatPlanDate,
  formatPlanMonth,
  formatScenarioMoney,
  scenarioCategoryLabel,
} from '@atlas/ui';

export const INSIGHT_PERIODS = [
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'No ano' },
  { value: '1A', label: '1 ano' },
  { value: 'INCEPTION', label: 'Desde o início' },
] as const;

interface InsightsMonth {
  month: string;
  planned: string;
  confirmed: string;
  difference: string;
  plannedCount: number;
  completedCount: number;
}

interface InsightsData {
  period: string;
  generatedAt: string;
  currency: string | null;
  summary: {
    plannedTotal: string;
    confirmedTotal: string;
    difference: string;
    completionBp: number | null;
    plannedPlanCount: number;
    completedPlanCount: number;
    cancelledPlanCount: number;
    plansWithConfirmed: number;
    plansWithoutConfirmed: number;
    completedWithoutConfirmedCount: number;
    plannedWithConfirmedCount: number;
    confirmedTransactionCount: number;
  } | null;
  summariesByCurrency: Array<{
    currency: string;
    plannedTotal: string;
    confirmedTotal: string;
    difference: string;
  }>;
  timeline: InsightsMonth[];
  statusBreakdown: Array<{ status: string; count: number; plannedTotal: string }>;
  byCategory: Array<{ category: string; planned: string; confirmed: string; difference: string }>;
  recentPlans: Array<{
    id: string;
    name: string;
    plannedDate: string;
    status: string;
    plannedTotal: string;
    confirmedTotal: string;
    difference: string;
    confirmedCount: number;
  }>;
  limitations: string[];
}

/** Decimal string -> integer micro-units, string math only (pixel geometry, never math on money). */
function decimalToMicroUnits(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart = ''] = abs.split('.');
  const frac = (fracPart + '000000').slice(0, 6);
  const scaled = Number(intPart || '0') * 1e6 + Number(frac || '0');
  return negative ? -scaled : scaled;
}

function TimelineBars({ months, currency }: { months: InsightsMonth[]; currency: string }) {
  const width = 640;
  const height = 180;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const geometry = useMemo(() => {
    if (months.length === 0) return null;
    const values = months.flatMap((month) => [
      decimalToMicroUnits(month.planned),
      decimalToMicroUnits(month.confirmed),
    ]);
    const max = Math.max(...values, 0);
    const span = max === 0 ? 1 : max;
    const groupW = (width - padL - padR) / months.length;
    const barW = Math.max(4, Math.min(28, (groupW - 12) / 2));
    return { span, groupW, barW };
  }, [months]);
  if (!geometry) return null;
  const { span, groupW, barW } = geometry;
  const innerH = height - padT - padB;
  const yAt = (scaled: number): number => padT + (1 - scaled / span) * innerH;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Planejado e confirmado por mês"
      data-testid="insights-timeline-chart"
    >
      {months.map((month, index) => {
        const planned = decimalToMicroUnits(month.planned);
        const confirmed = decimalToMicroUnits(month.confirmed);
        const x = padL + index * groupW + (groupW - barW * 2 - 4) / 2;
        const plannedH = Math.max(0, (planned / span) * innerH);
        const confirmedH = Math.max(0, (confirmed / span) * innerH);
        return (
          <g key={month.month}>
            <rect
              x={x}
              y={yAt(planned)}
              width={barW}
              height={plannedH}
              fill="none"
              stroke={colors.textSecondary}
              strokeWidth={1.5}
            >
              <title>
                {formatPlanMonth(month.month)} planejado:{' '}
                {formatScenarioMoney(month.planned, currency)}
              </title>
            </rect>
            <rect
              x={x + barW + 4}
              y={yAt(confirmed)}
              width={barW}
              height={confirmedH}
              fill={colors.accent}
            >
              <title>
                {formatPlanMonth(month.month)} confirmado:{' '}
                {formatScenarioMoney(month.confirmed, currency)}
              </title>
            </rect>
            <text
              x={x + barW + 2}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill={colors.textSecondary}
            >
              {formatPlanMonth(month.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function formatSignedMoney(canonical: string, currency: string): string {
  const negative = canonical.trim().startsWith('-');
  const abs = negative ? canonical.trim().slice(1) : canonical;
  return `${negative ? '-' : ''}${formatScenarioMoney(abs, currency)}`;
}

/**
 * Phase 5Q-I — contribution insights (facts only, read-only).
 * Hero totals, status counts, monthly timeline (chart + table),
 * category breakdown from confirmed actuals, and recent plans with
 * navigation. Derived totals with neutral copy and no judgment language.
 */
export function PortfolioContributionInsights({
  portfolioId,
  onOpenPlan,
}: {
  portfolioId: string | null;
  onOpenPlan: (planId: string) => void;
}) {
  const authReady = useAuthReady();
  const [period, setPeriod] = useState<string>('1A');

  const insightsQuery = useQuery({
    queryKey: ['portfolio-contribution-insights', portfolioId, period],
    queryFn: async () => {
      const res = await apiClient.get<{ data: InsightsData }>(
        `/api/v1/portfolios/${portfolioId}/contribution-insights?period=${period}`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
  });

  const data = insightsQuery.data ?? null;
  const summary = data?.summary ?? null;

  return (
    <div
      id="contribution-insights"
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="contribution-insights"
    >
      <SectionHeader
        title="Histórico e acompanhamento"
        description="O que foi planejado e o que foi confirmado em operações, por período."
      />
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}
        role="group"
        aria-label="Período do histórico"
      >
        {INSIGHT_PERIODS.map((preset) => (
          <Button
            key={preset.value}
            variant={period === preset.value ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPeriod(preset.value)}
            style={{ minHeight: 44 }}
            aria-label={`Ver histórico de ${preset.label}`}
            aria-pressed={period === preset.value}
            data-testid={`insights-period-${preset.value}`}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {insightsQuery.isLoading ? (
        <Skeleton width="100%" height="120px" />
      ) : insightsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar o histórico"
          message="Tente novamente."
          onRetry={() => insightsQuery.refetch()}
        />
      ) : !data || (!summary && data.summariesByCurrency.length === 0) ? (
        <EmptyState
          title="Nenhum plano neste período"
          description="Planos de aporte criados aparecerão aqui com o acompanhamento do que foi confirmado."
        />
      ) : (
        <>
          {data.limitations.map((limitation) => (
            <p
              key={limitation}
              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              data-testid={`insights-limitation-${limitation}`}
            >
              {describeInsightsLimitation(limitation)}
            </p>
          ))}
          {summary ? (
            <>
              <p style={{ fontSize: '0.9375rem', margin: '8px 0' }} data-testid="insights-hero">
                No período: planejado{' '}
                <strong>{formatScenarioMoney(summary.plannedTotal, data.currency ?? 'BRL')}</strong>
                . Identificado em operações confirmadas:{' '}
                <strong>
                  {formatScenarioMoney(summary.confirmedTotal, data.currency ?? 'BRL')}
                </strong>
                . Diferença:{' '}
                <strong>{formatSignedMoney(summary.difference, data.currency ?? 'BRL')}</strong>.
              </p>
              {summary.completionBp !== null ? (
                <p
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}
                >
                  {formatScenarioMoney(summary.confirmedTotal, data.currency ?? 'BRL')} de{' '}
                  {formatScenarioMoney(summary.plannedTotal, data.currency ?? 'BRL')} planejados
                  foram identificados em operações confirmadas.
                </p>
              ) : null}
              <div
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}
                data-testid="insights-status"
              >
                {data.statusBreakdown.map((row) => (
                  <span
                    key={row.status}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    <Badge
                      variant={
                        row.status === 'COMPLETED'
                          ? 'success'
                          : row.status === 'CANCELLED'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {row.status === 'PLANNED'
                        ? 'Planejados'
                        : row.status === 'COMPLETED'
                          ? 'Realizados'
                          : 'Cancelados'}
                      : {row.count}
                    </Badge>
                  </span>
                ))}
              </div>
              {data.timeline.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <TimelineBars months={data.timeline} currency={data.currency ?? 'BRL'} />
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}
                    >
                      <thead>
                        <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                          <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                            Mês
                          </th>
                          <th
                            scope="col"
                            style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                          >
                            Planejado
                          </th>
                          <th
                            scope="col"
                            style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                          >
                            Confirmado
                          </th>
                          <th
                            scope="col"
                            style={{
                              padding: '6px 0 6px 8px',
                              fontWeight: 600,
                              textAlign: 'right',
                            }}
                          >
                            Diferença
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.timeline.map((row) => (
                          <tr key={row.month} style={{ borderTop: `1px solid ${colors.border}` }}>
                            <td style={{ padding: '8px 8px 8px 0' }}>
                              {formatPlanMonth(row.month)}
                            </td>
                            <td style={{ padding: 8, textAlign: 'right' }}>
                              {formatScenarioMoney(row.planned, data.currency ?? 'BRL')}
                            </td>
                            <td style={{ padding: 8, textAlign: 'right' }}>
                              {formatScenarioMoney(row.confirmed, data.currency ?? 'BRL')}
                            </td>
                            <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                              {formatSignedMoney(row.difference, data.currency ?? 'BRL')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {data.byCategory.length > 0 ? (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}
                    data-testid="insights-by-category"
                  >
                    <thead>
                      <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                        <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                          Categoria
                        </th>
                        <th
                          scope="col"
                          style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                        >
                          Planejado
                        </th>
                        <th
                          scope="col"
                          style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                        >
                          Confirmado
                        </th>
                        <th
                          scope="col"
                          style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}
                        >
                          Diferença
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCategory.map((row) => (
                        <tr key={row.category} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>
                            {scenarioCategoryLabel(row.category)}
                          </td>
                          <td style={{ padding: 8, textAlign: 'right' }}>
                            {formatScenarioMoney(row.planned, data.currency ?? 'BRL')}
                          </td>
                          <td style={{ padding: 8, textAlign: 'right' }}>
                            {formatScenarioMoney(row.confirmed, data.currency ?? 'BRL')}
                          </td>
                          <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                            {formatSignedMoney(row.difference, data.currency ?? 'BRL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            data.summariesByCurrency.map((group) => (
              <p
                key={group.currency}
                style={{ fontSize: '0.875rem', margin: '8px 0' }}
                data-testid={`insights-currency-${group.currency}`}
              >
                {group.currency}: planejado{' '}
                {formatScenarioMoney(group.plannedTotal, group.currency)}; confirmado{' '}
                {formatScenarioMoney(group.confirmedTotal, group.currency)}.
              </p>
            ))
          )}
          {data.recentPlans.length > 0 ? (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}
                data-testid="insights-recent-plans"
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                    <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                      Plano
                    </th>
                    <th scope="col" style={{ padding: '6px 8px', fontWeight: 600 }}>
                      Data
                    </th>
                    <th scope="col" style={{ padding: '6px 8px', fontWeight: 600 }}>
                      Estado
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Planejado
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Confirmado
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Diferença
                    </th>
                    <th scope="col" style={{ padding: '6px 0 6px 8px', fontWeight: 600 }}>
                      <span
                        style={{
                          position: 'absolute',
                          width: 1,
                          height: 1,
                          overflow: 'hidden',
                          clip: 'rect(0 0 0 0)',
                        }}
                      >
                        Abrir
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPlans.map((plan) => (
                    <tr key={plan.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>{plan.name}</td>
                      <td style={{ padding: 8 }}>{formatPlanDate(plan.plannedDate)}</td>
                      <td style={{ padding: 8 }}>
                        <Badge
                          variant={
                            plan.status === 'COMPLETED'
                              ? 'success'
                              : plan.status === 'CANCELLED'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {plan.status === 'PLANNED'
                            ? 'Planejado'
                            : plan.status === 'COMPLETED'
                              ? 'Realizado'
                              : 'Cancelado'}
                        </Badge>
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {formatScenarioMoney(plan.plannedTotal, data.currency ?? 'BRL')}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {formatScenarioMoney(plan.confirmedTotal, data.currency ?? 'BRL')}
                      </td>
                      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                        {formatSignedMoney(plan.difference, data.currency ?? 'BRL')}
                      </td>
                      <td style={{ padding: '8px 0 8px 8px' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenPlan(plan.id)}
                          style={{ minHeight: 44 }}
                          aria-label={`Ver plano ${plan.name}`}
                        >
                          Ver plano
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {data.recentPlans.some(
            (plan) => plan.status === 'COMPLETED' && plan.confirmedCount === 0,
          ) ? (
            <div style={{ marginTop: 8 }} data-testid="insights-awaiting-links">
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}>
                Aguardar vínculo de operações: planos marcados como realizados ainda sem operações
                confirmadas. Isso não é um erro — apenas ainda não há evidência vinculada no
                livro-razão.
              </p>
              {data.recentPlans
                .filter((plan) => plan.status === 'COMPLETED' && plan.confirmedCount === 0)
                .map((plan) => (
                  <div
                    key={plan.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}
                  >
                    <span style={{ fontSize: '0.8125rem', flex: 1 }}>{plan.name}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenPlan(plan.id)}
                      style={{ minHeight: 44 }}
                      aria-label={`Revisar plano ${plan.name}`}
                    >
                      Revisar plano
                    </Button>
                  </div>
                ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
