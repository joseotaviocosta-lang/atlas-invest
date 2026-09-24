import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioRollingAnalyticsViewModel,
  RawRollingAnalyticsData,
  ROLLING_METRIC_OPTIONS,
  ROLLING_METRIC_TOOLTIPS,
  ROLLING_WINDOW_OPTIONS,
  RollingMetric,
} from '@atlas/ui';
import { MobileRollingRiskChart } from '@/components/portfolio/MobileRollingRiskChart';

export type MobileRollingAnalyticsQueryData = { data: RawRollingAnalyticsData } | undefined;

/**
 * Rolling analytics subsection (3M, ADR-148).
 * Renders server-computed rolling volatility/Beta/Sharpe series only — zero math.
 * Null points are gaps (never connected).
 */
export function MobileRollingAnalyticsSection({
  data,
  isLoading,
  isError,
  onRetry,
  window: windowValue,
  onWindowChange,
}: {
  data: MobileRollingAnalyticsQueryData;
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
    <View testID="rolling-analytics-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Evolução do risco</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Métricas históricas móveis por janela de observações. Valores históricos, não previsões.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ROLLING_WINDOW_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onWindowChange(opt.value)}
              accessibilityLabel={`Selecionar janela ${opt.label}`}
              accessibilityRole="button"
              testID={`rolling-window-${opt.value}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: windowValue === opt.value ? colors.accent : colors.border,
                backgroundColor: windowValue === opt.value ? colors.accentSubtle : colors.surface,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: windowValue === opt.value ? colors.accent : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ROLLING_METRIC_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setMetric(opt.value)}
              accessibilityLabel={`Selecionar métrica ${opt.label}`}
              accessibilityRole="button"
              testID={`rolling-metric-${opt.value}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: metric === opt.value ? colors.accent : colors.border,
                backgroundColor: metric === opt.value ? colors.accentSubtle : colors.surface,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: metric === opt.value ? colors.accent : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {ROLLING_METRIC_TOOLTIPS[metric]}
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando evolução do risco" />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar a evolução do risco." onRetry={onRetry} />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para esta janela."
            description="Sem observações econômicas suficientes para a janela selecionada."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para análise móvel."
              >
                Dados parciais para análise móvel.
              </Text>
            )}
            {viewModel.currencies.map((cur) => {
              const series =
                metric === 'VOLATILITY'
                  ? cur.volatility
                  : metric === 'BETA'
                    ? cur.beta
                    : cur.sharpe;
              const incompatibleMetric = cur.isIncompatibleCurrency && metric !== 'VOLATILITY';
              return (
                <View key={cur.currency} style={{ gap: 8 }} testID={`rolling-${cur.currency}`}>
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  {incompatibleMetric || !series.isAvailable ? (
                    <Text
                      style={{ fontSize: 13, color: colors.textSecondary }}
                      testID={`rolling-${cur.currency}-unavailable`}
                      accessibilityLabel="Histórico insuficiente para esta janela."
                    >
                      Histórico insuficiente para esta janela.
                    </Text>
                  ) : (
                    <MobileRollingRiskChart
                      series={series}
                      metric={metric}
                      currency={cur.currency}
                    />
                  )}
                </View>
              );
            })}
            <TouchableOpacity accessibilityLabel={viewModel.accessibilitySummary}>
              <Text style={{ fontSize: 1, color: colors.surface }}>
                {viewModel.accessibilitySummary}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    </View>
  );
}
