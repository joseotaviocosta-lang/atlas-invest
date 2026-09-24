'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import { mapToPortfolioBenchmarkRelativeRiskViewModel, RawRelativeRiskData } from '@atlas/ui';

export type RelativeRiskQueryData = { data: RawRelativeRiskData } | undefined;

const BETA_TOOLTIP =
  'O beta mede a sensibilidade histórica dos retornos da carteira às variações do Ibovespa no mesmo período.';
const CORRELATION_TOOLTIP =
  'A correlação mostra o grau de associação histórica entre os retornos da carteira e do Ibovespa, variando de -1 a 1.';
const TRACKING_ERROR_TOOLTIP =
  'O tracking error mede quanto os retornos históricos da carteira se desviaram dos retornos do Ibovespa.';

/**
 * Benchmark-relative risk subsection (3K, ADR-138).
 * Renders server-computed Beta/Correlation ratios and the annualized tracking
 * error only. Zero math: no covariance, variance, beta, correlation, active
 * returns, tracking error or interval alignment is computed here. Ratios render
 * WITHOUT a percent sign; tracking error renders WITH a percent sign.
 */
export function RelativeRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: RelativeRiskQueryData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioBenchmarkRelativeRiskViewModel(data.data) : null),
    [data],
  );

  return (
    <Card style={{ padding: 16 }} data-testid="relative-risk-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Relação com o mercado</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Como os retornos históricos da carteira se relacionaram com o Ibovespa. Valores
          históricos, não previsões.
        </div>
      </div>

      {isLoading ? (
        <div aria-label="Carregando relação com o mercado">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar a relação com o mercado."
          onRetry={onRetry}
        />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para calcular métricas relativas ao Ibovespa."
          description="Não há intervalos econômicos alinhados suficientes neste período. O restante da página continua válido."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para comparação com o Ibovespa.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) =>
            cur.isIncompatibleCurrency ? (
              <div
                key={cur.currency}
                data-testid={`relative-risk-${cur.currency}`}
                style={{ fontSize: 13, color: colors.textSecondary }}
              >
                <strong>{cur.currency}</strong>: Indisponível sem benchmark compatível.
              </div>
            ) : cur.isUnavailable ? (
              <EmptyState
                key={cur.currency}
                title="Histórico insuficiente para calcular métricas relativas ao Ibovespa."
                description={`Sem métricas disponíveis para ${cur.currency} neste período.`}
              />
            ) : (
              <div
                key={cur.currency}
                data-testid={`relative-risk-${cur.currency}`}
                aria-label={`Beta, correlação e tracking error em ${cur.currency} frente ao Ibovespa`}
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
                    {cur.benchmarkLabel} • {cur.observationCount} observações
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
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Beta</span>
                      <span
                        role="img"
                        aria-label={BETA_TOOLTIP}
                        title={BETA_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`relative-risk-beta-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.betaFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Correlação</span>
                      <span
                        role="img"
                        aria-label={CORRELATION_TOOLTIP}
                        title={CORRELATION_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`relative-risk-correlation-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.correlationFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Tracking error anualizado
                      </span>
                      <span
                        role="img"
                        aria-label={TRACKING_ERROR_TOOLTIP}
                        title={TRACKING_ERROR_TOOLTIP}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`relative-risk-tracking-error-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.trackingErrorFormatted}
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
