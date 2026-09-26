'use client';

import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { PortfolioDto } from '@/api/types';
import {
  colors,
  spacing,
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from '@atlas/ui';
import {
  PortfolioHistoryFilters,
  PortfolioHistoryTimeline,
  HistoryFilterState,
} from '@/components/portfolio';
import { Card, Skeleton, ErrorState } from '@/components/ui';

function PortfolioHistoryContent() {
  const searchParams = useSearchParams();
  const portfolioIdParam = searchParams.get('portfolioId');
  const accountIdParam = searchParams.get('accountId');

  // Filter State (accountId may arrive via deep-link from the account detail)
  const [filters, setFilters] = useState<HistoryFilterState>({
    period: 'all',
    type: '',
    accountId: accountIdParam || '',
    assetId: '',
    from: '',
    to: '',
  });

  // 1. Fetch user portfolios to resolve active portfolio context
  const { data: portfolios = [], isLoading: isPortfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data;
    },
    staleTime: 60_000,
  });

  const activePortfolioId = portfolioIdParam || portfolios[0]?.id || '';
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;

  // 2. Fetch portfolio state (for open position validation and asset metadata)
  const { data: stateData } = useQuery({
    queryKey: ['portfolio-state', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const res = await apiClient.get<{ data: PortfolioStateDto }>(
        `/api/v1/portfolios/${activePortfolioId}/state`,
      );
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 30_000,
  });

  // 3. Fetch portfolio account metadata
  const { data: accountsData = [] } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return [];
      const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
        `/api/v1/portfolios/${activePortfolioId}/accounts`,
      );
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60_000,
  });

  // 4. Stable filter object for queryKey identity
  const stableFilterKey = useMemo(
    () => ({
      type: filters.type || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      accountId: filters.accountId || undefined,
      assetId: filters.assetId || undefined,
    }),
    [filters.type, filters.from, filters.to, filters.accountId, filters.assetId],
  );

  // 5. Fetch paginated activity history via useInfiniteQuery
  const {
    data: historyPages,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchHistory,
  } = useInfiniteQuery({
    queryKey: ['portfolio-history', activePortfolioId, stableFilterKey],
    queryFn: async ({ pageParam }) => {
      const sp = new URLSearchParams();
      sp.append('limit', '25');
      if (filters.type) sp.append('type', filters.type);
      if (filters.from) sp.append('from', filters.from);
      if (filters.to) sp.append('to', filters.to);
      if (filters.accountId) sp.append('accountId', filters.accountId);
      if (filters.assetId) sp.append('assetId', filters.assetId);
      if (pageParam) sp.append('cursor', pageParam);

      const res = await apiClient.get<{
        data: PortfolioHistoryItemDto[];
        meta: PortfolioHistoryPaginationMetaDto;
      }>(`/api/v1/portfolios/${activePortfolioId}/history?${sp.toString()}`);
      return res;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage?.meta?.hasMore && lastPage.meta.nextCursor) {
        return lastPage.meta.nextCursor;
      }
      return null;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 30_000,
  });

  // Extract open assets from state to populate the asset filter dropdown
  const filterAssets = useMemo(() => {
    if (!stateData?.positions) return [];
    return stateData.positions.map((p) => ({
      id: p.assetId,
      ticker: p.assetId.slice(0, 8),
    }));
  }, [stateData]);

  // Aggregate loaded pages into single array for the presentation view-model
  const historyItems = useMemo(() => {
    if (!historyPages?.pages) return [];
    return historyPages.pages.flatMap((page) => page.data);
  }, [historyPages]);

  const lastMeta: PortfolioHistoryPaginationMetaDto = historyPages?.pages[
    historyPages.pages.length - 1
  ]?.meta ?? {
    limit: 25,
    cursor: null,
    nextCursor: null,
    hasMore: false,
    totalCount: historyItems.length,
  };

  const assetsMetaMap = useMemo(() => {
    const map: Record<string, AssetMeta> = {};
    if (stateData?.positions) {
      for (const pos of stateData.positions) {
        map[pos.assetId] = {
          id: pos.assetId,
          ticker: pos.assetId.slice(0, 8),
          currency: pos.currency,
        };
      }
    }
    return map;
  }, [stateData]);

  // Pure presentation view model
  const activityViewModel = useMemo(() => {
    return buildPortfolioActivityViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name || 'Carteira',
      historyItems,
      pagination: lastMeta,
      portfolioState: stateData ?? null,
      accountsMeta: accountsData,
      assetsMeta: assetsMetaMap,
    });
  }, [
    activePortfolioId,
    activePortfolio?.name,
    historyItems,
    lastMeta,
    stateData,
    accountsData,
    assetsMetaMap,
  ]);

  const hasActiveFilters =
    filters.period !== 'all' ||
    Boolean(filters.type) ||
    Boolean(filters.accountId) ||
    Boolean(filters.assetId) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  // Initial Loading Skeleton
  if (isPortfoliosLoading || (isHistoryLoading && !historyPages)) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Skeleton width="180px" height="24px" />
        </div>
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
        <Card style={{ padding: `${spacing.base}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
          </div>
        </Card>
      </div>
    );
  }

  // Initial Error State
  if (isHistoryError && !historyPages) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <ErrorState
            title="Falha ao carregar histórico"
            message={
              (historyError as ApiError)?.message ||
              'Ocorreu um erro ao consultar o extrato de eventos da carteira.'
            }
            onRetry={() => refetchHistory()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: `${spacing.xl}px ${spacing.base}px`,
      }}
    >
      {/* 1. Breadcrumbs Navigation */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: `${spacing.md}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            fontSize: '0.875rem',
            color: colors.textSecondary,
          }}
        >
          <Link
            href={`/portfolio${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`}
            style={{ color: colors.accent, textDecoration: 'none', fontWeight: 500 }}
          >
            Carteira
          </Link>
          <span>/</span>
          <span style={{ color: colors.textPrimary, fontWeight: 600 }}>Histórico</span>
        </div>
      </nav>

      {/* 2. Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Histórico de Atividades
          </h1>
          <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
            Extrato cronológico unificado de movimentações, eventos e rendimentos da carteira{' '}
            <strong style={{ color: colors.textPrimary }}>{activePortfolio?.name}</strong>
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: `${spacing.sm}px`,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href={`/ai?portfolioId=${activePortfolioId}&scope=timeline${filters.from ? `&from=${filters.from}` : ''}${filters.to ? `&to=${filters.to}` : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: colors.accent,
              backgroundColor: `${colors.accent}15`,
              border: `1px solid ${colors.accent}40`,
              borderRadius: '8px',
              textDecoration: 'none',
            }}
          >
            <span>✨ Perguntar à IA sobre este período</span>
          </Link>
          <Link
            href={`/portfolio${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span
              style={{
                fontSize: '0.875rem',
                color: colors.accent,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Voltar para Visão Geral
            </span>
          </Link>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <PortfolioHistoryFilters
        filters={filters}
        onChange={setFilters}
        accounts={accountsData}
        assets={filterAssets}
      />

      {/* 4. Timeline Feed */}
      <PortfolioHistoryTimeline
        portfolioId={activePortfolioId}
        groups={activityViewModel.groups}
        hasNextPage={Boolean(hasNextPage)}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        loadMoreError={isHistoryError ? (historyError as ApiError)?.message : null}
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
}

function PortfolioHistorySkeleton() {
  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: `${spacing.xl}px ${spacing.base}px`,
      }}
    >
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <Skeleton width="180px" height="24px" />
      </div>
      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <Skeleton width="100%" height="80px" />
      </Card>
      <Card style={{ padding: `${spacing.base}px` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
        </div>
      </Card>
    </div>
  );
}

export default function PortfolioHistoryPage() {
  return (
    <React.Suspense fallback={<PortfolioHistorySkeleton />}>
      <PortfolioHistoryContent />
    </React.Suspense>
  );
}
