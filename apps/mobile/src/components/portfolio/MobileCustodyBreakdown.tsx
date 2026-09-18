import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, colors, AssetAccountBreakdownItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobileCustodyBreakdownProps {
  readonly accounts: readonly AssetAccountBreakdownItem[];
}

export function MobileCustodyBreakdown({ accounts }: MobileCustodyBreakdownProps) {
  if (accounts.length === 0) {
    return (
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>DISTRIBUIÇÃO POR CONTA DE CUSTÓDIA</Text>
        <Text style={styles.emptyText}>Nenhuma conta com custódia ativa para este ativo.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.sectionHeading}>DISTRIBUIÇÃO POR CONTA DE CUSTÓDIA</Text>
        <Text style={styles.accountCountText}>
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
        </Text>
      </View>

      <View style={styles.accountsList}>
        {accounts.map((acc, index) => {
          const isIncomplete = acc.costBasisStatus === 'INCOMPLETE';
          const isLast = index === accounts.length - 1;

          return (
            <View key={acc.accountId} style={[styles.accountItem, isLast && styles.noBorder]}>
              <View style={styles.accountTopRow}>
                <Text style={styles.accountName}>{acc.accountName}</Text>
                {isIncomplete && (
                  <View style={styles.incompleteBadge}>
                    <Text style={styles.incompleteBadgeText}>Incompleto</Text>
                  </View>
                )}
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Quantidade</Text>
                  <Text style={styles.metricValue}>{acc.quantity}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Preço médio</Text>
                  <Text style={[styles.metricValue, isIncomplete && styles.incompleteText]}>
                    {acc.averageCost}
                  </Text>
                </View>
                <View style={[styles.metric, styles.alignRight]}>
                  <Text style={styles.metricLabel}>Custo total</Text>
                  <Text style={[styles.metricValueBold, isIncomplete && styles.incompleteText]}>
                    {acc.totalCost}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: themeTokens.colors.textMuted,
    letterSpacing: 0.5,
  },
  accountCountText: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    fontStyle: 'italic',
  },
  accountsList: {
    gap: 8,
  },
  accountItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  noBorder: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  accountTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  incompleteBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  incompleteBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    flex: 1,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  metricValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  incompleteText: {
    color: themeTokens.colors.textMuted,
  },
});
