import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioTailRiskViewModel,
  RawTailRiskData,
  TAIL_CONFIDENCE_OPTIONS,
  TAIL_RISK_TOOLTIPS,
} from '@atlas/ui';

export type MobileTailRiskQueryData = { data: RawTailRiskData } | undefined;

/**
 * Downside & tail risk subsection (3N, ADR-153).
 * Renders server-computed downside deviation, semideviation and historical
 * VaR/CVaR loss magnitudes only — zero math. Losses are non-negative.
 */
export function MobileTailRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
  confidenceLevel,
  onConfidenceChange,
}: {
  data: MobileTailRiskQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  confidenceLevel: string;
  onConfidenceChange: (level: string) => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioTailRiskViewModel(data.data) : null),
    [data],
  );

  return (
    <View testID="tail-risk-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Risco de cauda</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Perdas históricas observadas a partir da distribuição de retornos. Valores históricos, não
          previsões.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TAIL_CONFIDENCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onConfidenceChange(opt.value)}
              accessibilityLabel={`Selecionar confiança ${opt.label}`}
              accessibilityRole="button"
              testID={`tail-confidence-${opt.value}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: confidenceLevel === opt.value ? colors.accent : colors.border,
                backgroundColor:
                  confidenceLevel === opt.value ? colors.accentSubtle : colors.surface,
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
                  color: confidenceLevel === opt.value ? colors.accent : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Carregando risco de cauda" />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar o risco de cauda." onRetry={onRetry} />
        ) : !viewModel || viewModel.isUnavailable ? (
          <EmptyState
            title="Histórico insuficiente para calcular esta métrica."
            description="Sem retornos econômicos suficientes neste período."
          />
        ) : (
          <View style={{ gap: 16 }}>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                accessibilityLabel="Dados parciais para métricas de risco de cauda."
              >
                Dados parciais para métricas de risco de cauda.
              </Text>
            )}
            {viewModel.currencies.map((cur) => (
              <View key={cur.currency} style={{ gap: 8 }} testID={`tail-risk-${cur.currency}`}>
                <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                {cur.isUnavailable ? (
                  <EmptyState
                    title="Histórico insuficiente para calcular esta métrica."
                    description={`Sem métricas disponíveis para ${cur.currency}.`}
                  />
                ) : (
                  <>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>
                        Downside deviation anualizada
                      </Text>
                      <Text
                        style={{ fontSize: 20, fontWeight: '700' }}
                        testID={`tail-downside-${cur.currency}`}
                      >
                        {cur.hasDownside ? cur.downsideAnnualizedFormatted : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {TAIL_RISK_TOOLTIPS.DOWNSIDE}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>Semidesvio anualizado</Text>
                      <Text
                        style={{ fontSize: 20, fontWeight: '700' }}
                        testID={`tail-semideviation-${cur.currency}`}
                      >
                        {cur.hasSemideviation ? cur.semideviationAnnualizedFormatted : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {TAIL_RISK_TOOLTIPS.SEMIDEVIATION}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>{cur.varLabel}</Text>
                      <Text
                        style={{ fontSize: 20, fontWeight: '700' }}
                        testID={`tail-var-${cur.currency}`}
                      >
                        {cur.hasVar ? cur.varLossFormatted : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {TAIL_RISK_TOOLTIPS.VAR}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>{cur.cvarLabel}</Text>
                      <Text
                        style={{ fontSize: 20, fontWeight: '700' }}
                        testID={`tail-cvar-${cur.currency}`}
                      >
                        {cur.hasCvar ? cur.cvarLossFormatted : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {TAIL_RISK_TOOLTIPS.CVAR}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            ))}
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
