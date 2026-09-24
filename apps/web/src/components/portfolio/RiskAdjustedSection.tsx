'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioRiskAdjustedViewModel, RawRiskAdjustedData } from '@atlas/ui';

export type RiskAdjustedQueryData = { data: RawRiskAdjustedData } | undefined;

/**
 * Risk-adjusted performance subsection (3J, ADR-133).
 * Renders server-computed Sharpe/Sortino ratio strings only. Zero math:
 * no excess returns, means, variances, downside deviations, ratios or
 * annualizations are computed here. Ratios render WITHOUT a percent sign.
 */
export function RiskAdjustedSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: RiskAdjustedQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioRiskAdjustedViewModel(data.data) : null),
    [data],
  );

  return (
    <Card style={{ padding: 16 }} data-testid="risk-adjusted-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Retorno ajustado ao risco
        </h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Índices históricos de Sharpe e Sortino. Valores históricos, não previsões.
        </div>
      </div>

      {isLoading ? (
        <div aria-label="Carregando retorno ajustado ao risco">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar o retorno ajustado ao risco."
          onRetry={onRetry}
        />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para calcular Sharpe e Sortino."
          description="Não há observações alinhadas suficientes neste período. O resumo, o gráfico e as métricas de risco acima continuam válidos."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para retorno ajustado ao risco.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) =>
            cur.isIncompatibleCurrency ? (
              <div
                key={cur.currency}
                data-testid={`risk-adjusted-${cur.currency}`}
                style={{ fontSize: 13, color: colors.textSecondary }}
              >
                <strong>{cur.currency}</strong>: Indisponível sem referência compatível.
              </div>
            ) : cur.isUnavailable || !cur.sharpe || !cur.sortino ? (
              <EmptyState
                key={cur.currency}
                title="Histórico insuficiente para calcular Sharpe e Sortino."
                description={`Sem métricas disponíveis para ${cur.currency} neste período.`}
              />
            ) : (
              <div
                key={cur.currency}
                data-testid={`risk-adjusted-${cur.currency}`}
                aria-label={`Sharpe e Sortino em ${cur.currency}`}
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
                    {cur.riskFreeLabel} • {cur.sharpe.observationCount} observações
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
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Índice de Sharpe</span>
                      <span
                        role="img"
                        aria-label="O índice de Sharpe relaciona o retorno excedente histórico da carteira à volatilidade desse retorno. Nesta análise, o CDI é usado como referência."
                        title="O índice de Sharpe relaciona o retorno excedente histórico da carteira à volatilidade desse retorno. Nesta análise, o CDI é usado como referência."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`risk-adjusted-sharpe-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.sharpe.annualizedFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Índice de Sortino</span>
                      <span
                        role="img"
                        aria-label="O índice de Sortino relaciona o retorno excedente histórico às oscilações negativas desse retorno. Nesta análise, o CDI é usado como referência."
                        title="O índice de Sortino relaciona o retorno excedente histórico às oscilações negativas desse retorno. Nesta análise, o CDI é usado como referência."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`risk-adjusted-sortino-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.sortino.annualizedFormatted}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      {cur.sortino.downsideObservationCount} observações negativas
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
