import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  themeTokens,
  mapToAssetPositionDetailViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  AssetMeta,
  resolveTemporalContext,
  getTodayCivilDateString,
  assetStateQueryKey,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Button,
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineBanner,
} from '../../../src/components/ui';
import {
  MobileAssetHeader,
  MobilePrimaryCard,
  MobileCustodyBreakdown,
  MobileRealizedSection,
  MobileIncomeSection,
  MobileHistorySection,
  MobileHistoricalBanner,
  MobilePositionIntelligenceSection,
  MobilePositionPerformanceSection,
  MobilePositionIncomeSection,
} from '../../../src/components/portfolio';
import { portfoliosApi } from '../../../src/api/portfolios';
import { ApiError } from '../../../src/api/client';
import { PortfolioDto } from '../../../src/api/types';

export default function MobileAssetDetailPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ assetId: string; portfolioId?: string; asOf?: string }>();
  const assetId = params.assetId || '';
  const portfolioIdParam = params.portfolioId;

  // Temporal context (Fase 2F): historical snapshots come from server replay.
  const today = useMemo(() => getTodayCivilDateString(), []);
  const temporal = useMemo(
    () => resolveTemporalContext({ rawAsOf: params.asOf, today }),
    [params.asOf, today],
  );
  const isHistorical = temporal.mode === 'HISTORICAL';

  const clearAsOf = () => {
    router.setParams({ asOf: undefined });
  };

  // 1. Fetch user portfolios to resolve portfolio context
  const { data: portfoliosData, isLoading: isPortfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const portfolios: PortfolioDto[] = portfoliosData?.data || [];
  const activePortfolioId = portfolioIdParam || portfolios[0]?.id || '';
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;

  // 2. Fetch portfolio state
  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
    isRefetching: isRefetchingState,
  } = useQuery({
    queryKey: assetStateQueryKey(activePortfolioId, assetId, temporal.asOf),
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const res = await portfoliosApi.getPortfolioState(
        activePortfolioId,
        temporal.asOf ?? undefined,
      );
      return res.data as PortfolioStateDto;
    },
    enabled: Boolean(activePortfolioId),
  });

  // 3. Fetch portfolio account metadata
  const { data: accountsData } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return [];
      try {
        const res = await portfoliosApi.listAccounts(activePortfolioId);
        return res.data || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(activePortfolioId),
  });

  // 4. Fetch asset metadata
  const { data: assetData } = useQuery({
    queryKey: ['asset-metadata', assetId],
    queryFn: async () => {
      if (!assetId) return null;
      try {
        const res = await portfoliosApi.getAsset(assetId);
        return res.data as AssetMeta;
      } catch {
        return null;
      }
    },
    enabled: Boolean(assetId),
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
    refetch: refetchHistory,
  } = useInfiniteQuery({
    queryKey: ['portfolio-history', activePortfolioId, assetId],
    queryFn: async ({ pageParam }) => {
      return portfoliosApi.getPortfolioHistory(activePortfolioId, {
        assetId,
        limit: 20,
        cursor: pageParam,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.meta?.nextCursor ?? undefined,
    enabled: Boolean(activePortfolioId && assetId),
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

  const lastPageMeta = historyPages?.pages?.[historyPages.pages.length - 1]?.meta;

  // Build ViewModel
  const viewModel = useMemo(() => {
    if (!stateData) return null;

    const portfolioContext = activePortfolio
      ? {
          id: activePortfolio.id,
          name: activePortfolio.name,
          type: 'PERSONAL' as const,
          baseCurrency: activePortfolio.baseCurrency,
        }
      : null;

    return mapToAssetPositionDetailViewModel({
      assetId,
      state: stateData,
      historyItems: allHistoryItems,
      historyMeta: lastPageMeta,
      portfolioMeta: portfolioContext,
      accountsMeta: accountsData ?? [],
      assetMeta: assetData ?? null,
    });
  }, [
    assetId,
    stateData,
    allHistoryItems,
    lastPageMeta,
    hasNextPage,
    assetData,
    activePortfolio,
    accountsData,
  ]);

  const isOffline =
    (stateError instanceof ApiError && stateError.isOffline) ||
    (historyError instanceof ApiError && historyError.isOffline);

  const onRefreshAll = async () => {
    await Promise.all([refetchState(), refetchHistory()]);
  };

  const isLoading = isPortfoliosLoading || (isStateLoading && !stateData);

  return (
    <Screen>
      <Header
        title={viewModel?.header.ticker || 'Detalhes do Ativo'}
        subtitle="Posição e Histórico"
        onBack={() => router.back()}
      />

      {isOffline ? <OfflineBanner visible /> : null}

      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <LoadingState message="Carregando detalhes do ativo..." />
          </View>
        ) : isStateError ? (
          <View style={styles.centerContainer}>
            <ErrorState
              message={
                stateError instanceof ApiError &&
                (stateError.statusCode === 422 || stateError.code === 'PORTFOLIO.REPLAY_FAILED')
                  ? isHistorical
                    ? 'Não foi possível reconstruir a carteira nesta data. Tente outra data ou volte para hoje.'
                    : 'Falha ao carregar posição do ativo.'
                  : stateError?.message || 'Falha ao carregar posição do ativo.'
              }
              onRetry={() => refetchState()}
            />
          </View>
        ) : !viewModel ? (
          <View style={styles.centerContainer}>
            <EmptyState
              title="Ativo não encontrado"
              description="Não encontramos registros desta posição na carteira selecionada."
              actionTitle="Voltar para a Carteira"
              onAction={() => router.back()}
            />
          </View>
        ) : isHistorical && !viewModel.isOpenPosition ? (
          <View style={styles.centerContainer}>
            {temporal.bannerLabel && (
              <MobileHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
            )}
            <EmptyState
              title="Este ativo não fazia parte da carteira nesta data"
              description={
                temporal.displayDate
                  ? `O ativo selecionado não possuía quantidade positiva em custódia em ${temporal.displayDate}.`
                  : 'O ativo selecionado não possuía quantidade positiva em custódia nesta data.'
              }
              actionTitle="Voltar"
              onAction={() => router.back()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetchingState}
                onRefresh={onRefreshAll}
                tintColor={themeTokens.colors.primary}
              />
            }
          >
            {isHistorical && temporal.bannerLabel && (
              <MobileHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
            )}

            {/* Header / Identity Card */}
            <MobileAssetHeader
              ticker={viewModel.header.ticker}
              name={viewModel.header.name}
              assetClassLabel={viewModel.header.assetClassLabel}
              portfolioName={viewModel.header.portfolioName}
              isCostBasisIncomplete={viewModel.header.isCostBasisIncomplete}
              completenessBadgeLabel={viewModel.header.completenessBadgeLabel}
              isOpen={viewModel.primaryCard.rawQuantity !== '0'}
            />

            {/* AI Assistant CTA (Phase 3W) */}
            <Button
              title={`Perguntar à IA sobre ${viewModel.header.ticker}`}
              variant="secondary"
              onPress={() => {
                router.push({
                  pathname: '/(app)/(tabs)/ai',
                  params: {
                    portfolioId: activePortfolioId,
                    assetId,
                    symbol: viewModel.header.ticker,
                  },
                });
              }}
              style={{ marginVertical: themeTokens.spacing.sm }}
            />

            {/* Primary Position Card */}
            <MobilePrimaryCard
              quantity={viewModel.primaryCard.quantity}
              averageCost={viewModel.primaryCard.averageCost}
              totalCost={viewModel.primaryCard.totalCost}
              isIncomplete={viewModel.primaryCard.isCostBasisIncomplete}
              incompleteMessage={
                viewModel.primaryCard.isCostBasisIncomplete
                  ? 'Esta posição possui histórico de custo incompleto devido a movimentações de entrada sem preço base precificado.'
                  : null
              }
            />

            {/* Custody Breakdown by Account (historical snapshot when asOf) */}
            <MobileCustodyBreakdown accounts={viewModel.accountsBreakdown} />

            {/* Position Intelligence (valuation, weight, income, activity — current mode only) */}
            {!isHistorical && activePortfolioId ? (
              <MobilePositionIntelligenceSection
                portfolioId={activePortfolioId}
                assetId={assetId}
              />
            ) : null}

            {/* Position Performance (TWR, components, attribution — current mode only, lazy) */}
            {!isHistorical && activePortfolioId ? (
              <MobilePositionPerformanceSection portfolioId={activePortfolioId} assetId={assetId} />
            ) : null}

            {/* Position Income (historical income over the current lifecycle — current mode only) */}
            {!isHistorical && activePortfolioId ? (
              <MobilePositionIncomeSection portfolioId={activePortfolioId} assetId={assetId} />
            ) : null}

            {/* Realized & Income are lifetime aggregates: current mode only.
                In historical mode they would mix lifetime totals with snapshot
                positions, so they stay hidden by design. */}
            {!isHistorical && (
              <>
                {/* Realized Sales Outcomes */}
                <MobileRealizedSection disposals={viewModel.realizedResults.disposals} />

                {/* Income Received */}
                <MobileIncomeSection events={viewModel.incomeReceived.events} />
              </>
            )}

            {/* Paginated History */}
            <MobileHistorySection
              items={viewModel.history.items}
              hasNextPage={Boolean(hasNextPage)}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              loadMoreError={
                isHistoryError ? historyError?.message || 'Erro ao carregar mais' : null
              }
            />
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    padding: themeTokens.spacing.md,
    justifyContent: 'center',
  },
  scrollContent: {
    padding: themeTokens.spacing.md,
    paddingBottom: themeTokens.spacing.xl * 2,
  },
});
