'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualPositionsQueryKey,
  mapToAnnualPositionReportViewModel,
  type RawAnnualPositionReport,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Card, SectionHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui';

interface AnnualPositionsSectionProps {
  portfolioId: string | null;
}

export function AnnualPositionsSection({ portfolioId }: AnnualPositionsSectionProps) {
  const authReady = useAuthReady();
  const [calendarYear, setCalendarYear] = useState<number>(2025);

  useEffect(() => {
    const previousYear = new Date().getFullYear() - 1;
    setCalendarYear(previousYear > 2000 ? previousYear : 2025);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: portfolioId
      ? annualPositionsQueryKey(calendarYear, portfolioId)
      : ['fiscal', 'annual', 'disabled'],
    queryFn: async () => {
      if (!portfolioId) return null;
      const res = await apiClient.get<{ data: RawAnnualPositionReport }>(
        `/api/v1/fiscal/annual/${calendarYear}/positions?portfolioId=${portfolioId}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId && calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => (data ? mapToAnnualPositionReportViewModel(data) : null), [data]);

  return (
    <div style={{ marginTop: `${spacing.xl}px` }} data-testid="annual-positions-section">
      <SectionHeader
        title="IRPF Anual — Posições em 31/12 (Bens e Direitos)"
        description="Posições patrimoniais apuradas estritamente pelo custo histórico de aquisição em 31/12 via replay determinístico do livro-razão imutável."
      />

      {/* Year Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.md}px`,
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="calendar-year-select"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textSecondary }}
        >
          Ano-calendário:
        </label>
        <select
          id="calendar-year-select"
          value={calendarYear}
          onChange={(e) => setCalendarYear(Number(e.target.value))}
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: `${borderRadius.sm}px`,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            color: colors.textPrimary,
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
          data-testid="annual-year-select"
        >
          {[2024, 2025, 2026, 2027].map((yr) => (
            <option key={yr} value={yr}>
              {yr} (Exercício {yr + 1})
            </option>
          ))}
        </select>

        {viewModel && (
          <span
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.sm}px`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: viewModel.summary.completenessBadge.color,
              backgroundColor: viewModel.summary.completenessBadge.bg,
              border: `1px solid ${viewModel.summary.completenessBadge.color}`,
            }}
            data-testid="annual-completeness-badge"
          >
            {viewModel.summary.completenessBadge.label}
          </span>
        )}
      </div>

      {/* Legal & Historical Cost Note */}
      <div
        style={{
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: `${borderRadius.sm}px`,
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          border: `1px solid rgba(59, 130, 246, 0.2)`,
          marginBottom: `${spacing.md}px`,
          fontSize: '0.8125rem',
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: colors.textPrimary }}>
          Regra da Receita Federal (Bens e Direitos):
        </strong>{' '}
        Os valores declarados correspondem estritamente ao{' '}
        <strong>custo histórico de aquisição</strong> dos ativos em 31/12, e <strong>nunca</strong>{' '}
        à cotação ou valor de mercado atual.
      </div>

      {!portfolioId && (
        <EmptyState
          title="Selecione uma carteira"
          description="Selecione uma carteira para visualizar as posições anuais de Bens e Direitos em 31/12."
        />
      )}

      {portfolioId && isLoading && (
        <Card>
          <Skeleton height={200} />
        </Card>
      )}

      {portfolioId && isError && (
        <ErrorState
          title="Erro ao carregar posições anuais"
          message={error instanceof Error ? error.message : 'Falha na comunicação com a API.'}
          onRetry={() => refetch()}
        />
      )}

      {portfolioId && !isLoading && !isError && viewModel && (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: `${spacing.md}px`,
              marginBottom: `${spacing.md}px`,
            }}
          >
            <Card>
              <div
                style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Custo Histórico Total em 31/12
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: viewModel.summary.totalHistoricalCostKnown
                    ? colors.textPrimary
                    : colors.textSecondary,
                }}
                data-testid="annual-total-cost"
              >
                {viewModel.summary.formattedTotalHistoricalCost}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.summary.totalHistoricalCostKnown
                  ? 'Total conhecido'
                  : 'Custo histórico total incompleto / bloqueado'}
              </div>
            </Card>

            <Card>
              <div
                style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Total de Ativos em Custódia
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}>
                {viewModel.summary.totalAssetsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.summary.completePositionsCount} completos |{' '}
                {viewModel.summary.blockedPositionsCount} bloqueados
              </div>
            </Card>
          </div>

          {/* Positions Table */}
          {viewModel.positions.length === 0 ? (
            <EmptyState
              title={`Nenhum ativo em custódia em 31/12/${calendarYear}`}
              description="A carteira não possuía posições abertas na data de corte anual."
            />
          ) : (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.875rem',
                    textAlign: 'left',
                  }}
                  data-testid="annual-positions-table"
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: `${spacing.sm}px` }}>Ativo / Ticker</th>
                      <th style={{ padding: `${spacing.sm}px` }}>Categoria</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                        Qtd em 31/12
                      </th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                        Custo Histórico Total
                      </th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                        Custo Médio
                      </th>
                      <th style={{ padding: `${spacing.sm}px` }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.positions.map((pos) => (
                      <tr
                        key={pos.assetId}
                        style={{
                          borderBottom: `1px solid ${colors.border}`,
                        }}
                        data-testid={`annual-position-row-${pos.ticker}`}
                      >
                        <td
                          style={{
                            padding: `${spacing.sm}px`,
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          {pos.ticker}
                          {pos.openingPositionApplied && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '0.6875rem',
                                color: colors.accent,
                                fontWeight: 500,
                              }}
                            >
                              (Abertura)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          {pos.categoryLabel}
                        </td>
                        <td
                          style={{
                            padding: `${spacing.sm}px`,
                            textAlign: 'right',
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          {pos.quantity}
                        </td>
                        <td
                          style={{
                            padding: `${spacing.sm}px`,
                            textAlign: 'right',
                            fontWeight: 600,
                            color: pos.totalHistoricalCost
                              ? colors.textPrimary
                              : colors.textSecondary,
                          }}
                        >
                          {pos.formattedTotalHistoricalCost}
                        </td>
                        <td
                          style={{
                            padding: `${spacing.sm}px`,
                            textAlign: 'right',
                            color: colors.textSecondary,
                          }}
                        >
                          {pos.formattedAverageHistoricalCost}
                        </td>
                        <td style={{ padding: `${spacing.sm}px` }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: `${borderRadius.sm}px`,
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              color: pos.completenessBadge.color,
                              backgroundColor: pos.completenessBadge.bg,
                              border: `1px solid ${pos.completenessBadge.color}`,
                            }}
                          >
                            {pos.completenessBadge.label}
                          </span>
                          {pos.blockingReasons.length > 0 && (
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: colors.negative,
                                marginTop: '2px',
                              }}
                            >
                              {pos.blockingReasons.map((r) => r.label).join(', ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
