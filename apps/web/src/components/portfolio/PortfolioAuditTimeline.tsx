'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

export interface OperationalAuditActorDto {
  kind: 'USER' | 'SYSTEM' | 'OPERATOR';
  label: string;
}

export interface OperationalAuditEntityRefDto {
  type: 'TRANSACTION' | 'INTEGRATION_RUN' | 'REVIEW' | 'PORTFOLIO';
  id: string;
  label?: string;
  routeHref?: string;
}

export interface OperationalAuditItemDto {
  id: string;
  eventType: string;
  category: 'RECTIFICATIONS' | 'RECONCILIATIONS' | 'IMPORTS';
  occurredAt: string;
  portfolioId: string;
  title: string;
  description: string;
  actor: OperationalAuditActorDto | null;
  entity: OperationalAuditEntityRefDto | null;
  reason: string | null;
  source: string;
}

export interface OperationalAuditResponseDto {
  data: OperationalAuditItemDto[];
  meta: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
    totalItemsInPage: number;
  };
}

export type AuditCategoryFilter = 'ALL' | 'IMPORTS' | 'RECONCILIATIONS' | 'RECTIFICATIONS';

const CATEGORY_TABS: Array<{ id: AuditCategoryFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'IMPORTS', label: 'Importações' },
  { id: 'RECONCILIATIONS', label: 'Conciliações' },
  { id: 'RECTIFICATIONS', label: 'Correções' },
];

function formatAuditDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

function categoryBadgeLabel(category: string): string {
  switch (category) {
    case 'RECTIFICATIONS':
      return 'Correção';
    case 'RECONCILIATIONS':
      return 'Conciliação';
    case 'IMPORTS':
      return 'Importação';
    default:
      return 'Atividade';
  }
}

function categoryBadgeVariant(category: string): 'warning' | 'primary' | 'default' {
  switch (category) {
    case 'RECTIFICATIONS':
      return 'warning';
    case 'RECONCILIATIONS':
      return 'primary';
    case 'IMPORTS':
    default:
      return 'default';
  }
}

function eventBadgeLabel(eventType: string): string | null {
  switch (eventType) {
    case 'IMPORT_COMPLETED':
      return 'Concluída';
    case 'IMPORT_PARTIAL':
      return 'Parcial';
    case 'IMPORT_FAILED':
      return 'Não concluída';
    default:
      return null;
  }
}

function eventBadgeVariant(eventType: string): 'success' | 'warning' | 'negative' | 'neutral' {
  switch (eventType) {
    case 'IMPORT_COMPLETED':
      return 'success';
    case 'IMPORT_PARTIAL':
      return 'warning';
    case 'IMPORT_FAILED':
      return 'negative';
    default:
      return 'neutral';
  }
}

export function PortfolioAuditTimeline({ portfolioId }: { portfolioId: string }) {
  const [selectedCategory, setSelectedCategory] = useState<AuditCategoryFilter>('ALL');

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['portfolio-audit-history', portfolioId, selectedCategory],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams();
        params.set('limit', '25');
        if (selectedCategory !== 'ALL') {
          params.set('category', selectedCategory);
        }
        if (pageParam) {
          params.set('cursor', pageParam);
        }
        const res = await apiClient.get<OperationalAuditResponseDto>(
          `/api/v1/portfolios/${portfolioId}/audit-history?${params.toString()}`,
        );
        return res;
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : null),
      enabled: Boolean(portfolioId),
      staleTime: 15_000,
    });

  const allItems = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div
      data-testid="portfolio-audit-timeline"
      style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
    >
      {/* Category Filter Toolbar */}
      <div
        role="tablist"
        aria-label="Filtro de tipos de atividade"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: spacing.xs,
          padding: spacing.xs,
          backgroundColor: colors.surface,
          borderRadius: `${borderRadius.md}px`,
          border: `1px solid ${colors.border}`,
        }}
      >
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedCategory(tab.id)}
              style={{
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? colors.surface : colors.textPrimary,
                backgroundColor: isActive ? colors.accent : 'transparent',
                border: 'none',
                borderRadius: `${borderRadius.sm}px`,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <Skeleton style={{ height: 96, borderRadius: borderRadius.md }} />
          <Skeleton style={{ height: 96, borderRadius: borderRadius.md }} />
          <Skeleton style={{ height: 96, borderRadius: borderRadius.md }} />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <ErrorState
          title="Erro ao carregar histórico de atividades"
          message="Não foi possível recuperar as alterações operacionais da carteira."
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !isError && allItems.length === 0 && (
        <div
          data-testid="audit-empty-state"
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
            Nenhuma atividade registrada ainda.
          </p>
          <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
            {selectedCategory === 'ALL'
              ? 'As operações financeiras de compra e venda continuam registradas na aba Operações.'
              : 'Nenhum registro encontrado para esta categoria de atividade.'}
          </p>
        </div>
      )}

      {/* Activity Timeline Feed */}
      {!isLoading && !isError && allItems.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.sm,
          }}
        >
          {allItems.map((item) => (
            <li
              key={item.id}
              data-testid={`audit-item-${item.id}`}
              style={{
                padding: spacing.md,
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.xs,
              }}
            >
              {/* Header: Badges & Timestamp */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: spacing.xs,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                  <Badge variant={categoryBadgeVariant(item.category)}>
                    {categoryBadgeLabel(item.category)}
                  </Badge>
                  {eventBadgeLabel(item.eventType) && (
                    <Badge variant={eventBadgeVariant(item.eventType)}>
                      {eventBadgeLabel(item.eventType)}
                    </Badge>
                  )}
                  <time
                    dateTime={item.occurredAt}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    {formatAuditDateTime(item.occurredAt)}
                  </time>
                </div>

                {/* Actor badge */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: item.actor ? colors.textPrimary : colors.textSecondary,
                    backgroundColor: colors.background,
                    padding: '2px 8px',
                    borderRadius: `${borderRadius.sm}px`,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  {item.actor ? item.actor.label : 'Autor não disponível'}
                </span>
              </div>

              {/* Title & Description */}
              <div style={{ marginTop: 2 }}>
                <h4
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: colors.textPrimary,
                    margin: '0 0 4px 0',
                  }}
                >
                  {item.title}
                </h4>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: colors.textSecondary,
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {item.description}
                </p>
              </div>

              {/* Reason note box (if present) */}
              {item.reason && item.reason.trim() !== '' && (
                <div
                  style={{
                    marginTop: 4,
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    backgroundColor: colors.background,
                    borderRadius: `${borderRadius.sm}px`,
                    borderLeft: `3px solid ${colors.border}`,
                    fontSize: '0.8125rem',
                    color: colors.textPrimary,
                  }}
                >
                  <strong style={{ color: colors.textSecondary }}>Motivo: </strong>
                  <span>{item.reason}</span>
                </div>
              )}

              {/* Action Link (if routeHref present) */}
              {item.entity?.routeHref && (
                <div style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}>
                  <Link
                    href={item.entity.routeHref}
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: colors.accent,
                      textDecoration: 'none',
                    }}
                    aria-label={`${item.entity.label ?? 'Ver detalhes'} de ${item.title}`}
                  >
                    {item.entity.label ?? 'Ver detalhes'} →
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination Load More Button */}
      {hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: spacing.sm }}>
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            aria-label="Carregar mais atividades"
          >
            {isFetchingNextPage ? 'Carregando mais...' : 'Carregar mais atividades'}
          </Button>
        </div>
      )}
    </div>
  );
}
