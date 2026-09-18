'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { AssetRealizedDisposalItem } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface AssetRealizedSectionProps {
  disposals: readonly AssetRealizedDisposalItem[];
}

export function AssetRealizedSection({ disposals }: AssetRealizedSectionProps) {
  return (
    <div style={{ marginBottom: `${spacing.xl}px` }}>
      <div style={{ marginBottom: `${spacing.sm}px` }}>
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          Resultado Realizado
        </h2>
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Ganhos e perdas apurados em operações de venda encerradas deste ativo
        </span>
      </div>

      {disposals.length === 0 ? (
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
            padding: `${spacing.lg}px`,
            textAlign: 'center',
            color: colors.textSecondary,
            fontSize: '0.875rem',
          }}
        >
          Nenhuma alienação realizada para este ativo.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {disposals.map((disp) => {
            const amountColor = disp.isPositive
              ? colors.positive
              : disp.isNegative
                ? colors.negative
                : colors.textPrimary;

            return (
              <div
                key={disp.transactionId}
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                  padding: `${spacing.base}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                }}
              >
                {/* Header row: Date, Account & Status */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    borderBottom: `1px solid ${colors.border}`,
                    paddingBottom: `${spacing.xs}px`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}
                    >
                      {disp.formattedTradeDate}
                    </span>
                    <span style={{ color: colors.textMuted }}>•</span>
                    <span style={{ color: colors.textSecondary, fontSize: '0.8125rem' }}>
                      {disp.accountName}
                    </span>
                  </div>

                  {disp.status === 'INCOMPLETE' && (
                    <Badge variant="warning">Custo anterior incompleto</Badge>
                  )}
                </div>

                {/* Grid of economic values */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: `${spacing.md}px`,
                  }}
                >
                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Quantidade vendida
                    </span>
                    <span
                      style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                    >
                      {disp.quantity}
                    </span>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Valor bruto da venda
                    </span>
                    <span
                      style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                    >
                      {disp.grossProceeds}
                    </span>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Custos de venda
                    </span>
                    <span
                      style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                    >
                      {disp.sellingCosts}
                    </span>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Valor líquido da venda
                    </span>
                    <span
                      style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                    >
                      {disp.netProceeds}
                    </span>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Custo removido
                    </span>
                    <span
                      style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}
                    >
                      {disp.costBasisRemoved}
                    </span>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                    >
                      Resultado realizado
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: disp.status === 'INCOMPLETE' ? colors.textMuted : amountColor,
                        }}
                      >
                        {disp.realizedGainLoss}
                      </span>
                      {disp.realizedReturnPercentage && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: amountColor }}>
                          ({disp.realizedReturnPercentage})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
