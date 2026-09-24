import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens, colors } from '@atlas/ui';
import { PortfolioOverviewPositionItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface PositionCardProps {
  position: PortfolioOverviewPositionItem;
  portfolioId?: string;
  /** Historical snapshot `YYYY-MM-DD`; preserved in asset navigation. */
  asOf?: string | null;
}

export function PositionCard({ position, portfolioId, asOf }: PositionCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const isIncomplete = position.costBasisStatus === 'INCOMPLETE';

  const navigateToDetail = () => {
    const params = new URLSearchParams();
    if (portfolioId) params.set('portfolioId', portfolioId);
    if (asOf) params.set('asOf', asOf);
    const query = params.toString() ? `?${params.toString()}` : '';
    router.push(`/(app)/portfolio/${position.assetId}${query}`);
  };

  return (
    <Card style={styles.card}>
      {/* Position Header (Tappable touch target >= 44px) */}
      <TouchableOpacity
        style={styles.headerRow}
        onPress={navigateToDetail}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Abrir detalhes de ${position.displayIdentifier}`}
      >
        <View style={styles.identifierGroup}>
          <Text style={styles.ticker}>{position.displayIdentifier}</Text>
          {isIncomplete && (
            <View style={styles.badgeWarning}>
              <Text style={styles.badgeWarningText}>Dados incompletos</Text>
            </View>
          )}
        </View>
        <Text style={styles.quantityText}>
          {position.quantity} {position.quantity === '1' ? 'unidade' : 'unidades'}
        </Text>
      </TouchableOpacity>

      {/* Financial Values Grid */}
      <View style={styles.valuesGrid}>
        <View style={styles.valueItem}>
          <Text style={styles.valueLabel}>Preço médio</Text>
          <Text style={[styles.valueText, isIncomplete && styles.incompleteText]}>
            {position.averageCost}
          </Text>
        </View>
        <View style={[styles.valueItem, styles.alignRight]}>
          <Text style={styles.valueLabel}>Custo total</Text>
          <Text style={[styles.valueTextBold, isIncomplete && styles.incompleteText]}>
            {position.totalCost}
          </Text>
        </View>
      </View>

      {/* View Details Action (Touch Target >= 44px) */}
      <TouchableOpacity
        style={styles.detailButton}
        onPress={navigateToDetail}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes completos de ${position.displayIdentifier}`}
      >
        <Text style={styles.detailButtonText}>Ver detalhes do ativo</Text>
        <Text style={styles.detailButtonChevron}>→</Text>
      </TouchableOpacity>

      {/* Expand Account Breakdown Button (Touch Target >= 44px) */}
      {position.accounts.length > 0 && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Ver detalhamento por conta de ${position.displayIdentifier}`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.expandButtonText}>
            {position.accountCount === 1
              ? '1 conta de custódia'
              : `${position.accountCount} contas de custódia`}
          </Text>
          <Text style={styles.expandIcon}>{isExpanded ? '▲ Ocultar' : '▼ Ver contas'}</Text>
        </TouchableOpacity>
      )}

      {/* Expandable Accounts */}
      {isExpanded && position.accounts.length > 0 && (
        <View style={styles.breakdownContainer}>
          <Text style={styles.breakdownTitle}>Distribuição por Conta</Text>
          {position.accounts.map((acc) => {
            const accIncomplete = acc.costBasisStatus === 'INCOMPLETE';
            return (
              <View key={acc.accountId} style={styles.accountRow}>
                <View style={styles.accountHeader}>
                  <Text style={styles.accountName}>{acc.accountName}</Text>
                  {accIncomplete && <Text style={styles.accountIncompleteText}>(incompleto)</Text>}
                </View>
                <View style={styles.accountDetails}>
                  <Text style={styles.accountDetailText}>Qtd: {acc.quantity}</Text>
                  <Text style={styles.accountDetailText}>
                    PM: {accIncomplete ? '—' : acc.averageCost}
                  </Text>
                  <Text style={styles.accountDetailText}>
                    Custo: {accIncomplete ? '—' : acc.totalCost}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: themeTokens.spacing.sm,
    padding: themeTokens.spacing.sm,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  detailButtonText: {
    fontSize: 13,
    color: themeTokens.colors.primary,
    fontWeight: '600',
  },
  detailButtonChevron: {
    fontSize: 14,
    color: themeTokens.colors.primary,
    fontWeight: '700',
  },
  identifierGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ticker: {
    fontSize: 16,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  badgeWarning: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  badgeWarningText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  quantityText: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
  },
  valuesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  valueItem: {
    flex: 1,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  valueLabel: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    marginBottom: 2,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  valueTextBold: {
    fontSize: 15,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  incompleteText: {
    color: themeTokens.colors.textMuted,
  },
  expandButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingVertical: 10,
  },
  expandButtonText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    fontWeight: '500',
  },
  expandIcon: {
    fontSize: 12,
    color: themeTokens.colors.primary,
    fontWeight: '600',
  },
  breakdownContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: themeTokens.borderRadius.sm,
    padding: 8,
    marginTop: 4,
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: themeTokens.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  accountRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  accountName: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  accountIncompleteText: {
    fontSize: 11,
    color: colors.warning,
  },
  accountDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accountDetailText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
  },
});
