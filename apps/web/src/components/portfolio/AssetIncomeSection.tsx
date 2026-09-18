'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { AssetIncomeEventItem } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface AssetIncomeSectionProps {
  events: readonly AssetIncomeEventItem[];
}

export function AssetIncomeSection({ events }: AssetIncomeSectionProps) {
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
          Rendimentos Recebidos
        </h2>
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Proventos creditados deste ativo (dividendos, JCP e rendimentos de FII)
        </span>
      </div>

      {events.length === 0 ? (
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
          Nenhum rendimento registrado para este ativo.
        </div>
      ) : (
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
              gridTemplateColumns: 'minmax(100px, 1fr) minmax(140px, 1.5fr) minmax(140px, 1.5fr) 1fr',
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
            <div>Data</div>
            <div>Tipo</div>
            <div>Conta</div>
            <div style={{ textAlign: 'right' }}>Valor Recebido</div>
          </div>

          <div>
            {events.map((inc, index) => (
              <div
                key={inc.transactionId}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(100px, 1fr) minmax(140px, 1.5fr) minmax(140px, 1.5fr) 1fr',
                  padding: `${spacing.base}px`,
                  borderBottom:
                    index < events.length - 1 ? `1px solid ${colors.border}` : 'none',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
                  {inc.formattedTradeDate}
                </div>
                <div>
                  <Badge variant="neutral">{inc.typeLabel}</Badge>
                </div>
                <div style={{ color: colors.textSecondary }}>{inc.accountName}</div>
                <div
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: colors.positive,
                  }}
                >
                  {inc.amount}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
