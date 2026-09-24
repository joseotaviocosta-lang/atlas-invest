import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  colors,
  buildAccountDetailViewModel,
  PortfolioStateDto,
  resolveTemporalContext,
  getTodayCivilDateString,
  accountStateQueryKey,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Card,
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineBanner,
} from '../../../../src/components/ui';
import { MobileHistoricalBanner } from '../../../../src/components/portfolio';
import { portfoliosApi } from '../../../../src/api/portfolios';
import { ApiError } from '../../../../src/api/client';
import { PortfolioDto } from '../../../../src/api/types';

export default function MobileAccountDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountId: string; portfolioId?: string; asOf?: string }>();
  const accountId = params.accountId;
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

  const {
    data: portfoliosData,
    isLoading: isPortfoliosLoading,
    isError: isPortfoliosError,
    error: portfoliosError,
    refetch: refetchPortfolios,
    isRefetching: isRefetchingPortfolios,
  } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const portfolios: PortfolioDto[] = portfoliosData?.data ?? [];
  const activePortfolio: PortfolioDto | null =
    portfolios.find((p) => p.id === portfolioIdParam) || portfolios[0] || null;
  const activePortfolioId = activePortfolio?.id || '';

  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
    isRefetching: isRefetchingState,
  } = useQuery({
    queryKey: accountStateQueryKey(activePortfolioId, accountId ?? '', temporal.asOf),
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

  const { data: institutionsData } = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => {
      try {
        const res = await portfoliosApi.listInstitutions();
        return res.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const { data: assetsData } = useQuery({
    queryKey: ['assets-catalog'],
    queryFn: async () => {
      try {
        const res = await portfoliosApi.listAssets();
        return res.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const detailViewModel = useMemo(() => {
    if (!stateData || !accountId) return null;
    return buildAccountDetailViewModel({
      portfolioId: activePortfolioId,
      accountId,
      state: stateData,
      accountsMeta: accountsData ?? [],
      institutionsMeta: institutionsData ?? [],
      assetsMeta: assetsData ?? [],
    });
  }, [stateData, accountId, activePortfolioId, accountsData, institutionsData, assetsData]);

  const isOffline =
    (portfoliosError instanceof ApiError && portfoliosError.isOffline) ||
    (stateError instanceof ApiError && stateError.isOffline);

  const onRefresh = async () => {
    await Promise.all([refetchPortfolios(), refetchState()]);
  };
  const isRefreshing = isRefetchingPortfolios || isRefetchingState;

  const goToFiltered = (screen: 'history' | 'income' | 'cash-flow') => {
    router.push(
      `/(app)/portfolio/${screen}?portfolioId=${activePortfolioId}&accountId=${accountId}${temporal.asOf ? `&asOf=${temporal.asOf}` : ''}`,
    );
  };

  return (
    <Screen>
      <Header
        title="Detalhes da Conta"
        subtitle="Posições em custódia"
        onBack={() => router.back()}
      />
      {isOffline ? <OfflineBanner visible /> : null}

      {isHistorical && temporal.bannerLabel && (
        <View style={styles.bannerWrap}>
          <MobileHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
        </View>
      )}

      {isPortfoliosLoading || (isStateLoading && !stateData) ? (
        <LoadingState message="Carregando conta..." />
      ) : isPortfoliosError && portfolios.length === 0 ? (
        <ErrorState
          message={(portfoliosError as Error)?.message || 'Falha ao carregar carteiras.'}
          onRetry={() => refetchPortfolios()}
        />
      ) : isStateError && !stateData ? (
        <ErrorState
          message={(stateError as Error)?.message || 'Falha ao carregar conta.'}
          onRetry={() => refetchState()}
        />
      ) : detailViewModel && !detailViewModel.found ? (
        <Card style={styles.emptyContainer}>
          <EmptyState
            title="Conta não encontrada"
            description="Esta conta não pertence à carteira selecionada ou não existe mais."
          />
        </Card>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={themeTokens.colors.primary}
            />
          }
        >
          <Card style={styles.headerCard}>
            <Text style={styles.accountName} numberOfLines={1}>
              {detailViewModel?.accountName ?? 'Conta'}
            </Text>
            <Text style={styles.institutionName} numberOfLines={1}>
              {detailViewModel?.institutionName ?? 'Instituição não informada'}
              {detailViewModel?.currency ? ` • ${detailViewModel.currency}` : ''}
              {detailViewModel?.statusLabel ? ` • ${detailViewModel.statusLabel}` : ''}
            </Text>
            {detailViewModel?.hasIncompleteCost && (
              <View style={styles.warningBadge}>
                <Text style={styles.warningBadgeText}>Custo incompleto</Text>
              </View>
            )}
          </Card>

          <View style={styles.linksRow}>
            {(['history', 'income', 'cash-flow'] as const).map((screen) => (
              <TouchableOpacity
                key={screen}
                style={styles.linkButton}
                onPress={() => goToFiltered(screen)}
                accessibilityRole="button"
                accessibilityLabel={
                  screen === 'history'
                    ? 'Ver histórico desta conta'
                    : screen === 'income'
                      ? 'Ver rendimentos desta conta'
                      : 'Ver fluxos desta conta'
                }
              >
                <Text style={styles.linkButtonText}>
                  {screen === 'history'
                    ? 'Histórico'
                    : screen === 'income'
                      ? 'Rendimentos'
                      : 'Fluxos'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {detailViewModel?.isEmpty ? (
            <Card style={styles.emptyContainer}>
              <EmptyState
                title={isHistorical ? 'Nenhuma posição nesta data' : 'Nenhuma posição aberta'}
                description={
                  isHistorical && temporal.displayDate
                    ? `Esta conta não possuía posições abertas em ${temporal.displayDate}. Isso não significa que a conta seja inválida.`
                    : 'Esta conta não possui posições de ativos em custódia no momento.'
                }
              />
            </Card>
          ) : (
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Posições em Custódia</Text>
                <Text style={styles.sectionBadge}>
                  {detailViewModel?.openPositionsCount}{' '}
                  {detailViewModel?.openPositionsCount === 1 ? 'ativo' : 'ativos'}
                </Text>
              </View>
              {detailViewModel?.positions.map((pos) => (
                <Card key={pos.assetId} style={styles.positionCard}>
                  <View style={styles.positionTopRow}>
                    <View style={styles.positionIdentity}>
                      {pos.canNavigateToAsset ? (
                        <TouchableOpacity
                          style={styles.assetLinkTouchTarget}
                          onPress={() =>
                            router.push(
                              `/(app)/portfolio/${pos.assetId}?portfolioId=${activePortfolioId}${temporal.asOf ? `&asOf=${temporal.asOf}` : ''}`,
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Ver detalhes da posição de ${pos.assetTicker}`}
                        >
                          <Text style={styles.assetTickerLink}>{pos.assetTicker}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.assetTicker}>{pos.assetTicker}</Text>
                      )}
                      {pos.assetName && pos.assetName !== pos.assetTicker && (
                        <Text style={styles.assetName} numberOfLines={1}>
                          {pos.assetName}
                        </Text>
                      )}
                      {pos.isCostBasisIncomplete && (
                        <View style={styles.warningBadge}>
                          <Text style={styles.warningBadgeText}>Custo incompleto</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.positionValues}>
                      <Text style={styles.quantityText}>Qtd: {pos.quantity}</Text>
                      <Text
                        style={[
                          styles.costText,
                          pos.isCostBasisIncomplete && styles.costIncompleteText,
                        ]}
                      >
                        PM: {pos.averageCost}
                      </Text>
                      <Text
                        style={[
                          styles.costText,
                          styles.costBold,
                          pos.isCostBasisIncomplete && styles.costIncompleteText,
                        ]}
                      >
                        Total: {pos.totalCost}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    paddingHorizontal: themeTokens.spacing.md,
    paddingTop: themeTokens.spacing.sm,
  },
  scrollContent: {
    padding: themeTokens.spacing.md,
    paddingBottom: themeTokens.spacing.xl * 2,
  },
  emptyContainer: {
    padding: themeTokens.spacing.md,
    margin: themeTokens.spacing.md,
  },
  headerCard: {
    padding: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.sm,
  },
  accountName: {
    fontSize: 20,
    fontWeight: '800',
    color: themeTokens.colors.text,
  },
  institutionName: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  warningBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  warningBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
  linksRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: themeTokens.spacing.md,
  },
  linkButton: {
    flex: 1,
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.border,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: themeTokens.colors.primary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: themeTokens.spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  sectionBadge: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    fontWeight: '500',
  },
  positionCard: {
    padding: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.sm,
  },
  positionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  positionIdentity: {
    flex: 1,
    minWidth: 0,
  },
  assetLinkTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  assetTickerLink: {
    fontSize: 15,
    fontWeight: '700',
    color: themeTokens.colors.primary,
  },
  assetTicker: {
    fontSize: 15,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  assetName: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
  },
  positionValues: {
    alignItems: 'flex-end',
  },
  quantityText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  costText: {
    fontSize: 12,
    color: themeTokens.colors.text,
    marginTop: 2,
  },
  costBold: {
    fontWeight: '700',
  },
  costIncompleteText: {
    color: themeTokens.colors.textMuted,
  },
});
