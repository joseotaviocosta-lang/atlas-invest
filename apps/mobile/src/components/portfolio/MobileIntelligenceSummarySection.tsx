import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioIntelligenceViewModel, RawIntelligenceSummary } from '@atlas/ui';

export type MobileIntelligenceSummaryQueryData = { data: RawIntelligenceSummary } | undefined;

/**
 * Portfolio Intelligence Summary subsection (3P, ADR-166–ADR-172).
 * Renders server-computed consolidated read models and deterministic factual
 * highlights only — zero math. Historical/hypothetical facts, never predictions.
 */
export function MobileIntelligenceSummarySection({
  data,
  isLoading,
  isError,
  onRetry,
  selectedBenchmark,
}: {
  data: MobileIntelligenceSummaryQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedBenchmark?: string;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioIntelligenceViewModel(data.data, selectedBenchmark) : null),
    [data, selectedBenchmark],
  );

  return (
    <View testID="intelligence-summary-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Resumo da carteira</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Consolidação determinística. Fatos históricos, não previsões.
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando resumo da carteira" />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar o resumo da carteira." onRetry={onRetry} />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Resumo indisponível para esta carteira."
            description="Sem dados suficientes para consolidar o resumo."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text style={{ fontSize: 12, color: '#9A3412' }} accessibilityLabel="Resumo parcial">
                Resumo parcial: alguns blocos não puderam ser calculados.
              </Text>
            )}
            {viewModel.currencies.map((cur) => (
              <View key={cur.currency} style={{ gap: 6 }} testID={`intelligence-${cur.currency}`}>
                <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                <View testID={`intelligence-overview-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Visão geral
                  </Text>
                  <Text style={{ fontSize: 13 }}>
                    Valor de mercado: {cur.overview.currentMarketValueFormatted}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {cur.overview.valuedPositionCount} de {cur.overview.positionCount} posições
                  </Text>
                </View>
                <View testID={`intelligence-performance-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Performance
                  </Text>
                  <Text style={{ fontSize: 13 }}>TWR: {cur.performance.twrFormatted}</Text>
                  <Text style={{ fontSize: 13 }}>XIRR: {cur.performance.xirrFormatted}</Text>
                </View>
                <View testID={`intelligence-benchmarks-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Benchmarks
                  </Text>
                  {cur.benchmarks.length === 0 ? (
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>—</Text>
                  ) : (
                    cur.benchmarks.map((b) => (
                      <Text key={b.id} style={{ fontSize: 13 }}>
                        {b.label}:{' '}
                        {b.isAvailable
                          ? `${b.returnFormatted} (${b.differenceFormatted} p.p.)`
                          : '—'}
                      </Text>
                    ))
                  )}
                </View>
                <View testID={`intelligence-risk-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Risco
                  </Text>
                  <Text style={{ fontSize: 13 }}>Volatilidade: {cur.risk.volatilityFormatted}</Text>
                  <Text style={{ fontSize: 13 }}>
                    Drawdown máximo: {cur.risk.maximumDrawdownFormatted}
                  </Text>
                </View>
                <View testID={`intelligence-tail-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Risco de cauda (histórico, 95%)
                  </Text>
                  <Text style={{ fontSize: 13 }}>VaR 95%: {cur.tailRisk.var95Formatted}</Text>
                  <Text style={{ fontSize: 13 }}>CVaR 95%: {cur.tailRisk.cvar95Formatted}</Text>
                </View>
                <View testID={`intelligence-scenario-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Cenário
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {cur.scenario.label}
                  </Text>
                  <Text style={{ fontSize: 13 }}>
                    Impacto estimado: {cur.scenario.absoluteImpactFormatted} (
                    {cur.scenario.percentageImpactFormatted})
                  </Text>
                </View>
                <View testID={`intelligence-dataquality-${cur.currency}`}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Qualidade dos dados
                  </Text>
                  {cur.dataQuality.map((q) => (
                    <Text key={q.key} style={{ fontSize: 12, color: colors.textSecondary }}>
                      {q.key}: {q.status}
                      {q.reasonMessage ? ` — ${q.reasonMessage}` : ''}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
            <View testID="intelligence-observations" style={{ gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700' }}>Destaques objetivos</Text>
              {viewModel.observations.map((o) => (
                <Text
                  key={`${o.code}-${o.scope}`}
                  style={{ fontSize: 12 }}
                  testID={`intelligence-observation-${o.code}-${o.scope}`}
                >
                  • {o.text}
                </Text>
              ))}
            </View>
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
