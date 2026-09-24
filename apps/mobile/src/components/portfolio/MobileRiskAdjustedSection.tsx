import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioRiskAdjustedViewModel, RawRiskAdjustedData } from '@atlas/ui';

export type MobileRiskAdjustedQueryData = { data: RawRiskAdjustedData } | undefined;

/**
 * Risk-adjusted performance subsection (3J, ADR-133).
 * Renders server-computed Sharpe/Sortino ratio strings only — zero math.
 * Ratios render WITHOUT a percent sign.
 */
export function MobileRiskAdjustedSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: MobileRiskAdjustedQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioRiskAdjustedViewModel(data.data) : null),
    [data],
  );

  return (
    <View testID="risk-adjusted-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Retorno ajustado ao risco</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Índices históricos de Sharpe e Sortino. Valores históricos, não previsões.
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando retorno ajustado ao risco" />
        ) : isError ? (
          <ErrorState
            message="Não foi possível carregar o retorno ajustado ao risco."
            onRetry={onRetry}
          />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para calcular Sharpe e Sortino."
            description="Sem observações alinhadas suficientes neste período."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para retorno ajustado ao risco."
              >
                Dados parciais para retorno ajustado ao risco.
              </Text>
            )}
            {viewModel.currencies.map((cur) =>
              cur.isIncompatibleCurrency ? (
                <Text
                  key={cur.currency}
                  style={{ fontSize: 13, color: colors.textSecondary }}
                  testID={`risk-adjusted-${cur.currency}`}
                  accessibilityLabel={`${cur.currency}: Indisponível sem referência compatível.`}
                >
                  {cur.currency}: Indisponível sem referência compatível.
                </Text>
              ) : cur.isUnavailable || !cur.sharpe || !cur.sortino ? (
                <EmptyState
                  key={cur.currency}
                  title="Histórico insuficiente para calcular Sharpe e Sortino."
                  description={`Sem métricas disponíveis para ${cur.currency}.`}
                />
              ) : (
                <View
                  key={cur.currency}
                  style={{ gap: 8 }}
                  testID={`risk-adjusted-${cur.currency}`}
                  accessibilityLabel={`Sharpe ${cur.sharpe.annualizedFormatted}, Sortino ${cur.sortino.annualizedFormatted} em ${cur.currency}`}
                >
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {cur.riskFreeLabel} • {cur.sharpe.observationCount} observações
                  </Text>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Índice de Sharpe</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`risk-adjusted-sharpe-${cur.currency}`}
                    >
                      {cur.sharpe.annualizedFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      O índice de Sharpe relaciona o retorno excedente histórico da carteira à
                      volatilidade desse retorno. Nesta análise, o CDI é usado como referência.
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Índice de Sortino</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`risk-adjusted-sortino-${cur.currency}`}
                    >
                      {cur.sortino.annualizedFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      O índice de Sortino relaciona o retorno excedente histórico às oscilações
                      negativas desse retorno. Nesta análise, o CDI é usado como referência.
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
