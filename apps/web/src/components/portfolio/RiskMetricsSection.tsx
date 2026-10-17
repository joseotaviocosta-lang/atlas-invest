'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioRiskViewModel, RawRiskData } from '@atlas/ui';

export type RiskQueryData = { data: RawRiskData } | undefined;

/**
 * Historical risk metrics section (3I, ADR-127).
 * Renders server-computed volatility/drawdown strings only. Zero risk math:
 * no std deviation, mean, variance, sqrt, annualization, peak/trough
 * detection or recovery computation happens here.
 */
export function PortfolioRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: RiskQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioRiskViewModel(data.data) : null),
    [data],
  );

  return (
    <Card style={{ padding: 16 }} data-testid="risk-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Risco histórico</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Métricas históricas da trajetória de performance. Valores históricos, não previsões.
        </div>
      </div>

      {isLoading ? (
        <div aria-label="Carregando métricas de risco">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as métricas de risco." onRetry={onRetry} />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para calcular métricas de risco."
          description="Não há observações diárias suficientes neste período. O resumo e o gráfico acima continuam válidos."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para métricas de risco.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) =>
            cur.isUnavailable ? (
              <EmptyState
                key={cur.currency}
                title="Histórico insuficiente para calcular métricas de risco."
                description={`Sem métricas disponíveis para ${cur.currency} neste período.`}
              />
            ) : (
              <div
                key={cur.currency}
                data-testid={`risk-${cur.currency}`}
                aria-label={`Métricas históricas de risco em ${cur.currency}`}
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
                    {cur.volatility.observationCount} observações diárias
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Volatilidade anualizada</span>
                      <span
                        role="img"
                        aria-label="Volatilidade mede quanto os retornos históricos oscilaram no período. O valor anualizado usa observações diárias e fator de 252 dias úteis."
                        title="Volatilidade mede quanto os retornos históricos oscilaram no período. O valor anualizado usa observações diárias e fator de 252 dias úteis."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`risk-volatility-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.volatility.annualizedFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Máxima queda</span>
                      <span
                        role="img"
                        aria-label="Máxima queda mostra a maior perda percentual entre um pico e o ponto mais baixo seguinte da trajetória de performance."
                        title="Máxima queda mostra a maior perda percentual entre um pico e o ponto mais baixo seguinte da trajetória de performance."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`risk-max-drawdown-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.drawdown.maximumFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      Queda atual
                    </div>
                    <div
                      data-testid={`risk-current-drawdown-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.drawdown.currentFormatted}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: colors.textSecondary, display: 'grid', gap: 2 }}>
                  {cur.drawdown.peakDisplay && <span>Pico: {cur.drawdown.peakDisplay}</span>}
                  {cur.drawdown.troughDisplay && <span>Fundo: {cur.drawdown.troughDisplay}</span>}
                  {cur.drawdown.maximumFormatted !== '—' &&
                    (cur.drawdown.isRecovered && cur.drawdown.recoveryDisplay ? (
                      <span>Recuperação: {cur.drawdown.recoveryDisplay}</span>
                    ) : (
                      <span>Não recuperado no período</span>
                    ))}
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
