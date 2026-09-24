import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioRiskViewModel, RawRiskData } from '@atlas/ui';

export type MobileRiskQueryData = { data: RawRiskData } | undefined;

/**
 * Historical risk metrics section (3I, ADR-127).
 * Renders server-computed strings only — zero risk math on the client.
 */
export function MobileRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: MobileRiskQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioRiskViewModel(data.data) : null),
    [data],
  );

  return (
    <View testID="risk-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Risco histórico</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Métricas históricas da trajetória de performance. Valores históricos, não previsões.
        </Text>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando métricas de risco" />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as métricas de risco." onRetry={onRetry} />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para calcular métricas de risco."
            description="Sem observações diárias suficientes neste período."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para métricas de risco."
              >
                Dados parciais para métricas de risco.
              </Text>
            )}
            {viewModel.currencies.map((cur) =>
              cur.isUnavailable ? (
                <EmptyState
                  key={cur.currency}
                  title="Histórico insuficiente para calcular métricas de risco."
                  description={`Sem métricas disponíveis para ${cur.currency}.`}
                />
              ) : (
                <View
                  key={cur.currency}
                  style={{ gap: 8 }}
                  testID={`risk-${cur.currency}`}
                  accessibilityLabel={`Métricas históricas de risco em ${cur.currency}: volatilidade anualizada ${cur.volatility.annualizedFormatted}, máxima queda ${cur.drawdown.maximumFormatted}, queda atual ${cur.drawdown.currentFormatted}`}
                >
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {cur.volatility.observationCount} observações diárias
                  </Text>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Volatilidade anualizada</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`risk-volatility-${cur.currency}`}
                    >
                      {cur.volatility.annualizedFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      Volatilidade mede quanto os retornos históricos oscilaram no período. O valor
                      anualizado usa observações diárias e fator de 252 dias úteis.
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Máxima queda</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`risk-max-drawdown-${cur.currency}`}
                    >
                      {cur.drawdown.maximumFormatted}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      Máxima queda mostra a maior perda percentual entre um pico e o ponto mais
                      baixo seguinte da trajetória de performance.
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>Queda atual</Text>
                    <Text
                      style={{ fontSize: 20, fontWeight: '700' }}
                      testID={`risk-current-drawdown-${cur.currency}`}
                    >
                      {cur.drawdown.currentFormatted}
                    </Text>
                  </View>
                  <View style={{ gap: 2 }}>
                    {cur.drawdown.peakDisplay && (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        Pico: {cur.drawdown.peakDisplay}
                      </Text>
                    )}
                    {cur.drawdown.troughDisplay && (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        Fundo: {cur.drawdown.troughDisplay}
                      </Text>
                    )}
                    {cur.drawdown.isRecovered && cur.drawdown.recoveryDisplay ? (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        Recuperação: {cur.drawdown.recoveryDisplay}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        Não recuperado no período
                      </Text>
                    )}
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
