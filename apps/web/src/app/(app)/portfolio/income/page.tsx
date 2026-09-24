'use client';

import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import {
  colors,
  spacing,
  borderRadius,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
} from '@atlas/ui';
import { PortfolioDto } from '@/api/types';
import { buildPortfolioIncomeViewModel } from '@atlas/ui';
import {
  PortfolioHistoryFilters,
  HistoryFilterState,
  PortfolioHistoryTimeline,
} from '@/components/portfolio';
import { Card, Skeleton, ErrorState } from '@/components/ui';

function PortfolioIncomeContent() {
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
    queryKey: ['portfolio-income', activePortfolioId, stableFilterKey],
    queryFn: async ({ pageParam }) => {
      const sp = new URLSearchParams();
      sp.append('limit', '25');
      sp.append('type', 'income');
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
    getNextPageParam: (lastPage) =>
      lastPage?.meta?.hasMore && lastPage.meta.nextCursor ? lastPage.meta.nextCursor : null,
    enabled: Boolean(activePortfolioId),
    staleTime: 30_000,
  });

  const filterAssets = useMemo(() => {
    if (!stateData?.positions) return [];
    return stateData.positions.map((p) => ({ id: p.assetId, ticker: p.assetId.slice(0, 8) }));
  }, [stateData]);

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
    const map: Record<
      string,
      {
        id: string;
        ticker: string;
        name?: string | null;
        type?: string | null;
        currency?: string | null;
      }
    > = {};
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

  const incomeViewModel = useMemo(() => {
    return buildPortfolioIncomeViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name || 'Carteira',
      historyItems,
      pagination: lastMeta,
      incomeSummaries: stateData?.incomeSummaries ?? null,
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

  if (isPortfoliosLoading || (isHistoryLoading && !historyPages)) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Skeleton width="180px" height="24px" />
        <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
        {stateData?.incomeSummaries && stateData.incomeSummaries.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: `${spacing.base}px`,
              marginBottom: `${spacing.xl}px`,
            }}
          >
            {stateData.incomeSummaries.map((_, i) => (
              <Card key={i} style={{ padding: `${spacing.base}px` }}>
                <Skeleton width="60%" height="1.5rem" />
                <Skeleton width="40%" height="1rem" />
              </Card>
            ))}
          </div>
        )}
        <Card style={{ padding: `${spacing.base}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height="60px" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

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
            title="Falha ao carregar rendimentos"
            message={
              (historyError as ApiError)?.message ||
              'Ocorreu um erro ao consultar os rendimentos da carteira.'
            }
            onRetry={() => refetchHistory()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{ maxWidth: '1000px', margin: '0 auto', padding: `${spacing.xl}px ${spacing.base}px` }}
    >
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
          <span style={{ color: colors.textPrimary, fontWeight: 600 }}>Rendimentos</span>
        </div>
      </nav>
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
            Rendimentos
          </h1>
          <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
            Dividendos, JCP e rendimentos de FII creditados na carteira{' '}
            <strong style={{ color: colors.textPrimary }}>{activePortfolio?.name}</strong>
          </p>
        </div>
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
      {incomeViewModel.summaryCards.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: `${spacing.base}px`,
            marginBottom: `${spacing.xl}px`,
          }}
        >
          {incomeViewModel.summaryCards.map((card) => (
            <Card
              key={card.currency}
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.lg}px`,
                padding: `${spacing.base}px`,
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}>
                {card.currency}
              </span>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  marginTop: '4px',
                }}
              >
                {card.formattedTotalIncome}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                Div: {card.formattedDividends} • JCP: {card.formattedJcp} • FII:{' '}
                {card.formattedFiiIncome}
              </div>
            </Card>
          ))}
        </div>
      )}
      <PortfolioHistoryFilters
        filters={filters}
        onChange={setFilters}
        accounts={accountsData}
        assets={filterAssets}
      />
      <PortfolioHistoryTimeline
        portfolioId={activePortfolioId}
        /* eslint-disable @typescript-eslint/no-explicit-any */
        groups={incomeViewModel.groups as unknown as any}
        /* eslint-enable @typescript-eslint/no-explicit-any */
        hasNextPage={Boolean(hasNextPage)}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        loadMoreError={isHistoryError ? (historyError as ApiError)?.message : null}
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
}

function PortfolioIncomeSkeleton() {
  return (
    <div
      style={{ maxWidth: '1000px', margin: '0 auto', padding: `${spacing.xl}px ${spacing.base}px` }}
    >
      <Skeleton width="180px" height="24px" />
      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <Skeleton width="100%" height="80px" />
      </Card>
    </div>
  );
}

export default function PortfolioIncomePage() {
  return (
    <React.Suspense fallback={<PortfolioIncomeSkeleton />}>
      <PortfolioIncomeContent />
    </React.Suspense>
  );
}
