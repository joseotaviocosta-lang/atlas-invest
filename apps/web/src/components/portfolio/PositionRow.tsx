'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { colors, spacing, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';
import { PortfolioOverviewPositionItem, appendAsOf } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';

export interface PositionValuationDisplay {
  ticker?: string | null;
  assetType?: string | null;
  marketValue: { amount: string; currency: string } | null;
  unrealizedGainLoss: { amount: string; currency: string } | null;
  unrealizedGainLossPercent: string | null;
  status: string;
  quoteFreshness: string | null;
  quote: {
    price: string;
    currency: string;
    asOf?: string;
    freshness: string;
    status: string;
  } | null;
}

export interface PositionRowProps {
  position: PortfolioOverviewPositionItem;
  portfolioId?: string;
  /** Historical snapshot `YYYY-MM-DD`; preserved in asset navigation. */
  asOf?: string | null;
  valuation?: PositionValuationDisplay | null;
  isHistorical?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PositionRow({
  position,
  portfolioId,
  asOf,
  valuation,
  isHistorical,
}: PositionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isIncomplete = position.costBasisStatus === 'INCOMPLETE';
  const assetHref = appendAsOf(
    `/portfolio/assets/${position.assetId}${portfolioId ? `?portfolioId=${portfolioId}` : ''}`,
    asOf ?? null,
  );

  const primaryLabel =
    valuation?.ticker ||
    position.ticker ||
    (!UUID_REGEX.test(position.displayIdentifier) ? position.displayIdentifier : null) ||
    'Ativo sem identificação';

  const secondaryLabel = position.assetName || valuation?.assetType || null;

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
              <Link
                href={assetHref}
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: colors.accent,
                  fontFamily: 'monospace',
                  textDecoration: 'none',
                }}
                aria-label={`Ver detalhes de ${primaryLabel}`}
              >
                {primaryLabel}
              </Link>
              {isIncomplete && <Badge variant="warning">Dados incompletos</Badge>}
            </div>
            {secondaryLabel && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '220px',
                }}
              >
                {secondaryLabel}
              </div>
            )}
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

          {!isHistorical && valuation && (
            <>
              {/* Cotação e Data */}
              <div style={{ textAlign: 'right', minWidth: '110px' }}>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
                  Cotação
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: valuation.quote ? colors.textPrimary : colors.textMuted,
                  }}
                >
                  {valuation.quote
                    ? formatCurrency(valuation.quote.price, valuation.quote.currency)
                    : '—'}
                </span>
                <div style={{ marginTop: '2px' }}>
                  {valuation.status === 'QUOTE_UNAVAILABLE' && (
                    <Badge variant="neutral">Sem cotação</Badge>
                  )}
                  {valuation.status === 'CURRENCY_MISMATCH' && (
                    <Badge variant="danger">Moeda incompatível</Badge>
                  )}
                  {valuation.quoteFreshness === 'STALE' && (
                    <Badge variant="warning">Desatualizada</Badge>
                  )}
                  {valuation.quoteFreshness === 'FRESH' && (
                    <Badge variant="positive">Atualizada</Badge>
                  )}
                </div>
                {valuation.quote?.asOf && (
                  <span
                    style={{ fontSize: '0.6875rem', color: colors.textMuted, display: 'block' }}
                  >
                    {valuation.quote.asOf}
                  </span>
                )}
              </div>

              {/* Valor de Mercado */}
              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
                  Valor de mercado
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: valuation.marketValue ? colors.textPrimary : colors.textMuted,
                  }}
                >
                  {valuation.marketValue
                    ? formatCurrency(valuation.marketValue.amount, valuation.marketValue.currency)
                    : '—'}
                </span>
              </div>

              {/* Resultado Não Realizado */}
              <div style={{ textAlign: 'right', minWidth: '130px' }}>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block' }}>
                  Resultado não realizado
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: valuation.unrealizedGainLoss
                      ? valuation.unrealizedGainLoss.amount.startsWith('-')
                        ? colors.negative
                        : colors.positive
                      : colors.textMuted,
                  }}
                >
                  {valuation.unrealizedGainLoss
                    ? formatCurrency(
                        valuation.unrealizedGainLoss.amount,
                        valuation.unrealizedGainLoss.currency,
                      )
                    : '—'}
                  {valuation.unrealizedGainLossPercent
                    ? ` (${formatPercentage(valuation.unrealizedGainLossPercent, { showSign: true })})`
                    : ''}
                </span>
              </div>
            </>
          )}

          {/* Actions: View Details Link & Toggle Account Breakdown Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href={assetHref}
              style={{
                background: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                color: colors.accent,
                fontSize: '0.8125rem',
                fontWeight: 600,
                padding: '6px 12px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                minHeight: '36px',
              }}
              aria-label={`Ver detalhes da posição ${position.displayIdentifier}`}
            >
              <span>Ver detalhe</span>
              <span aria-hidden="true">→</span>
            </Link>

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
