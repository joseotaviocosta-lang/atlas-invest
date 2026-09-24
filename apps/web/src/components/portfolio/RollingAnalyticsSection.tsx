'use client';

import React, { useMemo, useState } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioRollingAnalyticsViewModel,
  RawRollingAnalyticsData,
  ROLLING_METRIC_OPTIONS,
  ROLLING_METRIC_TOOLTIPS,
  ROLLING_WINDOW_OPTIONS,
  RollingMetric,
} from '@atlas/ui';
import { RollingRiskChart } from '@/components/portfolio/RollingRiskChart';

export type RollingAnalyticsQueryData = { data: RawRollingAnalyticsData } | undefined;

/**
 * Rolling analytics subsection (3M, ADR-148).
 * Renders server-computed rolling volatility/Beta/Sharpe series only. Zero math:
 * no return slicing, variance, covariance, beta, volatility, Sharpe or
 * annualization is computed here. Null points are gaps (never connected).
 */
export function RollingAnalyticsSection({
  data,
  isLoading,
  isError,
  onRetry,
  window: windowValue,
  onWindowChange,
}: {
  data: RollingAnalyticsQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  window: number;
  onWindowChange: (window: number) => void;
}) {
  const [metric, setMetric] = useState<RollingMetric>('VOLATILITY');
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioRollingAnalyticsViewModel(data.data) : null),
    [data],
  );

  return (
    <Card style={{ padding: 16 }} data-testid="rolling-analytics-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Evolução do risco</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Métricas históricas móveis por janela de observações. Valores históricos, não previsões.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, alignSelf: 'center' }}>Janela:</span>
        {ROLLING_WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onWindowChange(opt.value)}
            aria-label={`Selecionar janela ${opt.label}`}
            aria-pressed={windowValue === opt.value}
            data-testid={`rolling-window-${opt.value}`}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${windowValue === opt.value ? colors.accent : colors.border}`,
              background: windowValue === opt.value ? colors.accentSubtle : colors.surface,
              color: windowValue === opt.value ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, alignSelf: 'center' }}>Métrica:</span>
        {ROLLING_METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMetric(opt.value)}
            aria-label={`Selecionar métrica ${opt.label}`}
            aria-pressed={metric === opt.value}
            data-testid={`rolling-metric-${opt.value}`}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${metric === opt.value ? colors.accent : colors.border}`,
              background: metric === opt.value ? colors.accentSubtle : colors.surface,
              color: metric === opt.value ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            {opt.label}
          </button>
        ))}
        <span
          role="img"
          aria-label={ROLLING_METRIC_TOOLTIPS[metric]}
          title={ROLLING_METRIC_TOOLTIPS[metric]}
          style={{ cursor: 'help', fontSize: 12, alignSelf: 'center' }}
        >
          ⓘ
        </span>
      </div>

      {isLoading ? (
        <div aria-label="Carregando evolução do risco">
          <Skeleton width="100%" height="300px" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar a evolução do risco." onRetry={onRetry} />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para esta janela."
          description="Não há observações econômicas suficientes para a janela selecionada. Tente uma janela menor. O restante da página continua válido."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para análise móvel.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) => {
            const series =
              metric === 'VOLATILITY' ? cur.volatility : metric === 'BETA' ? cur.beta : cur.sharpe;
            const incompatibleMetric = cur.isIncompatibleCurrency && metric !== 'VOLATILITY';
            return (
              <div key={cur.currency} data-testid={`rolling-${cur.currency}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <strong>{cur.currency}</strong>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>
                    {viewModel.windowLabel} • {series.points.length} pontos
                  </span>
                </div>
                {incompatibleMetric ? (
                  <div
                    data-testid={`rolling-${cur.currency}-unavailable`}
                    style={{ fontSize: 13, color: colors.textSecondary }}
                  >
                    Histórico insuficiente para esta janela.
                  </div>
                ) : !series.isAvailable ? (
                  <div
                    data-testid={`rolling-${cur.currency}-unavailable`}
                    style={{ fontSize: 13, color: colors.textSecondary }}
                  >
                    Histórico insuficiente para esta janela.
                  </div>
                ) : (
                  <RollingRiskChart series={series} metric={metric} currency={cur.currency} />
                )}
              </div>
            );
          })}

          <p
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            {viewModel.accessibilitySummary}
          </p>
        </div>
      )}
    </Card>
  );
}
