'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { PortfolioDto } from '@/api/types';
import {
  colors,
  spacing,
  borderRadius,
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from '@atlas/ui';
import {
  PortfolioHistoryFilters,
  PortfolioHistoryTimeline,
  PortfolioAuditTimeline,
  HistoryFilterState,
  PortfolioShell,
} from '@/components/portfolio';
import { Card, Skeleton, ErrorState } from '@/components/ui';

interface CatalogAssetDto {
  id: string;
  ticker: string;
  name: string;
}

function PortfolioHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioIdParam = searchParams.get('portfolioId');
  const accountIdParam = searchParams.get('accountId');

  // View State (operations vs activity audit feed)
  const viewParam = searchParams.get('view') === 'activity' ? 'activity' : 'operations';
  const [activeView, setActiveView] = useState<'operations' | 'activity'>(viewParam);

  const handleViewChange = (view: 'operations' | 'activity') => {
    setActiveView(view);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (view === 'activity') {
      nextParams.set('view', 'activity');
    } else {
      nextParams.delete('view');
    }
    router.replace(`/portfolio/history?${nextParams.toString()}`);
  };
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

  // 6. Fetch assets catalog to enrich tickers and names
  const { data: assetsCatalog = [] } = useQuery<CatalogAssetDto[], ApiError>({
    queryKey: ['assets-catalog'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: CatalogAssetDto[] }>('/api/v1/assets');
        return res.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const assetsMetaMap = useMemo(() => {
    const map: Record<string, AssetMeta> = {};
    for (const asset of assetsCatalog) {
      map[asset.id] = {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
      };
    }
    if (stateData?.positions) {
      for (const pos of stateData.positions) {
        const existing = map[pos.assetId];
        if (!existing) {
          map[pos.assetId] = {
            id: pos.assetId,
            ticker: pos.ticker || 'Ativo',
            name: pos.assetName || pos.ticker || 'Ativo',
            currency: pos.currency,
          };
        } else if (pos.ticker || pos.assetName) {
          map[pos.assetId] = {
            id: pos.assetId,
            ticker: existing.ticker || pos.ticker || 'Ativo',
            name: existing.name || pos.assetName || pos.ticker || 'Ativo',
            currency: pos.currency || existing.currency,
          };
        }
      }
    }
    return map;
  }, [assetsCatalog, stateData]);

  // Extract open assets from state to populate the asset filter dropdown
  const filterAssets = useMemo(() => {
    if (!stateData?.positions) return [];
    return stateData.positions.map((p) => {
      const meta = assetsMetaMap[p.assetId];
      return {
        id: p.assetId,
        ticker: meta?.ticker || p.ticker || 'Ativo',
      };
    });
  }, [stateData, assetsMetaMap]);

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
      <PortfolioShell
        activeTab="history"
        selectedPortfolioId={activePortfolioId}
        portfolios={portfolios}
        onSelectPortfolio={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('portfolioId', id);
          router.replace(`/portfolio/history?${params.toString()}`);
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
      </PortfolioShell>
    );
  }

  // Initial Error State
  if (isHistoryError && !historyPages) {
    return (
      <PortfolioShell
        activeTab="history"
        selectedPortfolioId={activePortfolioId}
        portfolios={portfolios}
        onSelectPortfolio={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('portfolioId', id);
          router.replace(`/portfolio/history?${params.toString()}`);
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
      </PortfolioShell>
    );
  }

  return (
    <PortfolioShell
      activeTab="history"
      selectedPortfolioId={activePortfolioId}
      portfolios={portfolios}
      subtitle={
        activePortfolio
          ? `Extrato cronológico unificado de movimentações, eventos e rendimentos de "${activePortfolio.name}"`
          : 'Extrato cronológico unificado de movimentações, eventos e rendimentos'
      }
      onSelectPortfolio={(id) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('portfolioId', id);
        router.replace(`/portfolio/history?${params.toString()}`);
      }}
    >
      {/* Sub-tab switcher: Operações vs Atividade */}
      <div
        role="tablist"
        aria-label="Tipo de histórico"
        style={{
          display: 'flex',
          gap: spacing.xs,
          padding: '4px',
          backgroundColor: colors.surface,
          borderRadius: `${borderRadius.md}px`,
          border: `1px solid ${colors.border}`,
          marginBottom: `${spacing.lg}px`,
          width: 'fit-content',
        }}
      >
        <button
          role="tab"
          aria-selected={activeView === 'operations'}
          onClick={() => handleViewChange('operations')}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: '0.875rem',
            fontWeight: activeView === 'operations' ? 600 : 500,
            color: activeView === 'operations' ? colors.surface : colors.textPrimary,
            backgroundColor: activeView === 'operations' ? colors.accent : 'transparent',
            border: 'none',
            borderRadius: `${borderRadius.sm}px`,
            cursor: 'pointer',
          }}
        >
          Operações
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'activity'}
          onClick={() => handleViewChange('activity')}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: '0.875rem',
            fontWeight: activeView === 'activity' ? 600 : 500,
            color: activeView === 'activity' ? colors.surface : colors.textPrimary,
            backgroundColor: activeView === 'activity' ? colors.accent : 'transparent',
            border: 'none',
            borderRadius: `${borderRadius.sm}px`,
            cursor: 'pointer',
          }}
        >
          Atividade
        </button>
      </div>

      {activeView === 'activity' ? (
        <PortfolioAuditTimeline portfolioId={activePortfolioId} />
      ) : (
        <>
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
            <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
              Linha do tempo contínua de compras, vendas, proventos e eventos corporativos
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
            </div>
          </div>

          {/* Filter Bar */}
          <PortfolioHistoryFilters
            filters={filters}
            onChange={setFilters}
            accounts={accountsData}
            assets={filterAssets}
          />

          {/* Timeline Feed */}
          <PortfolioHistoryTimeline
            portfolioId={activePortfolioId}
            groups={activityViewModel.groups}
            hasNextPage={Boolean(hasNextPage)}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            loadMoreError={isHistoryError ? (historyError as ApiError)?.message : null}
            hasActiveFilters={hasActiveFilters}
          />
        </>
      )}
    </PortfolioShell>
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
