import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  colors,
  buildPortfolioAccountsViewModel,
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
} from '../../../src/components/ui';
import { MobileHistoricalBanner } from '../../../src/components/portfolio';
import { portfoliosApi } from '../../../src/api/portfolios';
import { ApiError } from '../../../src/api/client';
import { PortfolioDto } from '../../../src/api/types';

export default function MobileAccountsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ portfolioId?: string; asOf?: string }>();
  const portfolioIdParam = params.portfolioId;

  // Temporal context (Fase 2F): directory listing stays current, while
  // position counts derive from the historical snapshot when `asOf` is set.
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
    queryKey: accountStateQueryKey(activePortfolioId, 'overview', temporal.asOf),
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

  const accountsViewModel = useMemo(() => {
    if (!stateData) return null;
    return buildPortfolioAccountsViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name,
      state: stateData,
      accountsMeta: accountsData ?? [],
      institutionsMeta: institutionsData ?? [],
    });
  }, [stateData, activePortfolioId, activePortfolio?.name, accountsData, institutionsData]);

  const isOffline =
    (portfoliosError instanceof ApiError && portfoliosError.isOffline) ||
    (stateError instanceof ApiError && stateError.isOffline);

  const onRefresh = async () => {
    await Promise.all([refetchPortfolios(), refetchState()]);
  };
  const isRefreshing = isRefetchingPortfolios || isRefetchingState;

  return (
    <Screen>
      <Header
        title="Contas"
        subtitle="Contas de custódia da carteira"
        onBack={() => router.back()}
      />
      {isOffline ? <OfflineBanner visible /> : null}

      {isPortfoliosLoading || (isStateLoading && !stateData) ? (
        <LoadingState message="Carregando contas..." />
      ) : isPortfoliosError && portfolios.length === 0 ? (
        <ErrorState
          message={(portfoliosError as Error)?.message || 'Falha ao carregar carteiras.'}
          onRetry={() => refetchPortfolios()}
        />
      ) : isStateError && !stateData ? (
        <ErrorState
          message={(stateError as Error)?.message || 'Falha ao carregar contas.'}
          onRetry={() => refetchState()}
        />
      ) : !accountsViewModel || accountsViewModel.isEmpty ? (
        <Card style={styles.emptyContainer}>
          <EmptyState
            title="Nenhuma conta cadastrada"
            description="Cadastre uma conta em uma corretora ou instituição para organizar a custódia dos seus ativos."
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
          {isHistorical && temporal.bannerLabel && (
            <MobileHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
          )}

          {activePortfolio && (
            <View style={styles.contextBanner}>
              <Text style={styles.contextLabel}>CARTEIRA ATIVA</Text>
              <Text style={styles.contextName}>{activePortfolio.name}</Text>
            </View>
          )}

          {accountsViewModel.accounts.map((account) => (
            <Card key={account.accountId} style={styles.accountCard}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIdentity}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {account.accountName}
                  </Text>
                  <Text style={styles.institutionName} numberOfLines={1}>
                    {account.institutionName ?? 'Instituição não informada'}
                    {account.currency ? ` • ${account.currency}` : ''}
                    {account.statusLabel ? ` • ${account.statusLabel}` : ''}
                  </Text>
                  <Text style={styles.positionsLine}>
                    {account.isEmpty
                      ? 'Nenhuma posição aberta'
                      : `${account.openPositionsCount} ${account.openPositionsCount === 1 ? 'posição aberta' : 'posições abertas'}`}
                  </Text>
                </View>
                <View style={styles.cardSide}>
                  {account.hasIncompleteCost && (
                    <View style={styles.warningBadge}>
                      <Text style={styles.warningBadgeText}>Custo incompleto</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() =>
                      router.push(
                        `/(app)/portfolio/accounts/${account.accountId}?portfolioId=${activePortfolioId}${temporal.asOf ? `&asOf=${temporal.asOf}` : ''}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ver detalhes da conta ${account.accountName}`}
                  >
                    <Text style={styles.detailsButtonText}>Ver detalhes →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: themeTokens.spacing.md,
    paddingBottom: themeTokens.spacing.xl * 2,
  },
  contextBanner: {
    paddingHorizontal: themeTokens.spacing.md,
    paddingTop: themeTokens.spacing.md,
    paddingBottom: 4,
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: themeTokens.colors.textMuted,
    letterSpacing: 0.5,
  },
  contextName: {
    fontSize: 18,
    fontWeight: '800',
    color: themeTokens.colors.text,
    marginTop: 2,
  },
  emptyContainer: {
    padding: themeTokens.spacing.md,
    margin: themeTokens.spacing.md,
  },
  accountCard: {
    padding: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardIdentity: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  institutionName: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  positionsLine: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    marginTop: 6,
  },
  cardSide: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  warningBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  warningBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
  detailsButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  detailsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.primary,
  },
});
