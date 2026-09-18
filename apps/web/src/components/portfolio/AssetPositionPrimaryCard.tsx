'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';

export interface AssetPositionPrimaryCardProps {
  quantity: string;
  averageCost: string;
  totalCost: string;
  currency: string;
  totalCostLabel: string;
  isCostBasisIncomplete: boolean;
}

export function AssetPositionPrimaryCard({
  quantity,
  averageCost,
  totalCost,
  currency,
  totalCostLabel,
  isCostBasisIncomplete,
}: AssetPositionPrimaryCardProps) {
  return (
    <div
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
        padding: `${spacing.lg}px`,
        marginBottom: `${spacing.xl}px`,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: `${spacing.lg}px`,
        }}
      >
        {/* 1. Quantidade Atual */}
        <div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}>
            Quantidade atual
          </span>
          <div style={{ marginTop: '4px' }}>
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              {quantity}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            Cotas/ações sob custódia
          </span>
        </div>

        {/* 2. Preço Médio */}
        <div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}>
            Preço médio
          </span>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              {averageCost}
            </span>
            {!isCostBasisIncomplete && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textMuted }}>
                {currency}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            {isCostBasisIncomplete ? 'Histórico de custo incompleto' : 'Custo médio por cota'}
          </span>
        </div>

        {/* 3. Custo Total */}
        <div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}>
            {totalCostLabel}
          </span>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              {totalCost}
            </span>
            {!isCostBasisIncomplete && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textMuted }}>
                {currency}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            Capital alocado de aquisição
          </span>
        </div>
      </div>
    </div>
  );
}
