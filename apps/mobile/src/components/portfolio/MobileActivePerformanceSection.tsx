import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioActivePerformanceViewModel, RawActivePerformanceData } from '@atlas/ui';

export type MobileActivePerformanceQueryData = { data: RawActivePerformanceData } | undefined;

const ALPHA_TOOLTIP =
  'O alpha compara o retorno histórico da carteira ao retorno esperado dado seu beta, o Ibovespa e a referência CDI no mesmo período.';
const IR_TOOLTIP =
  'O Information Ratio relaciona o retorno ativo histórico da carteira ao seu tracking error frente ao Ibovespa.';
const TREYNOR_TOOLTIP =
  'O índice de Treynor relaciona o retorno histórico excedente ao CDI à sensibilidade histórica da carteira ao Ibovespa.';

/**
 * Active performance subsection (3L, ADR-143).
 * Renders server-computed Alpha (percentage), Information Ratio (unitless
 * ratio) and Treynor (percentage-per-beta) per currency only — zero math.
 */
export function MobileActivePerformanceSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: MobileActivePerformanceQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioActivePerformanceViewModel(data.data) : null),
    [data],
  );

  return (
    <View testID="active-performance-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Desempenho ativo</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Retorno histórico da carteira frente ao Ibovespa, usando o CDI como referência. Valores
          históricos, não previsões.
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando desempenho ativo" />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar o desempenho ativo." onRetry={onRetry} />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para calcular métricas de desempenho ativo."
            description="Sem observações econômicas alinhadas suficientes neste período."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para métricas de desempenho ativo."
              >
                Dados parciais para métricas de desempenho ativo.
              </Text>
            )}
            {viewModel.currencies.map((cur) =>
              cur.isIncompatibleCurrency ? (
                <Text
                  key={cur.currency}
                  style={{ fontSize: 13, color: colors.textSecondary }}
                  testID={`active-performance-${cur.currency}`}
                  accessibilityLabel={`${cur.currency}: Indisponível sem referências compatíveis.`}
                >
                  {cur.currency}: Indisponível sem referências compatíveis.
                </Text>
              ) : cur.isUnavailable ? (
                <EmptyState
                  key={cur.currency}
                  title="Histórico insuficiente para calcular métricas de desempenho ativo."
                  description={`Sem métricas disponíveis para ${cur.currency}.`}
                />
              ) : (
                <View
                  key={cur.currency}
                  style={{ gap: 8 }}
                  testID={`active-performance-${cur.currency}`}
                  accessibilityLabel={`Alpha ${cur.alpha?.periodFormatted ?? '—'}, Information Ratio ${cur.informationRatio?.annualizedFormatted ?? '—'}, Treynor ${cur.treynor?.periodFormatted ?? '—'} em ${cur.currency}`}
                >
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {viewModel.marketBenchmarkLabel} • {viewModel.riskFreeLabel}
                  </Text>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Alpha</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`active-performance-alpha-${cur.currency}`}
                    >
                      {cur.alpha ? cur.alpha.periodFormatted : '—'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {ALPHA_TOOLTIP}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Information Ratio</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`active-performance-ir-${cur.currency}`}
                    >
                      {cur.informationRatio ? cur.informationRatio.annualizedFormatted : '—'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{IR_TOOLTIP}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Treynor</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`active-performance-treynor-${cur.currency}`}
                    >
                      {cur.treynor ? cur.treynor.periodFormatted : '—'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {TREYNOR_TOOLTIP}
                    </Text>
                  </View>
                </View>
              ),
            )}
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
