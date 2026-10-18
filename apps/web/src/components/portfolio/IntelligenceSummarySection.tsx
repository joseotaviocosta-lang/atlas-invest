'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioIntelligenceViewModel, RawIntelligenceSummary } from '@atlas/ui';

export type IntelligenceSummaryQueryData = { data: RawIntelligenceSummary } | undefined;

/**
 * Portfolio Intelligence Summary subsection (3P, ADR-166–ADR-172).
 * Renders server-computed consolidated read models and deterministic factual
 * highlights only. Zero math: no metric is computed, compared, scored, ranked
 * or recommended here. Historical/hypothetical facts, never predictions.
 */
export function IntelligenceSummarySection({
  data,
  isLoading,
  isError,
  onRetry,
  selectedBenchmark,
}: {
  data: IntelligenceSummaryQueryData;
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
    <Card style={{ padding: 16 }} data-testid="intelligence-summary-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Resumo da carteira</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Consolidação determinística de performance, benchmarks, risco, risco de cauda, cenário e
          qualidade dos dados. Fatos históricos, não previsões.
        </div>
      </div>

      {isLoading ? (
        <div aria-label="Carregando resumo da carteira">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="160px" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar o resumo da carteira." onRetry={onRetry} />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Resumo indisponível para esta carteira."
          description="Não há dados suficientes para consolidar o resumo. O restante da página continua válido."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Resumo parcial</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Resumo parcial: alguns blocos não puderam ser calculados.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) => (
            <div key={cur.currency} data-testid={`intelligence-${cur.currency}`}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{cur.currency}</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div data-testid={`intelligence-overview-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Visão geral
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Custo/valor de mercado: {cur.overview.currentMarketValueFormatted}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {cur.overview.valuedPositionCount} de {cur.overview.positionCount} posições
                    avaliadas
                  </div>
                </div>

                <div data-testid={`intelligence-performance-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Performance
                  </div>
                  <div style={{ fontSize: 13 }}>TWR: {cur.performance.twrFormatted}</div>
                  <div style={{ fontSize: 13 }}>XIRR: {cur.performance.xirrFormatted}</div>
                </div>

                <div data-testid={`intelligence-benchmarks-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Benchmarks
                  </div>
                  {cur.benchmarks.length === 0 ? (
                    <div style={{ fontSize: 13, color: colors.textSecondary }}>—</div>
                  ) : (
                    cur.benchmarks.map((b) => (
                      <div key={b.id} style={{ fontSize: 13 }}>
                        {b.label}:{' '}
                        {b.isAvailable
                          ? `${b.returnFormatted} (${b.differenceFormatted} p.p.)`
                          : '—'}
                      </div>
                    ))
                  )}
                </div>

                <div data-testid={`intelligence-risk-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Risco
                  </div>
                  <div style={{ fontSize: 13 }}>Volatilidade: {cur.risk.volatilityFormatted}</div>
                  <div style={{ fontSize: 13 }}>
                    Drawdown máximo: {cur.risk.maximumDrawdownFormatted}
                  </div>
                </div>

                <div data-testid={`intelligence-tail-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Risco de cauda (histórico, 95%)
                  </div>
                  <div style={{ fontSize: 13 }}>VaR 95%: {cur.tailRisk.var95Formatted}</div>
                  <div style={{ fontSize: 13 }}>CVaR 95%: {cur.tailRisk.cvar95Formatted}</div>
                </div>

                <div data-testid={`intelligence-scenario-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Cenário
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {cur.scenario.label}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Impacto estimado: {cur.scenario.absoluteImpactFormatted} (
                    {cur.scenario.percentageImpactFormatted})
                  </div>
                </div>

                <div data-testid={`intelligence-dataquality-${cur.currency}`}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                    Qualidade dos dados
                  </div>
                  {cur.dataQuality.map((q) => (
                    <div key={q.key} style={{ fontSize: 12, color: colors.textSecondary }}>
                      {q.key}: {q.status}
                      {q.reasonMessage ? ` — ${q.reasonMessage}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div data-testid="intelligence-observations">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Destaques objetivos
            </div>
            {viewModel.observations.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Nenhum destaque objetivo no período.
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {viewModel.observations.map((o) => (
                  <li
                    key={`${o.code}-${o.scope}`}
                    data-testid={`intelligence-observation-${o.code}-${o.scope}`}
                    style={{ fontSize: 13, marginBottom: 4 }}
                  >
                    {o.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

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
