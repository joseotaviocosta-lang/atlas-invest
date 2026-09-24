import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioBenchmarkRelativeRiskViewModel, RawRelativeRiskData } from '@atlas/ui';

export type MobileRelativeRiskQueryData = { data: RawRelativeRiskData } | undefined;

const BETA_TOOLTIP =
  'O beta mede a sensibilidade histórica dos retornos da carteira às variações do Ibovespa no mesmo período.';
const CORRELATION_TOOLTIP =
  'A correlação mostra o grau de associação histórica entre os retornos da carteira e do Ibovespa, variando de -1 a 1.';
const TRACKING_ERROR_TOOLTIP =
  'O tracking error mede quanto os retornos históricos da carteira se desviaram dos retornos do Ibovespa.';

/**
 * Benchmark-relative risk subsection (3K, ADR-138).
 * Renders server-computed Beta/Correlation ratios and the annualized tracking
 * error only — zero math. Ratios render WITHOUT a percent sign; tracking error
 * renders WITH a percent sign.
 */
export function MobileRelativeRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: MobileRelativeRiskQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioBenchmarkRelativeRiskViewModel(data.data) : null),
    [data],
  );

  return (
    <View testID="relative-risk-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Relação com o mercado</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Como os retornos históricos da carteira se relacionaram com o Ibovespa. Valores
          históricos, não previsões.
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando relação com o mercado" />
        ) : isError ? (
          <ErrorState
            message="Não foi possível carregar a relação com o mercado."
            onRetry={onRetry}
          />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para calcular métricas relativas ao Ibovespa."
            description="Sem intervalos econômicos alinhados suficientes neste período."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para comparação com o Ibovespa."
              >
                Dados parciais para comparação com o Ibovespa.
              </Text>
            )}
            {viewModel.currencies.map((cur) =>
              cur.isIncompatibleCurrency ? (
                <Text
                  key={cur.currency}
                  style={{ fontSize: 13, color: colors.textSecondary }}
                  testID={`relative-risk-${cur.currency}`}
                  accessibilityLabel={`${cur.currency}: Indisponível sem benchmark compatível.`}
                >
                  {cur.currency}: Indisponível sem benchmark compatível.
                </Text>
              ) : cur.isUnavailable ? (
                <EmptyState
                  key={cur.currency}
                  title="Histórico insuficiente para calcular métricas relativas ao Ibovespa."
                  description={`Sem métricas disponíveis para ${cur.currency}.`}
                />
              ) : (
                <View
                  key={cur.currency}
                  style={{ gap: 8 }}
                  testID={`relative-risk-${cur.currency}`}
                  accessibilityLabel={`Beta ${cur.betaFormatted}, Correlação ${cur.correlationFormatted}, Tracking error ${cur.trackingErrorFormatted} em ${cur.currency}`}
                >
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {cur.benchmarkLabel} • {cur.observationCount} observações
                  </Text>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Beta</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`relative-risk-beta-${cur.currency}`}
                    >
                      {cur.betaFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {BETA_TOOLTIP}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Correlação</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`relative-risk-correlation-${cur.currency}`}
                    >
                      {cur.correlationFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {CORRELATION_TOOLTIP}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>
                      Tracking error anualizado
                    </Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`relative-risk-tracking-error-${cur.currency}`}
                    >
                      {cur.trackingErrorFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {TRACKING_ERROR_TOOLTIP}
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
