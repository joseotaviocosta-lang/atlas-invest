import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { themeTokens, colors, AssetHistoryEventItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobileHistorySectionProps {
  items: readonly AssetHistoryEventItem[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreError?: string | null;
}

export function MobileHistorySection({
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  loadMoreError,
}: MobileHistorySectionProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionHeading}>HISTÓRICO DO ATIVO</Text>
          <Text style={styles.subtitle}>Extrato cronológico auditável de movimentações</Text>
        </View>
        <Text style={styles.countBadge}>
          {items.length} {items.length === 1 ? 'evento' : 'eventos'}
        </Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum evento registrado para este ativo.</Text>
      ) : (
        <View style={styles.list}>
          {items.map((evt, index) => {
            const isLast = index === items.length - 1;

            return (
              <View key={evt.id} style={[styles.item, isLast && !hasNextPage && styles.noBorder]}>
                <View style={styles.topRow}>
                  <View style={styles.dateTypeGroup}>
                    <Text style={styles.dateText}>{evt.formattedTradeDate}</Text>
                    <View style={[styles.kindBadge, getKindBadgeStyle(evt.kind)]}>
                      <Text style={[styles.kindBadgeText, getKindTextStyle(evt.kind)]}>
                        {evt.kindLabel}
                      </Text>
                    </View>
                  </View>
                  {evt.amount && <Text style={styles.amountText}>{evt.amount}</Text>}
                </View>

                <Text style={styles.descriptionText}>{evt.description}</Text>

                <View style={styles.bottomRow}>
                  <Text style={styles.accountText}>{evt.accountName}</Text>
                  {evt.quantity && <Text style={styles.quantityText}>Qtd: {evt.quantity}</Text>}
                </View>

                {evt.isCostBasisIncomplete && (
                  <View style={styles.incompleteBadge}>
                    <Text style={styles.incompleteBadgeText}>Custo incompleto</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Pagination Load More Button (Touch target >= 44px) */}
      {hasNextPage && (
        <View style={styles.loadMoreContainer}>
          {loadMoreError ? (
            <Text style={styles.loadMoreErrorText}>Falha ao carregar mais: {loadMoreError}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={onLoadMore}
            disabled={isFetchingNextPage}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Carregar mais eventos do histórico"
          >
            {isFetchingNextPage ? (
              <ActivityIndicator size="small" color={themeTokens.colors.primary} />
            ) : (
              <Text style={styles.loadMoreButtonText}>Carregar mais movimentações</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

function getKindBadgeStyle(kind: string) {
  switch (kind) {
    case 'REALIZED_DISPOSAL':
      return { backgroundColor: 'rgba(239, 68, 68, 0.12)' };
    case 'INCOME':
      return { backgroundColor: 'rgba(16, 185, 129, 0.12)' };
    case 'CORPORATE_ACTION':
      return { backgroundColor: 'rgba(168, 85, 247, 0.12)' };
    case 'TRANSFER':
      return { backgroundColor: 'rgba(59, 130, 246, 0.12)' };
    default:
      return { backgroundColor: 'rgba(255, 255, 255, 0.08)' };
  }
}

function getKindTextStyle(kind: string) {
  switch (kind) {
    case 'REALIZED_DISPOSAL':
      return { color: colors.negative };
    case 'INCOME':
      return { color: themeTokens.colors.success };
    case 'CORPORATE_ACTION':
      return { color: '#C084FC' };
    case 'TRANSFER':
      return { color: themeTokens.colors.primary };
    default:
      return { color: themeTokens.colors.textMuted };
  }
}

const styles = StyleSheet.create({
  card: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: themeTokens.colors.textMuted,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  countBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: themeTokens.colors.textMuted,
  },
  emptyText: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  list: {
    gap: 6,
  },
  item: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  noBorder: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateTypeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  kindBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  amountText: {
    fontSize: 13,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  descriptionText: {
    fontSize: 12,
    color: themeTokens.colors.text,
    marginVertical: 3,
    lineHeight: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  accountText: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
  },
  quantityText: {
    fontSize: 11,
    fontWeight: '600',
    color: themeTokens.colors.textMuted,
  },
  incompleteBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
    marginTop: 4,
  },
  incompleteBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  loadMoreContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  loadMoreErrorText: {
    color: colors.negative,
    fontSize: 12,
    marginBottom: 6,
  },
  loadMoreButton: {
    minHeight: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.borderRadius.md,
    paddingHorizontal: 16,
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.primary,
  },
});
