import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Card, EmptyState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioScenarioViewModel,
  RawScenarioData,
  SCENARIO_PRESET_OPTIONS,
} from '@atlas/ui';

type ScenarioInput = Record<string, string>;

/**
 * Scenario analysis subsection (3O, ADR-159–ADR-165).
 * Sends an explicit deterministic scenario to the server and renders the
 * returned impact. Zero math. Results are hypothetical simulations, never
 * forecasts.
 */
export function MobileScenarioSection({
  portfolioId,
  asOf,
}: {
  portfolioId: string | null;
  asOf?: string;
}) {
  const [selectedPreset, setSelectedPreset] = useState<string>('MARKET_DOWN_10');
  const [equityShock, setEquityShock] = useState('');
  const [benchmarkShock, setBenchmarkShock] = useState('');
  const [rateBps, setRateBps] = useState('');

  const mutation = useMutation<{ data: RawScenarioData }, Error, ScenarioInput>({
    mutationFn: (scenario) =>
      apiClient.post<{ data: RawScenarioData }>(
        `/api/v1/portfolios/${portfolioId}/performance/scenarios/run`,
        asOf ? { asOf, scenario } : { scenario },
      ),
  });

  const viewModel = useMemo(
    () => (mutation.data?.data ? mapToPortfolioScenarioViewModel(mutation.data.data) : null),
    [mutation.data],
  );

  const buildCustomScenario = (): ScenarioInput => {
    const hasEquity = equityShock.trim() !== '';
    const hasBenchmark = benchmarkShock.trim() !== '';
    const hasRate = rateBps.trim() !== '';
    if (hasEquity && hasBenchmark) {
      return {
        type: 'COMBINED',
        equityShockPercentage: equityShock.trim(),
        benchmarkShockPercentage: benchmarkShock.trim(),
        benchmarkId: 'IBOV',
      };
    }
    if (hasEquity && hasRate) {
      return {
        type: 'COMBINED',
        equityShockPercentage: equityShock.trim(),
        rateShockBps: rateBps.trim(),
      };
    }
    if (hasBenchmark && hasRate) {
      return {
        type: 'COMBINED',
        benchmarkShockPercentage: benchmarkShock.trim(),
        benchmarkId: 'IBOV',
        rateShockBps: rateBps.trim(),
      };
    }
    if (hasEquity) return { type: 'EQUITY_PRICE_SHOCK', shockPercentage: equityShock.trim() };
    if (hasBenchmark)
      return {
        type: 'BENCHMARK_SHOCK',
        benchmarkId: 'IBOV',
        shockPercentage: benchmarkShock.trim(),
      };
    if (hasRate) return { type: 'RATE_SHOCK', rateShockBps: rateBps.trim() };
    return { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '0' };
  };

  const handleRun = () => {
    const preset = SCENARIO_PRESET_OPTIONS.find((p) => p.id === selectedPreset);
    const scenario =
      selectedPreset === 'CUSTOM' ? buildCustomScenario() : (preset!.definition as ScenarioInput);
    mutation.mutate(scenario);
  };

  return (
    <View testID="scenario-section">
      <Card style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Simulação de cenários</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Aplique um choque hipotético explícito ao valor de mercado atual. Hipótese determinística,
          não é previsão.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SCENARIO_PRESET_OPTIONS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              onPress={() => !preset.disabled && setSelectedPreset(preset.id)}
              disabled={preset.disabled}
              accessibilityLabel={`Selecionar cenário ${preset.label}`}
              accessibilityRole="button"
              testID={`scenario-preset-${preset.id}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: selectedPreset === preset.id ? colors.accent : colors.border,
                backgroundColor:
                  selectedPreset === preset.id ? colors.accentSubtle : colors.surface,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: preset.disabled ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: preset.disabled
                    ? colors.textMuted
                    : selectedPreset === preset.id
                      ? colors.accent
                      : colors.textSecondary,
                }}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedPreset === 'CUSTOM' && (
          <View style={{ gap: 8 }}>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }}
              value={equityShock}
              onChangeText={setEquityShock}
              placeholder="Choque em ações (%)"
              testID="scenario-input-equity"
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }}
              value={benchmarkShock}
              onChangeText={setBenchmarkShock}
              placeholder="Choque do Ibovespa (%)"
              testID="scenario-input-benchmark"
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }}
              value={rateBps}
              onChangeText={setRateBps}
              placeholder="Juros (bps)"
              testID="scenario-input-rate"
            />
          </View>
        )}

        <TouchableOpacity
          onPress={handleRun}
          disabled={!portfolioId || mutation.isPending}
          accessibilityLabel="Simular cenário"
          accessibilityRole="button"
          testID="scenario-run"
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.accent,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !portfolioId || mutation.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.surface, fontWeight: '700' }}>
            {mutation.isPending ? 'Simulando…' : 'Simular cenário'}
          </Text>
        </TouchableOpacity>

        {mutation.isError ? (
          <Text style={{ fontSize: 13, color: colors.negative }} testID="scenario-error">
            Não foi possível simular o cenário. Verifique os valores informados.
          </Text>
        ) : !viewModel ? (
          <EmptyState
            title="Escolha um cenário e simule"
            description="O resultado é uma hipótese determinística sobre o valor de mercado atual."
          />
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              {viewModel.scenarioLabel} • {viewModel.asOfDisplay}
            </Text>
            {viewModel.isPartial && (
              <Text
                style={{ fontSize: 12, color: '#9A3412' }}
                testID="scenario-partial"
                accessibilityLabel="Algumas posições não puderam ser avaliadas neste cenário."
              >
                Algumas posições não puderam ser avaliadas neste cenário.
              </Text>
            )}
            {viewModel.currencies.map((cur) => (
              <View
                key={cur.currency}
                style={{ gap: 6 }}
                testID={`scenario-result-${cur.currency}`}
              >
                <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  {cur.valuedPositionCount} de {cur.positionCount} posições avaliadas
                </Text>
                <Text testID={`scenario-base-${cur.currency}`}>
                  Valor base: {cur.baseValueFormatted}
                </Text>
                <Text testID={`scenario-stressed-${cur.currency}`}>
                  Valor sob cenário: {cur.isUnavailable ? '—' : cur.stressedValueFormatted}
                </Text>
                <Text testID={`scenario-impact-${cur.currency}`}>
                  Impacto estimado: {cur.isUnavailable ? '—' : cur.absoluteImpactFormatted}
                </Text>
                <Text testID={`scenario-impact-pct-${cur.currency}`}>
                  Impacto %: {cur.isUnavailable ? '—' : cur.percentageImpactFormatted}
                </Text>
                {cur.usesBeta && (
                  <Text
                    style={{ fontSize: 11, color: colors.textSecondary }}
                    testID="scenario-beta-note"
                  >
                    Estimativa baseada no beta histórico da carteira em relação ao Ibovespa.
                  </Text>
                )}
                {cur.rateUnsupported && (
                  <Text
                    style={{ fontSize: 11, color: colors.textSecondary }}
                    testID="scenario-rate-unsupported"
                  >
                    Este cenário exige dados de sensibilidade de juros que não estão disponíveis
                    para esta posição.
                  </Text>
                )}
              </View>
            ))}
            <Text style={{ fontSize: 1, color: colors.surface }}>
              {viewModel.accessibilitySummary}
            </Text>
          </View>
        )}
      </Card>
    </View>
  );
}
