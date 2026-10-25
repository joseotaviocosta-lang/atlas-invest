'use client';

import React, { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { PortfolioDto } from '@/api/types';
import { useRouter } from 'next/navigation';
import {
  colors,
  spacing,
  borderRadius,
  mapToAssetPositionDetailViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
  resolveTemporalContext,
  getTodayCivilDateString,
  assetStateQueryKey,
  appendAsOf,
} from '@atlas/ui';
import {
  AssetPositionHeader,
  AssetPositionPrimaryCard,
  AssetCustodyBreakdown,
  AssetRealizedSection,
  AssetIncomeSection,
  AssetHistorySection,
  PortfolioHistoricalBanner,
  PositionIntelligenceSection,
} from '@/components/portfolio';
import { Card, Button, Skeleton, ErrorState } from '@/components/ui';

function AssetPositionDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const assetId = (params?.assetId as string) || '';
  const portfolioIdParam = searchParams.get('portfolioId');

  // Temporal context (Fase 2F): historical snapshots come from server replay.
  const today = React.useMemo(() => getTodayCivilDateString(), []);
  const temporal = React.useMemo(
    () => resolveTemporalContext({ rawAsOf: searchParams.get('asOf'), today }),
    [searchParams, today],
  );
  const isHistorical = temporal.mode === 'HISTORICAL';

  const clearAsOf = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('asOf');
    const qs = next.toString();
    router.replace(`/portfolio/assets/${assetId}${qs ? `?${qs}` : ''}`);
  };

  // 1. Fetch user portfolios to resolve portfolio context
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

  // 2. Fetch portfolio state (current or historical server replay via `asOf`)
  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
  } = useQuery({
    queryKey: assetStateQueryKey(activePortfolioId, assetId, temporal.asOf),
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const endpoint = temporal.asOf
        ? `/api/v1/portfolios/${activePortfolioId}/state?asOf=${temporal.asOf}`
        : `/api/v1/portfolios/${activePortfolioId}/state`;
      const res = await apiClient.get<{ data: PortfolioStateDto }>(endpoint);
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

  // 4. Fetch asset metadata
  const { data: assetData = null } = useQuery({
    queryKey: ['asset-metadata', assetId],
    queryFn: async () => {
      if (!assetId) return null;
      try {
        const res = await apiClient.get<{ data: AssetMeta }>(`/api/v1/assets/${assetId}`);
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: Boolean(assetId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // 5. Fetch paginated asset history
  const {
    data: historyPages,
    isError: isHistoryError,
    error: historyError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['portfolio-history', activePortfolioId, assetId],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/v1/portfolios/${activePortfolioId}/history?assetId=${assetId}&limit=20&cursor=${pageParam}`
        : `/api/v1/portfolios/${activePortfolioId}/history?assetId=${assetId}&limit=20`;
      return apiClient.get<{
        data: PortfolioHistoryItemDto[];
        meta: PortfolioHistoryPaginationMetaDto;
      }>(url);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.meta?.nextCursor ?? undefined,
    enabled: Boolean(activePortfolioId && assetId),
    staleTime: 30_000,
  });

  // Flatten and deduplicate history items across pages
  const allHistoryItems = useMemo(() => {
    const seen = new Set<string>();
    const items: PortfolioHistoryItemDto[] = [];
    for (const page of historyPages?.pages ?? []) {
      for (const item of page?.data ?? []) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
    return items;
  }, [historyPages]);

  const lastHistoryMeta =
    historyPages?.pages && historyPages.pages.length > 0
      ? historyPages.pages[historyPages.pages.length - 1]?.meta
      : undefined;

  // Build ViewModel
  const viewModel = useMemo(() => {
    if (!stateData) return null;
    return mapToAssetPositionDetailViewModel({
      assetId,
      state: stateData,
      historyItems: allHistoryItems,
      historyMeta: lastHistoryMeta,
      portfolioMeta: activePortfolio,
      accountsMeta: accountsData,
      assetMeta: assetData,
    });
  }, [
    assetId,
    stateData,
    allHistoryItems,
    lastHistoryMeta,
    activePortfolio,
    accountsData,
    assetData,
  ]);

  const isReplayFailed =
    stateError instanceof ApiError &&
    (stateError.statusCode === 422 || stateError.code === 'PORTFOLIO.REPLAY_FAILED');

  // Loading Skeleton State
  if (isPortfoliosLoading || isStateLoading) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Skeleton width="200px" height="24px" style={{ marginBottom: `${spacing.md}px` }} />
        <Skeleton width="320px" height="40px" style={{ marginBottom: `${spacing.lg}px` }} />
        <Card style={{ padding: `${spacing.xl}px`, marginBottom: `${spacing.xl}px` }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: `${spacing.lg}px`,
            }}
          >
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
          </div>
        </Card>
        <Card style={{ padding: `${spacing.xl}px` }}>
          <Skeleton width="100%" height="200px" />
        </Card>
      </div>
    );
  }

  // Error State: Replay Failure (422) or State Error
  if (isStateError) {
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
            title={
              isHistorical
                ? 'Não foi possível reconstruir a carteira nesta data'
                : 'Falha na leitura da carteira'
            }
            message={
              isReplayFailed
                ? isHistorical
                  ? 'O servidor não conseguiu reconstruir o estado histórico. Tente outra data ou volte para hoje.'
                  : 'O histórico de movimentações da carteira apresentou inconsistência de integridade. Corrija os registros ou tente novamente.'
                : stateError?.message || 'Ocorreu um erro ao carregar os dados desta posição.'
            }
            onRetry={() => refetchState()}
          />
        </Card>
      </div>
    );
  }

  // Not Open / 404 Position State.
  // In historical mode the same check runs against the historical snapshot:
  // an asset closed today but open then still renders (ADR-078 applied to
  // the historical state, never to the current one).
  if (!viewModel || !viewModel.isOpenPosition) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        {isHistorical && temporal.bannerLabel && (
          <PortfolioHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
        )}
        <Card
          style={{
            padding: `${spacing.xxl}px`,
            textAlign: 'center',
            backgroundColor: colors.surface,
            borderRadius: `${borderRadius.lg}px`,
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 8px 0',
            }}
          >
            {isHistorical && temporal.displayDate
              ? 'Este ativo não fazia parte da carteira nesta data.'
              : 'Esta posição não está aberta nesta carteira.'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: '0 0 24px 0' }}>
            {isHistorical && temporal.displayDate
              ? `O ativo selecionado não possuía quantidade positiva em custódia em ${temporal.displayDate}.`
              : 'O ativo selecionado não possui quantidade positiva em custódia na carteira informada.'}
          </p>
          <Link
            href={appendAsOf(
              `/portfolio${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`,
              temporal.asOf,
            )}
            style={{ textDecoration: 'none' }}
          >
            <Button variant="primary">Voltar para Carteira</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{ maxWidth: '1000px', margin: '0 auto', padding: `${spacing.xl}px ${spacing.base}px` }}
    >
      {isHistorical && temporal.bannerLabel && (
        <PortfolioHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
      )}
      {/* 1. Header with Breadcrumbs and Completeness Warning */}
      <AssetPositionHeader
        ticker={viewModel.header.ticker}
        name={viewModel.header.name}
        assetClassLabel={viewModel.header.assetClassLabel}
        portfolioId={viewModel.header.portfolioId}
        portfolioName={viewModel.header.portfolioName}
        isCostBasisIncomplete={viewModel.header.isCostBasisIncomplete}
        completenessBadgeLabel={viewModel.header.completenessBadgeLabel}
        asOf={temporal.asOf}
      />

      {/* AI Assistant CTA (Phase 3W) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: `${spacing.md}px` }}>
        <Link
          href={`/ai?portfolioId=${activePortfolioId}&assetId=${assetId}&symbol=${encodeURIComponent(viewModel.header.ticker)}`}
          style={{ textDecoration: 'none' }}
        >
          <Button variant="outline" size="sm">
            Perguntar à IA sobre {viewModel.header.ticker}
          </Button>
        </Link>
      </div>

      {/* 2. Primary Position Card (Quantity, Average Cost, Total Cost) */}
      <AssetPositionPrimaryCard
        quantity={viewModel.primaryCard.quantity}
        averageCost={viewModel.primaryCard.averageCost}
        totalCost={viewModel.primaryCard.totalCost}
        currency={viewModel.primaryCard.currency}
        totalCostLabel={viewModel.primaryCard.totalCostLabel}
        isCostBasisIncomplete={viewModel.primaryCard.isCostBasisIncomplete}
      />

      {/* 3. Custody Breakdown by Account (historical snapshot when asOf) */}
      <AssetCustodyBreakdown accounts={viewModel.accountsBreakdown} />

      {/* 3.5 Position Intelligence (valuation, weight, income, activity — current mode only).
          Valuation and allocation are current-mode concepts, like realized/income aggregates. */}
      {!isHistorical && activePortfolioId ? (
        <PositionIntelligenceSection portfolioId={activePortfolioId} assetId={assetId} />
      ) : null}

      {/* 4-5. Realized Results & Income (lifetime aggregates: current mode only).
          In historical mode they would mix lifetime totals with snapshot
          positions, so they stay hidden by design (no performance analysis). */}
      {!isHistorical && (
        <>
          {/* 4. Realized Results (Disposals) */}
          <AssetRealizedSection disposals={viewModel.realizedResults.disposals} />

          {/* 5. Income Received (Dividends, JCP, FII Income) */}
          <AssetIncomeSection events={viewModel.incomeReceived.events} />
        </>
      )}

      {/* 6. Paginated Reverse-Chronological History Feed (audit events, not a snapshot) */}
      <AssetHistorySection
        items={viewModel.history.items}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        loadMoreError={
          isHistoryError ? historyError?.message || 'Erro ao carregar mais eventos' : null
        }
      />
    </div>
  );
}

export default function AssetPositionDetailPage() {
  return (
    <React.Suspense
      fallback={<div style={{ padding: `${spacing.xl}px` }}>Carregando posição...</div>}
    >
      <AssetPositionDetailContent />
    </React.Suspense>
  );
}
