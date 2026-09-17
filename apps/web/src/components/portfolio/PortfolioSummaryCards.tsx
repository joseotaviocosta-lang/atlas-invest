'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { KnownCostCardItem, RealizedResultCardItem, IncomeReceivedCardItem } from '@atlas/ui';

export interface PortfolioSummaryCardsProps {
  openPositionsCount: number;
  knownTotalCost: readonly KnownCostCardItem[];
  realizedResult: readonly RealizedResultCardItem[];
  incomeReceived: readonly IncomeReceivedCardItem[];
}

export function PortfolioSummaryCards({
  openPositionsCount,
  knownTotalCost,
  realizedResult,
  incomeReceived,
}: PortfolioSummaryCardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: `${spacing.base}px`,
        marginBottom: `${spacing.xl}px`,
      }}
    >
      {/* 1. Posições Abertas */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: `${spacing.base}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          Posições abertas
        </span>
        <span
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: '-0.3px',
          }}
        >
          {openPositionsCount}
        </span>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          {openPositionsCount === 1
            ? '1 ativo em custódia'
            : `${openPositionsCount} ativos em custódia`}
        </span>
      </div>

      {/* 2. Custo Total Conhecido */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: `${spacing.base}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          {knownTotalCost.some((c) => c.hasIncompletePositions)
            ? 'Custo total conhecido'
            : 'Custo total'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {knownTotalCost.map((cost) => (
            <div
              key={cost.currency}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  letterSpacing: '-0.3px',
                }}
              >
                {cost.formattedAmount}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: colors.textMuted,
                }}
              >
                {cost.currency}
              </span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          Capital alocado pelo custo de aquisição
        </span>
      </div>

      {/* 3. Resultado Realizado */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: `${spacing.base}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          Resultado realizado
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {realizedResult.length === 0 ? (
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: colors.textMuted,
              }}
            >
              —
            </span>
          ) : (
            realizedResult.map((res) => {
              const amountColor = res.isPositive
                ? colors.positive
                : res.isNegative
                  ? colors.negative
                  : colors.textPrimary;

              return (
                <div key={res.currency}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: amountColor,
                        letterSpacing: '-0.3px',
                      }}
                    >
                      {res.formattedAmount}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: colors.textMuted,
                      }}
                    >
                      {res.currency}
                    </span>
                  </div>
                  {res.formattedPercentage && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: amountColor,
                      }}
                    >
                      {res.formattedPercentage}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          Lucro ou prejuízo acumulado em vendas encerradas
        </span>
      </div>

      {/* 4. Rendimentos Recebidos */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: `${spacing.base}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.textSecondary,
          }}
        >
          Rendimentos recebidos
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {incomeReceived.length === 0 ? (
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: colors.textMuted,
              }}
            >
              —
            </span>
          ) : (
            incomeReceived.map((inc) => (
              <div key={inc.currency}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: colors.positive,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    {inc.formattedAmount}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: colors.textMuted,
                    }}
                  >
                    {inc.currency}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Div: {inc.breakdown.dividends} • JCP: {inc.breakdown.jcp} • FII:{' '}
                  {inc.breakdown.fiiIncome}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
