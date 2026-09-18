'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, borderRadius } from '@atlas/ui';
import {
  PortfolioActivityGroupViewModel,
  PortfolioActivityItemViewModel,
  ActivityBadgeVariant,
} from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface PortfolioHistoryTimelineProps {
  portfolioId: string;
  groups: readonly PortfolioActivityGroupViewModel[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  loadMoreError?: string | null;
  hasActiveFilters?: boolean;
}

function mapBadgeVariant(
  variant: ActivityBadgeVariant,
): 'positive' | 'warning' | 'default' | 'primary' {
  switch (variant) {
    case 'positive':
      return 'positive';
    case 'negative':
    case 'warning':
      return 'warning';
    case 'info':
      return 'primary';
    case 'neutral':
    default:
      return 'default';
  }
}

export function PortfolioHistoryTimeline({
  portfolioId,
  groups,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  loadMoreError,
  hasActiveFilters = false,
}: PortfolioHistoryTimelineProps) {
  if (groups.length === 0) {
    return (
      <div
        style={{
          padding: `${spacing.xxl}px`,
          textAlign: 'center',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
        }}
      >
        <p
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: colors.textPrimary,
            margin: '0 0 8px 0',
          }}
        >
          {hasActiveFilters
            ? 'Nenhum evento encontrado para estes filtros.'
            : 'Nenhuma atividade encontrada.'}
        </p>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          {hasActiveFilters
            ? 'Tente ajustar ou limpar os filtros de período, tipo, conta ou ativo.'
            : 'Quando você registrar ou importar movimentações, elas aparecerão aqui em ordem cronológica.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xl}px` }}>
      {groups.map((group) => (
        <section key={group.date} aria-label={group.formattedDate}>
          {/* Date Group Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              {group.formattedDate}
            </h3>
            <div
              style={{
                flex: 1,
                height: '1px',
                backgroundColor: colors.border,
              }}
            />
          </div>

          {/* Group Items */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${spacing.sm}px`,
            }}
          >
            {group.items.map((item) => (
              <TimelineEventCard key={item.id} item={item} portfolioId={portfolioId} />
            ))}
          </div>
        </section>
      ))}

      {/* Keyset Cursor Pagination / Load More */}
      {hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: `${spacing.base}px` }}>
          {loadMoreError && (
            <p
              style={{
                fontSize: '0.8125rem',
                color: colors.negative,
                marginBottom: `${spacing.sm}px`,
              }}
            >
              Não foi possível carregar mais eventos.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            style={{ minWidth: '180px' }}
          >
            {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  );
}

interface TimelineEventCardProps {
  item: PortfolioActivityItemViewModel;
  portfolioId: string;
}

function TimelineEventCard({ item, portfolioId }: TimelineEventCardProps) {
  const isNegative = item.badgeVariant === 'negative';
  const isPositive = item.badgeVariant === 'positive';

  const amountColor = isNegative
    ? colors.negative
    : isPositive
      ? colors.positive
      : colors.textPrimary;

  return (
    <article
      aria-label={`${item.kindLabel} em ${item.formattedTradeDate}`}
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.md}px`,
        padding: `${spacing.base}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: `${spacing.base}px`,
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* Left Column: Kind Badge, Status, Asset / Account details */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: `${spacing.md}px` }}>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              marginBottom: '4px',
            }}
          >
            <Badge variant={mapBadgeVariant(item.badgeVariant)}>{item.kindLabel}</Badge>

            {item.statusBadgeLabel && <Badge variant="warning">{item.statusBadgeLabel}</Badge>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {item.assetTicker && (
              <>
                {item.canNavigateToAsset && item.assetId ? (
                  <Link
                    href={`/portfolio/assets/${item.assetId}?portfolioId=${portfolioId}`}
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      color: colors.accent,
                      textDecoration: 'none',
                    }}
                  >
                    {item.assetTicker}
                  </Link>
                ) : (
                  <span
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.assetTicker}
                  </span>
                )}
                {item.assetName && item.assetName !== item.assetTicker && (
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    ({item.assetName})
                  </span>
                )}
                <span style={{ color: colors.textMuted }}>•</span>
              </>
            )}

            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {item.accountName}
            </span>

            {item.secondaryContext && (
              <>
                <span style={{ color: colors.textMuted }}>•</span>
                <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  {item.secondaryContext}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Quantity and Amount */}
      <div style={{ textAlign: 'right', minWidth: '120px' }}>
        {item.amount && (
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: amountColor,
            }}
          >
            {item.amount}
          </div>
        )}
        {item.quantity && (
          <div
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              marginTop: '2px',
            }}
          >
            Quantidade: <strong>{item.quantity}</strong>
          </div>
        )}
      </div>
    </article>
  );
}
