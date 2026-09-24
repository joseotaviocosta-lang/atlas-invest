import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import {
  mapToPortfolioOverviewViewModel,
  PortfolioStateDto,
  resolveTemporalContext,
  getTodayCivilDateString,
  stateQueryKey,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Card,
  Button,
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineBanner,
} from '../../../src/components/ui';
import {
  PortfolioCompletenessBanner,
  PortfolioSummaryCards,
  PositionCard,
  MobileDateSelector,
  MobileHistoricalBanner,
} from '../../../src/components/portfolio';
import { MobileValuationSection } from '../../../src/components/portfolio/MobileValuation';
import { portfoliosApi } from '../../../src/api/portfolios';
import { ApiError } from '../../../src/api/client';
import { PortfolioDto } from '../../../src/api/types';

export default function PortfolioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ asOf?: string }>();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

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

  const handleSelectDate = (value: string | null) => {
    if (!value) {
      clearAsOf();
      return;
    }
    const next = resolveTemporalContext({ rawAsOf: value, today });
    if (next.mode === 'HISTORICAL' && next.asOf) {
      router.setParams({ asOf: next.asOf });
      return;
    }
    if (next.error) {
      // Surface invalid/future input so the error renders.
      router.setParams({ asOf: value });
      return;
    }
    clearAsOf();
  };

  const handleSelectPortfolio = (id: string) => {
    setSelectedPortfolioId(id);
    // Never carry a historical snapshot across portfolios.
    if (params.asOf) {
      clearAsOf();
    }
  };

  // 1. Fetch Portfolios
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
    portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0] || null;

  // 2. Fetch State for Active Portfolio (current or historical server replay)
  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
    isRefetching: isRefetchingState,
  } = useQuery({
    queryKey: stateQueryKey(activePortfolio?.id || '', temporal.asOf),
    queryFn: async () => {
      if (!activePortfolio?.id) return null;
      const res = await portfoliosApi.getPortfolioState(
        activePortfolio.id,
        temporal.asOf ?? undefined,
      );
      return res.data as PortfolioStateDto;
    },
    enabled: Boolean(activePortfolio?.id),
  });

  // 3. Fetch Accounts for Name Resolution
  const { data: accountsData } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolio?.id],
    queryFn: async () => {
      if (!activePortfolio?.id) return [];
      try {
        const res = await portfoliosApi.listAccounts(activePortfolio.id);
        return res.data || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(activePortfolio?.id),
  });

  const isOffline =
    (portfoliosError instanceof ApiError && portfoliosError.isOffline) ||
    (stateError instanceof ApiError && stateError.isOffline);

  const isReplayFailed =
    stateError instanceof ApiError &&
    (stateError.statusCode === 422 || stateError.code === 'PORTFOLIO.REPLAY_FAILED');

  const onRefreshAll = async () => {
    await Promise.all([refetchPortfolios(), refetchState()]);
  };

  const isRefreshing = isRefetchingPortfolios || isRefetchingState;

  // Transform view model
  const viewModel =
    stateData && activePortfolio
      ? mapToPortfolioOverviewViewModel(
          stateData,
          {
            id: activePortfolio.id,
            name: activePortfolio.name,
            type: 'PERSONAL',
            baseCurrency: activePortfolio.baseCurrency,
          },
          accountsData || [],
        )
      : null;

  return (
    <Screen>
      <Header
        title="Carteira"
        subtitle="Posições e visão geral de ativos"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />

      {isOffline ? <OfflineBanner visible /> : null}

      <View style={styles.container}>
        {/* Loading Portfolios */}
        {isPortfoliosLoading ? (
          <LoadingState message="Carregando carteiras..." />
        ) : isPortfoliosError ? (
          <ErrorState
            message={portfoliosError?.message || 'Falha ao carregar suas carteiras.'}
            onRetry={() => refetchPortfolios()}
          />
        ) : portfolios.length === 0 ? (
          <EmptyState
            title="Nenhuma carteira cadastrada"
            description="Crie sua primeira carteira para começar a registrar movimentações e organizar seus investimentos."
            actionTitle="+ Nova Carteira"
            onAction={() => router.push('/(app)/create-portfolio')}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefreshAll}
                tintColor={themeTokens.colors.primary}
              />
            }
          >
            {/* Portfolio Selector Chips */}
            {portfolios.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectorContainer}
              >
                {portfolios.map((p) => {
                  const isSelected = p.id === activePortfolio?.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => handleSelectPortfolio(p.id)}
                      style={[styles.selectorChip, isSelected && styles.selectorChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Selecionar carteira ${p.name}`}
                    >
                      <Text
                        style={[
                          styles.selectorChipText,
                          isSelected && styles.selectorChipTextActive,
                        ]}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Active Portfolio Header Card */}
            {activePortfolio && (
              <Card style={styles.portfolioHeaderCard}>
                <View style={styles.headerTitleRow}>
                  <View>
                    <Text style={styles.carteiraLabel}>CARTEIRA ATIVA</Text>
                    <Text style={styles.carteiraName}>{activePortfolio.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{activePortfolio.status}</Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        padding: 8,
                        borderWidth: 1,
                        borderColor: themeTokens.colors.border,
                        borderRadius: 8,
                        minWidth: 44,
                        minHeight: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={() =>
                        router.push(
                          `/(app)/portfolio/performance?portfolioId=${activePortfolio.id}`,
                        )
                      }
                      accessibilityLabel="Ver performance"
                      accessibilityRole="button"
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600' }}>Performance</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyButton}
                      onPress={() =>
                        router.push(
                          `/(app)/portfolio/accounts?portfolioId=${activePortfolio.id}${temporal.asOf ? `&asOf=${temporal.asOf}` : ''}`,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Ver contas de custódia da carteira"
                    >
                      <Text style={styles.historyButtonText}>Contas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyButton}
                      onPress={() =>
                        router.push(
                          `/(app)/portfolio/history?portfolioId=${activePortfolio.id}${temporal.asOf ? `&asOf=${temporal.asOf}` : ''}`,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Ver histórico de atividades da carteira"
                    >
                      <Text style={styles.historyButtonText}>Histórico</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    Moeda: <Text style={styles.metaBold}>{activePortfolio.baseCurrency}</Text>
                  </Text>
                  {viewModel && (
                    <Text style={styles.metaText}>
                      Posições:{' '}
                      <Text style={styles.metaBold}>{viewModel.header.openPositionsCount}</Text>
                    </Text>
                  )}
                </View>
              </Card>
            )}

            {/* Portfolio Date Selector (Fase 2F time travel entry point) */}
            {activePortfolio && (
              <Card style={styles.dateSelectorCard}>
                <MobileDateSelector
                  value={temporal.asOf}
                  error={temporal.errorMessage}
                  onChange={handleSelectDate}
                />
              </Card>
            )}

            {/* Replay State Loading */}
            {isStateLoading && (
              <View style={styles.loadingContainer}>
                <LoadingState message="Reconstituindo posições da carteira..." />
              </View>
            )}

            {/* Replay Error State */}
            {!isStateLoading && isStateError && (
              <Card style={styles.errorCard}>
                <ErrorState
                  message={
                    isReplayFailed
                      ? isHistorical
                        ? 'Não foi possível reconstruir a carteira nesta data. Tente outra data ou volte para hoje.'
                        : 'Não foi possível reconstruir os dados desta carteira. Tente novamente ou revise o histórico de movimentações.'
                      : stateError?.message ||
                        'Ocorreu um erro ao carregar os dados desta carteira.'
                  }
                  onRetry={() => refetchState()}
                />
              </Card>
            )}

            {/* Populated Overview */}
            {!isStateLoading && !isStateError && viewModel && (
              <View>
                {/* Historical mode banner (persistent while asOf is active) */}
                {isHistorical && temporal.bannerLabel && (
                  <MobileHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
                )}

                {/* Incomplete Cost Basis Banner */}
                {viewModel.completenessNotice.hasIncompletePositions && (
                  <PortfolioCompletenessBanner message={viewModel.completenessNotice.message} />
                )}

                {/* Summary Cards */}
                <PortfolioSummaryCards
                  openPositionsCount={viewModel.summaryCards.openPositionsCount}
                  realizedResult={viewModel.summaryCards.realizedResult}
                  incomeReceived={viewModel.summaryCards.incomeReceived}
                />

                <MobileValuationSection
                  portfolioId={activePortfolio?.id ?? null}
                  isHistorical={isHistorical}
                />

                {/* Positions List Section */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    {isHistorical && temporal.headerSuffix
                      ? `Posições ${temporal.headerSuffix}`
                      : 'Posições em Aberto'}
                  </Text>
                  <Text style={styles.sectionBadge}>
                    {viewModel.positions.length}{' '}
                    {viewModel.positions.length === 1 ? 'ativo' : 'ativos'}
                  </Text>
                </View>

                {isHistorical && viewModel.positions.length === 0 ? (
                  <Card style={styles.emptyContainer}>
                    <EmptyState
                      title="Nenhuma posição nesta data"
                      description={`A carteira ainda não possuía posições em ${temporal.displayDate}.`}
                    />
                  </Card>
                ) : viewModel.stateIndicators.isEmptyPortfolio ? (
                  <Card style={styles.emptyContainer}>
                    <EmptyState
                      title="Sua carteira ainda está vazia"
                      description="Adicione movimentações para começar a acompanhar seus ativos e custos."
                    />
                  </Card>
                ) : viewModel.stateIndicators.hasCashFlowsOnly ? (
                  <Card style={styles.emptyContainer}>
                    <Text style={styles.cashFlowOnlyTitle}>Nenhuma posição de ativo aberta</Text>
                    <Text style={styles.cashFlowOnlyDesc}>
                      Esta carteira possui movimentações financeiras registradas, mas nenhuma
                      posição de ativo aberta no momento.
                    </Text>
                  </Card>
                ) : (
                  <View style={styles.positionsList}>
                    {viewModel.positions.map((pos) => (
                      <PositionCard
                        key={pos.assetId}
                        position={pos}
                        portfolioId={activePortfolio?.id}
                        asOf={temporal.asOf}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Add New Portfolio Action */}
            <View style={styles.footerAction}>
              <Button
                title="+ Nova Carteira"
                variant="secondary"
                onPress={() => router.push('/(app)/create-portfolio')}
              />
            </View>
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
  scrollContent: {
    padding: themeTokens.spacing.md,
    paddingBottom: themeTokens.spacing.xl * 2,
  },
  selectorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: themeTokens.spacing.md,
  },
  selectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: themeTokens.borderRadius.full,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    minHeight: 36,
  },
  selectorChipActive: {
    backgroundColor: themeTokens.colors.primary,
    borderColor: themeTokens.colors.primary,
  },
  selectorChipText: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    fontWeight: '500',
  },
  selectorChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  portfolioHeaderCard: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  dateSelectorCard: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  carteiraLabel: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  carteiraName: {
    fontSize: 20,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginTop: 2,
  },
  badge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: themeTokens.borderRadius.sm,
  },
  badgeText: {
    color: themeTokens.colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  historyButton: {
    backgroundColor: themeTokens.colors.surfaceElevated,
    borderColor: themeTokens.colors.border,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.sm,
    paddingHorizontal: themeTokens.spacing.sm,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: themeTokens.colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
  },
  metaBold: {
    color: themeTokens.colors.text,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: themeTokens.spacing.xl,
  },
  errorCard: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: themeTokens.spacing.sm,
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
  emptyContainer: {
    padding: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.md,
  },
  cashFlowOnlyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: themeTokens.colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  cashFlowOnlyDesc: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  positionsList: {
    marginBottom: themeTokens.spacing.md,
  },
  footerAction: {
    marginTop: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.xl,
  },
});
