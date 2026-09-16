import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
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
import { portfoliosApi } from '../../../src/api/portfolios';
import { ApiError } from '../../../src/api/client';
import { PortfolioDto } from '../../../src/api/types';

export default function PortfolioScreen() {
  const router = useRouter();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const portfolios = data?.data ?? [];
  const isOffline = error instanceof ApiError && error.isOffline;

  const renderPortfolioItem = ({ item }: { item: PortfolioDto }) => (
    <Card style={styles.portfolioCard}>
      <View style={styles.portfolioHeader}>
        <Text style={styles.portfolioName}>{item.name}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.status}</Text>
        </View>
      </View>

      {item.description ? (
        <Text style={styles.portfolioDescription}>{item.description}</Text>
      ) : null}

      <View style={styles.portfolioFooter}>
        <Text style={styles.currencyLabel}>
          Moeda Base: <Text style={styles.currencyValue}>{item.baseCurrency}</Text>
        </Text>
        <Text style={styles.dateLabel}>
          Criada em {new Date(item.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
    </Card>
  );

  return (
    <Screen>
      <Header
        title="Carteiras"
        subtitle="Gerenciamento patrimonial"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />

      {isOffline ? <OfflineBanner visible /> : null}

      <View style={styles.container}>
        {isLoading ? (
          <LoadingState message="Carregando carteiras..." />
        ) : isError ? (
          <ErrorState
            message={error?.message || 'Falha ao carregar suas carteiras.'}
            onRetry={() => refetch()}
          />
        ) : portfolios.length === 0 ? (
          <EmptyState
            title="Nenhuma carteira cadastrada"
            description="Crie sua primeira carteira para comecar a registrar suas transacoes e organizar seus investimentos."
            actionTitle="+ Nova Carteira"
            onAction={() => router.push('/(app)/create-portfolio')}
          />
        ) : (
          <FlatList
            data={portfolios}
            keyExtractor={(item) => item.id}
            renderItem={renderPortfolioItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={themeTokens.colors.primary}
              />
            }
            ListHeaderComponent={
              <View style={styles.headerActionRow}>
                <Text style={styles.listTitle}>
                  {portfolios.length}{' '}
                  {portfolios.length === 1 ? 'carteira encontrada' : 'carteiras encontradas'}
                </Text>
                <Button
                  title="+ Nova"
                  variant="secondary"
                  onPress={() => router.push('/(app)/create-portfolio')}
                  style={styles.addButton}
                />
              </View>
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: themeTokens.spacing.md,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: themeTokens.spacing.md,
  },
  listTitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    height: 36,
    paddingHorizontal: themeTokens.spacing.md,
  },
  portfolioCard: {
    marginBottom: themeTokens.spacing.md,
  },
  portfolioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  portfolioName: {
    color: themeTokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  badgeText: {
    color: themeTokens.colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  portfolioDescription: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  portfolioFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  currencyLabel: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
  },
  currencyValue: {
    color: themeTokens.colors.text,
    fontWeight: '600',
  },
  dateLabel: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
  },
});
