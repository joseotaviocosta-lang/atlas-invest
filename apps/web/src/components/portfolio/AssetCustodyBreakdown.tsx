'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { AssetAccountBreakdownItem } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface AssetCustodyBreakdownProps {
  accounts: readonly AssetAccountBreakdownItem[];
}

export function AssetCustodyBreakdown({ accounts }: AssetCustodyBreakdownProps) {
  if (accounts.length === 0) {
    return null;
  }

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
          Custódia por Conta
        </h2>
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Distribuição das cotas entre suas instituições e corretoras
        </span>
      </div>

      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr',
            padding: `${spacing.sm}px ${spacing.base}px`,
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surfaceElevated,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div>Conta / Instituição</div>
          <div style={{ textAlign: 'right' }}>Quantidade</div>
          <div style={{ textAlign: 'right' }}>Preço médio</div>
          <div style={{ textAlign: 'right' }}>Custo total</div>
        </div>

        <div>
          {accounts.map((acc, index) => (
            <div
              key={acc.accountId}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr',
                padding: `${spacing.base}px`,
                borderBottom: index < accounts.length - 1 ? `1px solid ${colors.border}` : 'none',
                alignItems: 'center',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {acc.accountName}
                </span>
                {acc.isCostBasisIncomplete && <Badge variant="warning">Custo incompleto</Badge>}
              </div>
              <div style={{ textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>
                {acc.quantity}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  color: acc.isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                }}
              >
                {acc.averageCost}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontWeight: 700,
                  color: acc.isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                }}
              >
                {acc.totalCost}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
