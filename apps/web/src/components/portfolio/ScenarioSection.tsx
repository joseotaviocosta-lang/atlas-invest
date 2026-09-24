'use client';

import React, { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Card, Badge, EmptyState, Button } from '@/components/ui';
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
 * returned impact. Zero math: no shock, Beta, duration, stressed price or
 * total is computed here. Results are hypothetical simulations, never
 * forecasts.
 */
export function ScenarioSection({
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

  const mutation = useMutation<{ data: RawScenarioData }, ApiError, ScenarioInput>({
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

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.textPrimary,
    fontSize: 13,
    width: 140,
    minHeight: 32,
  };

  return (
    <Card style={{ padding: 16 }} data-testid="scenario-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Simulação de cenários</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Aplique um choque hipotético explícito ao valor de mercado atual. Hipótese determinística,
          não é previsão.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {SCENARIO_PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => !preset.disabled && setSelectedPreset(preset.id)}
            disabled={preset.disabled}
            aria-label={`Selecionar cenário ${preset.label}`}
            aria-pressed={selectedPreset === preset.id}
            data-testid={`scenario-preset-${preset.id}`}
            title={preset.disabled ? preset.disabledReason : undefined}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${selectedPreset === preset.id ? colors.accent : colors.border}`,
              background: selectedPreset === preset.id ? colors.accentSubtle : colors.surface,
              color: preset.disabled
                ? colors.textMuted
                : selectedPreset === preset.id
                  ? colors.accent
                  : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: preset.disabled ? 'not-allowed' : 'pointer',
              minHeight: 32,
              opacity: preset.disabled ? 0.6 : 1,
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {selectedPreset === 'CUSTOM' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: colors.textSecondary }}>
            <div>Choque em ações (%)</div>
            <input
              style={inputStyle}
              value={equityShock}
              onChange={(e) => setEquityShock(e.target.value)}
              placeholder="-10"
              data-testid="scenario-input-equity"
            />
          </label>
          <label style={{ fontSize: 12, color: colors.textSecondary }}>
            <div>Choque do Ibovespa (%)</div>
            <input
              style={inputStyle}
              value={benchmarkShock}
              onChange={(e) => setBenchmarkShock(e.target.value)}
              placeholder="-10"
              data-testid="scenario-input-benchmark"
            />
          </label>
          <label style={{ fontSize: 12, color: colors.textSecondary }}>
            <div>Juros (bps)</div>
            <input
              style={inputStyle}
              value={rateBps}
              onChange={(e) => setRateBps(e.target.value)}
              placeholder="100"
              data-testid="scenario-input-rate"
            />
          </label>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <Button
          variant="primary"
          size="sm"
          onClick={handleRun}
          disabled={!portfolioId || mutation.isPending}
          data-testid="scenario-run"
        >
          {mutation.isPending ? 'Simulando…' : 'Simular cenário'}
        </Button>
      </div>

      {mutation.isError ? (
        <div style={{ fontSize: 13, color: colors.negative }} data-testid="scenario-error">
          Não foi possível simular o cenário. Verifique os valores informados.
        </div>
      ) : !viewModel ? (
        <EmptyState
          title="Escolha um cenário e simule"
          description="O resultado é uma hipótese determinística sobre o valor de mercado atual."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {viewModel.scenarioLabel} • {viewModel.asOfDisplay}
          </div>

          {viewModel.isPartial && (
            <div
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
              data-testid="scenario-partial"
            >
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Algumas posições não puderam ser avaliadas neste cenário.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) => (
            <div key={cur.currency} data-testid={`scenario-result-${cur.currency}`}>
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
                  {cur.valuedPositionCount} de {cur.positionCount} posições avaliadas
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Valor base</div>
                  <div
                    data-testid={`scenario-base-${cur.currency}`}
                    style={{ fontSize: '1.25rem', fontWeight: 700 }}
                  >
                    {cur.baseValueFormatted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Valor sob cenário</div>
                  <div
                    data-testid={`scenario-stressed-${cur.currency}`}
                    style={{ fontSize: '1.25rem', fontWeight: 700 }}
                  >
                    {cur.isUnavailable ? '—' : cur.stressedValueFormatted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    Impacto estimado no cenário
                  </div>
                  <div
                    data-testid={`scenario-impact-${cur.currency}`}
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: cur.absoluteImpactFormatted.startsWith('-')
                        ? colors.negative
                        : cur.absoluteImpactFormatted === '—'
                          ? colors.textMuted
                          : colors.positive,
                    }}
                  >
                    {cur.isUnavailable ? '—' : cur.absoluteImpactFormatted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Impacto %</div>
                  <div
                    data-testid={`scenario-impact-pct-${cur.currency}`}
                    style={{ fontSize: '1.25rem', fontWeight: 700 }}
                  >
                    {cur.isUnavailable ? '—' : cur.percentageImpactFormatted}
                  </div>
                </div>
              </div>

              {cur.usesBeta && (
                <div
                  style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}
                  data-testid="scenario-beta-note"
                >
                  Estimativa baseada no beta histórico da carteira em relação ao Ibovespa.
                </div>
              )}
              {cur.rateUnsupported && (
                <div
                  style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}
                  data-testid="scenario-rate-unsupported"
                >
                  Este cenário exige dados de sensibilidade de juros que não estão disponíveis para
                  esta posição.
                </div>
              )}
            </div>
          ))}

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
