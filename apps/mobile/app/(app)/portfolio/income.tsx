import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  themeTokens,
  colors,
  buildPortfolioIncomeViewModel,
  buildPortfolioActivityViewModel,
  PortfolioStateDto,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from '@atlas/ui';
import { Screen, LoadingState, ErrorState } from '../../../src/components/ui';
import {
  MobileHistoryFilters,
  MobileHistoryFilterState,
  MobileHistoryTimeline,
} from '../../../src/components/portfolio';
import { portfoliosApi } from '../../../src/api/portfolios';
import { PortfolioDto } from '../../../src/api/types';

export default function MobileIncomeScreen() {
  const router = useRouter();
  const { portfolioId: portfolioIdParam, accountId: accountIdParam } = useLocalSearchParams<{
    portfolioId?: string;
    accountId?: string;
  }>();

  const [filters, setFilters] = useState<MobileHistoryFilterState>({
    period: 'all',
    type: '',
    accountId: accountIdParam || '',
  });

  const { data: portfoliosData } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const portfolios: PortfolioDto[] = portfoliosData?.data ?? [];
  const activePortfolio: PortfolioDto | null =
    portfolios.find((p) => p.id === portfolioIdParam) || portfolios[0] || null;
  const activePortfolioId = activePortfolio?.id || '';

  const { data: stateData } = useQuery({
    queryKey: ['portfolio-state', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const res = await portfoliosApi.getPortfolioState(activePortfolioId);
      return res.data as PortfolioStateDto;
    },
    enabled: Boolean(activePortfolioId),
  });

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

  const stableFilterKey = useMemo(
    () => ({
      type: filters.type || undefined,
      from: undefined,
      to: undefined,
      accountId: filters.accountId || undefined,
    }),
    [filters.type, filters.accountId],
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
    isRefetching: isRefetchingHistory,
  } = useInfiniteQuery({
    queryKey: ['portfolio-income', activePortfolioId, stableFilterKey],
    queryFn: async ({ pageParam }) => {
      return portfoliosApi.getPortfolioHistory(activePortfolioId, {
        type: 'income',
        ...(filters.type ? { type: filters.type } : {}),
        limit: 25,
        cursor: pageParam,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage?.meta?.hasMore && lastPage.meta.nextCursor ? lastPage.meta.nextCursor : null,
    enabled: Boolean(activePortfolioId),
  });

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

  const incomeViewModel = useMemo(() => {
    return buildPortfolioIncomeViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name || 'Carteira',
      historyItems,
      pagination: lastMeta,
      incomeSummaries: stateData?.incomeSummaries ?? null,
      accountsMeta: accountsData ?? [],
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

  // Timeline groups come from the frozen activity mapper (5 kinds, exhaustive
  // narrowing, open-position navigation safety). Summary cards stay on the
  // server-summary income view model. No client-side financial math.
  const activityViewModel = useMemo(() => {
    return buildPortfolioActivityViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name || 'Carteira',
      historyItems,
      pagination: lastMeta,
      portfolioState: stateData ?? null,
      accountsMeta: accountsData ?? [],
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
    filters.period !== 'all' || Boolean(filters.type) || Boolean(filters.accountId);

  return (
    <Screen style={styles.screen}>
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
          Rendimentos
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
        {activePortfolio && (
          <View style={styles.contextBanner}>
            <Text style={styles.contextLabel}>CARTEIRA ATIVA</Text>
            <Text style={styles.contextName}>{activePortfolio.name}</Text>
          </View>
        )}

        {incomeViewModel.summaryCards.length > 0 && (
          <View style={styles.summaryContainer}>
            {incomeViewModel.summaryCards.map((card) => (
              <View key={card.currency} style={styles.summaryCard}>
                <Text style={styles.summaryCurrency}>{card.currency}</Text>
                <Text style={styles.summaryValue}>{card.formattedTotalIncome}</Text>
                <Text style={styles.summaryBreakdown}>
                  Div: {card.formattedDividends} • JCP: {card.formattedJcp} • FII:{' '}
                  {card.formattedFiiIncome}
                </Text>
              </View>
            ))}
          </View>
        )}

        <MobileHistoryFilters
          filters={filters}
          onChange={setFilters}
          accounts={accountsData || []}
        />

        {isHistoryLoading && !historyPages ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Carregando rendimentos..." />
          </View>
        ) : isHistoryError && !historyPages ? (
          <View style={styles.errorContainer}>
            <ErrorState
              message={(historyError as Error)?.message || 'Falha ao carregar rendimentos.'}
              onRetry={() => refetchHistory()}
            />
          </View>
        ) : null}

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
  screen: { flex: 1, backgroundColor: themeTokens.colors.background },
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
  backButton: { minHeight: 44, justifyContent: 'center', paddingRight: 8 },
  backButtonText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerRightPlaceholder: { width: 60 },
  scrollContent: { paddingBottom: themeTokens.spacing.xl },
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
  contextName: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  summaryContainer: {
    paddingHorizontal: themeTokens.spacing.md,
    marginTop: themeTokens.spacing.md,
    gap: themeTokens.spacing.sm,
  },
  summaryCard: {
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.borderRadius.lg,
    padding: themeTokens.spacing.md,
  },
  summaryCurrency: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  summaryValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  summaryBreakdown: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  loadingContainer: { paddingVertical: themeTokens.spacing.xl, alignItems: 'center' },
  errorContainer: { padding: themeTokens.spacing.md },
});
