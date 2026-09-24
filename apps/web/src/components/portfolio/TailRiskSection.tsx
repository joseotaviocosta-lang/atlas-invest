'use client';

import React, { useMemo } from 'react';
import { Card, Badge, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioTailRiskViewModel,
  RawTailRiskData,
  TAIL_CONFIDENCE_OPTIONS,
  TAIL_RISK_TOOLTIPS,
} from '@atlas/ui';

export type TailRiskQueryData = { data: RawTailRiskData } | undefined;

/**
 * Downside & tail risk subsection (3N, ADR-153).
 * Renders server-computed downside deviation, semideviation and historical
 * VaR/CVaR loss magnitudes only. Zero math: no sorting, quantile, downside,
 * VaR, CVaR or tail mean is computed here. Losses are non-negative.
 */
export function TailRiskSection({
  data,
  isLoading,
  isError,
  onRetry,
  confidenceLevel,
  onConfidenceChange,
}: {
  data: TailRiskQueryData;
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
    <Card style={{ padding: 16 }} data-testid="tail-risk-section">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Risco de cauda</h3>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Perdas históricas observadas a partir da distribuição de retornos. Valores históricos, não
          previsões.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, alignSelf: 'center' }}>Confiança:</span>
        {TAIL_CONFIDENCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onConfidenceChange(opt.value)}
            aria-label={`Selecionar confiança ${opt.label}`}
            aria-pressed={confidenceLevel === opt.value}
            data-testid={`tail-confidence-${opt.value}`}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${confidenceLevel === opt.value ? colors.accent : colors.border}`,
              background: confidenceLevel === opt.value ? colors.accentSubtle : colors.surface,
              color: confidenceLevel === opt.value ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div aria-label="Carregando risco de cauda">
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar o risco de cauda." onRetry={onRetry} />
      ) : !viewModel || viewModel.isUnavailable ? (
        <EmptyState
          title="Histórico insuficiente para calcular esta métrica."
          description="Não há retornos econômicos suficientes neste período. O restante da página continua válido."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {viewModel.isPartial && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="warning">Dados parciais</Badge>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                Dados parciais para métricas de risco de cauda.
              </span>
            </div>
          )}

          {viewModel.currencies.map((cur) => (
            <div key={cur.currency} data-testid={`tail-risk-${cur.currency}`}>
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
                  {cur.observationCount} observações
                </span>
              </div>

              {cur.isUnavailable ? (
                <EmptyState
                  title="Histórico insuficiente para calcular esta métrica."
                  description={`Sem métricas disponíveis para ${cur.currency} neste período.`}
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Downside deviation anualizada
                      </span>
                      <span
                        role="img"
                        aria-label={TAIL_RISK_TOOLTIPS.DOWNSIDE}
                        title={TAIL_RISK_TOOLTIPS.DOWNSIDE}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`tail-downside-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.hasDownside ? cur.downsideAnnualizedFormatted : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Semidesvio anualizado</span>
                      <span
                        role="img"
                        aria-label={TAIL_RISK_TOOLTIPS.SEMIDEVIATION}
                        title={TAIL_RISK_TOOLTIPS.SEMIDEVIATION}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`tail-semideviation-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.hasSemideviation ? cur.semideviationAnnualizedFormatted : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cur.varLabel}</span>
                      <span
                        role="img"
                        aria-label={TAIL_RISK_TOOLTIPS.VAR}
                        title={TAIL_RISK_TOOLTIPS.VAR}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`tail-var-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.hasVar ? cur.varLossFormatted : '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cur.cvarLabel}</span>
                      <span
                        role="img"
                        aria-label={TAIL_RISK_TOOLTIPS.CVAR}
                        title={TAIL_RISK_TOOLTIPS.CVAR}
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`tail-cvar-${cur.currency}`}
                      style={{ fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {cur.hasCvar ? cur.cvarLossFormatted : '—'}
                    </div>
                  </div>
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
