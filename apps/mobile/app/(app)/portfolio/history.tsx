import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  themeTokens,
  colors,
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from '@atlas/ui';
import { Screen, LoadingState, ErrorState } from '../../../src/components/ui';
import {
  MobileHistoryFilters,
  MobileHistoryTimeline,
  MobileHistoryFilterState,
} from '../../../src/components/portfolio';
import { portfoliosApi } from '../../../src/api/portfolios';
import { PortfolioDto } from '../../../src/api/types';

export default function MobilePortfolioHistoryScreen() {
  const router = useRouter();
  const { portfolioId: portfolioIdParam } = useLocalSearchParams<{ portfolioId?: string }>();

  // Filter State
  const [filters, setFilters] = useState<MobileHistoryFilterState>({
    period: 'all',
    type: '',
    accountId: '',
  });

  // Calculate from date if period is not 'all'
  const { fromDate, toDate } = useMemo(() => {
    if (filters.period === 'all') {
      return { fromDate: undefined, toDate: undefined };
    }
    const today = new Date();
    const toStr = today.toISOString().split('T')[0];
    let fromStr: string | undefined;

    if (filters.period === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      fromStr = d.toISOString().split('T')[0];
    } else if (filters.period === '90d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      fromStr = d.toISOString().split('T')[0];
    } else if (filters.period === 'year') {
      fromStr = `${today.getFullYear()}-01-01`;
    }

    return { fromDate: fromStr, toDate: toStr };
  }, [filters.period]);

  // 1. Fetch Portfolios
  const { data: portfoliosData, isLoading: isPortfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const portfolios: PortfolioDto[] = portfoliosData?.data ?? [];
  const activePortfolio: PortfolioDto | null =
    portfolios.find((p) => p.id === portfolioIdParam) || portfolios[0] || null;
  const activePortfolioId = activePortfolio?.id || '';

  // 2. Fetch State for Active Portfolio (for open position check)
  const { data: stateData } = useQuery({
    queryKey: ['portfolio-state', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const res = await portfoliosApi.getPortfolioState(activePortfolioId);
      return res.data as PortfolioStateDto;
    },
    enabled: Boolean(activePortfolioId),
  });

  // 3. Fetch Accounts
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

  const accounts = accountsData || [];

  // 4. Stable filter object for query key
  const stableFilterKey = useMemo(
    () => ({
      type: filters.type || undefined,
      from: fromDate,
      to: toDate,
      accountId: filters.accountId || undefined,
    }),
    [filters.type, fromDate, toDate, filters.accountId],
  );

  // 5. Fetch Paginated History
  const {
    data: historyPages,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = useInfiniteQuery({
    queryKey: ['portfolio-history', activePortfolioId, stableFilterKey],
    queryFn: async ({ pageParam }) => {
      const res = await portfoliosApi.getPortfolioHistory(activePortfolioId, {
        type: filters.type || undefined,
        from: fromDate,
        to: toDate,
        accountId: filters.accountId || undefined,
        limit: 25,
        cursor: pageParam,
      });
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
  });

  // Aggregate loaded pages
  const historyItems: PortfolioHistoryItemDto[] = useMemo(() => {
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
      accountsMeta: accounts,
      assetsMeta: assetsMetaMap,
    });
  }, [
    activePortfolioId,
    activePortfolio?.name,
    historyItems,
    lastMeta,
    stateData,
    accounts,
    assetsMetaMap,
  ]);

  const hasActiveFilters =
    filters.period !== 'all' || Boolean(filters.type) || Boolean(filters.accountId);

  return (
    <Screen style={styles.screen}>
      {/* Sticky Native Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a carteira"
        >
          <Text style={styles.backButtonText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Histórico da Carteira
        </Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingHistory}
            onRefresh={() => refetchHistory()}
            tintColor={colors.accent}
          />
        }
      >
        {/* Active Portfolio Context Banner */}
        <View style={styles.contextBanner}>
          <Text style={styles.contextLabel}>CARTEIRA ATIVA</Text>
          <Text style={styles.contextName}>{activePortfolio?.name ?? 'Minha Carteira'}</Text>
        </View>

        {/* Filter Chips Bar */}
        <MobileHistoryFilters filters={filters} onChange={setFilters} accounts={accounts} />

        {/* Loading State */}
        {(isPortfoliosLoading || (isHistoryLoading && !historyPages)) && (
          <View style={styles.loadingContainer}>
            <LoadingState message="Carregando histórico de atividades..." />
          </View>
        )}

        {/* Error State */}
        {isHistoryError && !historyPages && (
          <View style={styles.errorContainer}>
            <ErrorState
              message={
                (historyError as Error)?.message ||
                'Ocorreu um erro ao carregar as atividades desta carteira.'
              }
              onRetry={() => refetchHistory()}
            />
          </View>
        )}

        {/* Populated Timeline */}
        {!isHistoryLoading && !isHistoryError && (
          <MobileHistoryTimeline
            portfolioId={activePortfolioId}
            groups={activityViewModel.groups}
            hasNextPage={Boolean(hasNextPage)}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            loadMoreError={isHistoryError ? (historyError as Error)?.message : null}
            hasActiveFilters={hasActiveFilters}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: themeTokens.spacing.md,
    paddingTop: themeTokens.spacing.lg,
    paddingBottom: themeTokens.spacing.sm,
    backgroundColor: themeTokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerRightPlaceholder: {
    width: 60,
  },
  scrollContent: {
    paddingBottom: themeTokens.spacing.xl,
  },
  contextBanner: {
    paddingHorizontal: themeTokens.spacing.md,
    paddingTop: themeTokens.spacing.md,
    paddingBottom: 4,
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  contextName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: themeTokens.spacing.xl,
    alignItems: 'center',
  },
  errorContainer: {
    padding: themeTokens.spacing.md,
  },
});
