import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, AssetIncomeEventItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobileIncomeSectionProps {
  events: readonly AssetIncomeEventItem[];
}

export function MobileIncomeSection({ events }: MobileIncomeSectionProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionHeading}>RENDIMENTOS RECEBIDOS</Text>
          <Text style={styles.subtitle}>Dividendos, JCP e proventos creditados</Text>
        </View>
        <Text style={styles.countBadge}>
          {events.length} {events.length === 1 ? 'provento' : 'proventos'}
        </Text>
      </View>

      {events.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum rendimento registrado para este ativo.</Text>
      ) : (
        <View style={styles.list}>
          {events.map((evt, index) => {
            const isLast = index === events.length - 1;

            return (
              <View key={evt.transactionId} style={[styles.item, isLast && styles.noBorder]}>
                <View style={styles.topRow}>
                  <View style={styles.typeGroup}>
                    <Text style={styles.dateText}>{evt.formattedTradeDate}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{evt.typeLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.netAmountText}>{evt.amount}</Text>
                </View>

                <View style={styles.bottomRow}>
                  <Text style={styles.accountText}>{evt.accountName}</Text>
                  <View style={styles.subAmounts}>
                    <Text style={styles.subAmountText}>Bruto: {evt.grossAmount}</Text>
                  </View>
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
  typeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  typeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: themeTokens.borderRadius.sm,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: themeTokens.colors.primary,
  },
  netAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: themeTokens.colors.success,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
  },
  subAmounts: {
    flexDirection: 'row',
    gap: 8,
  },
  subAmountText: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
  },
});
