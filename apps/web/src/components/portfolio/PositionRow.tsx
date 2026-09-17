'use client';

import React, { useState } from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { PortfolioOverviewPositionItem } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface PositionRowProps {
  position: PortfolioOverviewPositionItem;
}

export function PositionRow({ position }: PositionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isIncomplete = position.costBasisStatus === 'INCOMPLETE';

  return (
    <div
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
        marginBottom: `${spacing.sm}px`,
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Main Position Header / Summary Row */}
      <div
        style={{
          padding: `${spacing.base}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
        }}
      >
        {/* Left: Asset Identifier & Completeness */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            minWidth: '200px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
              <span
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  fontFamily: 'monospace',
                }}
              >
                {position.displayIdentifier}
              </span>
              {isIncomplete && <Badge variant="warning">Dados incompletos</Badge>}
            </div>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {position.quantity} {position.quantity === '1' ? 'unidade' : 'unidades'} •{' '}
              {position.accountCount} {position.accountCount === 1 ? 'conta' : 'contas'}
            </span>
          </div>
        </div>

        {/* Center/Right: Financial Values */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xl}px`,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ textAlign: 'right', minWidth: '100px' }}>
            <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
              Preço médio
            </span>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: isIncomplete ? colors.textMuted : colors.textPrimary,
              }}
            >
              {position.averageCost}
            </span>
          </div>

          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
              Custo total
            </span>
            <span
              style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: isIncomplete ? colors.textMuted : colors.textPrimary,
              }}
            >
              {position.totalCost}
            </span>
          </div>

          {/* Toggle Account Breakdown Button */}
          {position.accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-label={`Ver detalhamento por conta para ${position.displayIdentifier}`}
              style={{
                background: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                color: colors.textSecondary,
                fontSize: '0.8125rem',
                fontWeight: 500,
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                minHeight: '36px',
              }}
            >
              <span>{isExpanded ? 'Ocultar contas' : 'Ver contas'}</span>
              <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Account Breakdown */}
      {isExpanded && position.accounts.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.surfaceElevated,
            padding: `${spacing.md}px ${spacing.base}px`,
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'block',
              marginBottom: `${spacing.sm}px`,
            }}
          >
            Distribuição por Conta de Custódia
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
            {position.accounts.map((acc) => {
              const accIncomplete = acc.costBasisStatus === 'INCOMPLETE';
              return (
                <div
                  key={acc.accountId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.sm}px 0`,
                    borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
                    fontSize: '0.875rem',
                    flexWrap: 'wrap',
                    gap: `${spacing.sm}px`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                      {acc.accountName}
                    </span>
                    {accIncomplete && <Badge variant="warning">Incompleto</Badge>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.lg}px` }}>
                    <span style={{ color: colors.textSecondary }}>
                      Qtd: <strong style={{ color: colors.textPrimary }}>{acc.quantity}</strong>
                    </span>
                    <span style={{ color: colors.textSecondary }}>
                      PM:{' '}
                      <strong
                        style={{ color: accIncomplete ? colors.textMuted : colors.textPrimary }}
                      >
                        {acc.averageCost}
                      </strong>
                    </span>
                    <span style={{ color: colors.textSecondary }}>
                      Custo:{' '}
                      <strong
                        style={{ color: accIncomplete ? colors.textMuted : colors.textPrimary }}
                      >
                        {acc.totalCost}
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
