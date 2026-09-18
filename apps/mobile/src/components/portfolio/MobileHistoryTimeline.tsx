import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  themeTokens,
  colors,
  PortfolioActivityGroupViewModel,
  PortfolioActivityItemViewModel,
  ActivityBadgeVariant,
} from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobileHistoryTimelineProps {
  portfolioId: string;
  groups: readonly PortfolioActivityGroupViewModel[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  loadMoreError?: string | null;
  hasActiveFilters?: boolean;
}

export function MobileHistoryTimeline({
  portfolioId,
  groups,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  loadMoreError,
  hasActiveFilters = false,
}: MobileHistoryTimelineProps) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>
          {hasActiveFilters
            ? 'Nenhum evento encontrado para estes filtros.'
            : 'Nenhuma atividade encontrada.'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {hasActiveFilters
            ? 'Tente ajustar ou limpar os filtros para ver outras movimentações.'
            : 'As movimentações e eventos da sua carteira aparecerão aqui em ordem cronológica.'}
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.date} style={styles.dateGroup}>
          {/* Date Group Header */}
          <View style={styles.dateHeaderRow}>
            <Text style={styles.dateHeaderText}>{group.formattedDate}</Text>
            <View style={styles.dateHeaderLine} />
          </View>

          {/* Group Event Cards */}
          <View style={styles.cardsList}>
            {group.items.map((item) => (
              <MobileTimelineEventCard
                key={item.id}
                item={item}
                portfolioId={portfolioId}
                onPressAsset={() => {
                  if (item.canNavigateToAsset && item.assetId) {
                    router.push(
                      `/(app)/portfolio/${item.assetId}?portfolioId=${portfolioId}`,
                    );
                  }
                }}
              />
            ))}
          </View>
        </View>
      ))}

      {/* Keyset Cursor Pagination / Load More */}
      {hasNextPage && (
        <View style={styles.paginationContainer}>
          {loadMoreError && (
            <Text style={styles.errorText}>
              Não foi possível carregar mais eventos. Toque para tentar novamente.
            </Text>
          )}
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={onLoadMore}
            disabled={isFetchingNextPage}
            accessibilityRole="button"
            accessibilityLabel="Carregar mais eventos do histórico"
          >
            {isFetchingNextPage ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.loadMoreButtonText}>Carregar mais</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface MobileTimelineEventCardProps {
  item: PortfolioActivityItemViewModel;
  portfolioId: string;
  onPressAsset: () => void;
}

function MobileTimelineEventCard({
  item,
  onPressAsset,
}: MobileTimelineEventCardProps) {
  const isNegative = item.badgeVariant === 'negative';
  const isPositive = item.badgeVariant === 'positive';
  const amountColor = isNegative
    ? colors.negative
    : isPositive
      ? colors.positive
      : colors.textPrimary;

  return (
    <Card style={styles.eventCard}>
      {/* Top Row: Kind Badge & Status */}
      <View style={styles.cardHeaderRow}>
        <View style={[styles.badge, getBadgeStyle(item.badgeVariant)]}>
          <Text style={[styles.badgeText, getBadgeTextStyle(item.badgeVariant)]}>
            {item.kindLabel}
          </Text>
        </View>

        {item.statusBadgeLabel && (
          <View style={styles.warningBadge}>
            <Text style={styles.warningBadgeText}>{item.statusBadgeLabel}</Text>
          </View>
        )}
      </View>

      {/* Main Info Row */}
      <View style={styles.cardBodyRow}>
        {/* Left: Asset / Account / Secondary */}
        <View style={styles.leftColumn}>
          {item.assetTicker && (
            item.canNavigateToAsset ? (
              <TouchableOpacity
                onPress={onPressAsset}
                style={styles.assetLinkTouchTarget}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalhes da posição de ${item.assetTicker}`}
              >
                <Text style={styles.assetTickerLink}>{item.assetTicker}</Text>
                {item.assetName && item.assetName !== item.assetTicker && (
                  <Text style={styles.assetName} numberOfLines={1}>
                    {item.assetName}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.assetNonLinkContainer}>
                <Text style={styles.assetTicker}>{item.assetTicker}</Text>
                {item.assetName && item.assetName !== item.assetTicker && (
                  <Text style={styles.assetName} numberOfLines={1}>
                    {item.assetName}
                  </Text>
                )}
              </View>
            )
          )}

          <Text style={styles.accountText}>{item.accountName}</Text>

          {item.secondaryContext && (
            <Text style={styles.secondaryContextText}>{item.secondaryContext}</Text>
          )}
        </View>

        {/* Right: Amount & Quantity */}
        <View style={styles.rightColumn}>
          {item.amount && (
            <Text style={[styles.amountText, { color: amountColor }]}>{item.amount}</Text>
          )}
          {item.quantity && (
            <Text style={styles.quantityText}>Qtd: {item.quantity}</Text>
          )}
        </View>
      </View>
    </Card>
  );
}

function getBadgeStyle(variant: ActivityBadgeVariant) {
  switch (variant) {
    case 'positive':
      return styles.badgePositive;
    case 'negative':
      return styles.badgeNegative;
    case 'warning':
      return styles.badgeWarning;
    case 'info':
      return styles.badgeInfo;
    case 'neutral':
    default:
      return styles.badgeNeutral;
  }
}

function getBadgeTextStyle(variant: ActivityBadgeVariant) {
  switch (variant) {
    case 'positive':
      return styles.badgeTextPositive;
    case 'negative':
      return styles.badgeTextNegative;
    case 'warning':
      return styles.badgeTextWarning;
    case 'info':
      return styles.badgeTextInfo;
    case 'neutral':
    default:
      return styles.badgeTextNeutral;
  }
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: themeTokens.spacing.md,
    paddingBottom: themeTokens.spacing.xl,
  },
  dateGroup: {
    marginBottom: themeTokens.spacing.lg,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: themeTokens.colors.border,
  },
  cardsList: {
    gap: 8,
  },
  eventCard: {
    padding: themeTokens.spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: themeTokens.borderRadius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeNeutral: {
    backgroundColor: themeTokens.colors.surfaceElevated,
  },
  badgeTextNeutral: {
    color: colors.textSecondary,
  },
  badgePositive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  badgeTextPositive: {
    color: colors.positive,
  },
  badgeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  badgeTextNegative: {
    color: colors.negative,
  },
  badgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  badgeTextWarning: {
    color: colors.warning,
  },
  badgeInfo: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  badgeTextInfo: {
    color: colors.accent,
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
  cardBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  leftColumn: {
    flex: 1,
  },
  assetLinkTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  assetTickerLink: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  assetNonLinkContainer: {
    marginBottom: 2,
  },
  assetTicker: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  assetName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  accountText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  secondaryContextText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  quantityText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  paginationContainer: {
    alignItems: 'center',
    marginTop: themeTokens.spacing.md,
  },
  loadMoreButton: {
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.border,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.md,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: 12,
    color: colors.negative,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyCard: {
    padding: themeTokens.spacing.xl,
    alignItems: 'center',
    marginHorizontal: themeTokens.spacing.md,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
