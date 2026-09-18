'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { AssetHistoryEventItem } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface AssetHistorySectionProps {
  items: readonly AssetHistoryEventItem[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreError?: string | null;
}

export function AssetHistorySection({
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  loadMoreError,
}: AssetHistorySectionProps) {
  return (
    <div style={{ marginBottom: `${spacing.xxl}px` }}>
      <div style={{ marginBottom: `${spacing.sm}px` }}>
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          Histórico do Ativo
        </h2>
        <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Extrato auditável cronológico reverso de eventos corporativos, alienações, rendimentos e transferências
        </span>
      </div>

      {items.length === 0 ? (
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
          Nenhum evento disponível para esta posição.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {items.map((event) => (
            <div
              key={event.id}
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.lg}px`,
                padding: `${spacing.base}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: `${spacing.md}px`,
              }}
            >
              {/* Left: Date & Event type badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: colors.textSecondary,
                    minWidth: '85px',
                  }}
                >
                  {event.formattedTradeDate}
                </span>

                <Badge variant={event.isCostBasisIncomplete ? 'warning' : 'neutral'}>
                  {event.kindLabel}
                </Badge>
              </div>

              {/* Center: Description & Account */}
              <div style={{ flex: '1 1 200px' }}>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: colors.textPrimary,
                    display: 'block',
                  }}
                >
                  {event.description}
                </span>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Conta: {event.accountName}
                </span>
              </div>

              {/* Right: Quantity or Amount if applicable */}
              <div style={{ textAlign: 'right', minWidth: '110px' }}>
                {event.amount && (
                  <span
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      color: colors.textPrimary,
                      display: 'block',
                    }}
                  >
                    {event.amount}
                  </span>
                )}
                {event.quantity && (
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block' }}>
                    Qtd: {event.quantity}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Load More Button / Indicator */}
          {hasNextPage && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                marginTop: `${spacing.md}px`,
              }}
            >
              <Button
                variant="secondary"
                onClick={onLoadMore}
                disabled={isFetchingNextPage}
                style={{ minWidth: '160px' }}
              >
                {isFetchingNextPage ? 'Carregando mais eventos...' : 'Carregar mais'}
              </Button>

              {loadMoreError && (
                <span style={{ fontSize: '0.75rem', color: colors.negative }}>
                  {loadMoreError}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
