'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioActivePerformanceViewModel, RawActivePerformanceData } from '@atlas/ui';

export type ActivePerformanceQueryData = { data: RawActivePerformanceData } | undefined;

const ALPHA_TOOLTIP =
  'O alpha compara o retorno histórico da carteira ao retorno esperado dado seu beta, o Ibovespa e a referência CDI no mesmo período.';
const IR_TOOLTIP =
  'O Information Ratio relaciona o retorno ativo histórico da carteira ao seu tracking error frente ao Ibovespa.';
const TREYNOR_TOOLTIP =
  'O índice de Treynor relaciona o retorno histórico excedente ao CDI à sensibilidade histórica da carteira ao Ibovespa.';

/**
 * Active performance subsection (3L, ADR-143).
 * Renders server-computed Alpha (percentage), Information Ratio (unitless
 * ratio) and Treynor (percentage-per-beta) per currency only. Zero math: no
 * expected CAPM return, alpha, active returns, information ratio, tracking
 * error or excess-per-beta is computed here.
 */
export function ActivePerformanceSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: ActivePerformanceQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioActivePerformanceViewModel(data.data) : null),
    [data],
  );

  return (
    <Card style={{ padding: 16 }} data-testid="active-performance-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Desempenho ativo</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Retorno histórico da carteira frente ao Ibovespa, usando o CDI como referência. Valores
          históricos, não previsões.
        </div>
      </div>

      {isLoading ? (
        <div aria-label="Carregando desempenho ativo">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar o desempenho ativo." onRetry={onRetry} />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para calcular métricas de desempenho ativo."
          description="Não há observações econômicas alinhadas suficientes neste período. O restante da página continua válido."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para métricas de desempenho ativo.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) =>
            cur.isIncompatibleCurrency ? (
              <div
                key={cur.currency}
                data-testid={`active-performance-${cur.currency}`}
                style={{ fontSize: 13, color: colors.textSecondary }}
              >
                <strong>{cur.currency}</strong>: Indisponível sem referências compatíveis.
              </div>
            ) : cur.isUnavailable ? (
              <EmptyState
                key={cur.currency}
                title="Histórico insuficiente para calcular métricas de desempenho ativo."
                description={`Sem métricas disponíveis para ${cur.currency} neste período.`}
              />
            ) : (
              <div
                key={cur.currency}
                data-testid={`active-performance-${cur.currency}`}
                aria-label={`Alpha, Information Ratio e Treynor em ${cur.currency}`}
              >
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
                    {viewModel.marketBenchmarkLabel} • {viewModel.riskFreeLabel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Alpha</span>
                      <span
                        role="img"
                        aria-label={ALPHA_TOOLTIP}
                        title={ALPHA_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`active-performance-alpha-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.alpha ? cur.alpha.periodFormatted : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Information Ratio</span>
                      <span
                        role="img"
                        aria-label={IR_TOOLTIP}
                        title={IR_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`active-performance-ir-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.informationRatio ? cur.informationRatio.annualizedFormatted : '—'}
                    </div>
                    {cur.informationRatio && (
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>
                        {cur.informationRatio.observationCount} observações
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Treynor</span>
                      <span
                        role="img"
                        aria-label={TREYNOR_TOOLTIP}
                        title={TREYNOR_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`active-performance-treynor-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.treynor ? cur.treynor.periodFormatted : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ),
          )}

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
