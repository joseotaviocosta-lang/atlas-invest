import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, colors } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobilePrimaryCardProps {
  quantity: string;
  averageCost: string;
  totalCost: string;
  isIncomplete: boolean;
  incompleteMessage: string | null;
}

export function MobilePrimaryCard({
  quantity,
  averageCost,
  totalCost,
  isIncomplete,
  incompleteMessage,
}: MobilePrimaryCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionHeading}>POSIÇÃO CONSOLIDADA</Text>

      <View style={styles.grid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Quantidade</Text>
          <Text style={styles.metricValue}>{quantity}</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Preço médio</Text>
          <Text style={[styles.metricValue, isIncomplete && styles.incompleteValue]}>
            {averageCost}
          </Text>
        </View>

        <View style={[styles.metricItem, styles.fullWidth]}>
          <Text style={styles.metricLabel}>Custo total conhecido</Text>
          <Text style={[styles.metricValueLarge, isIncomplete && styles.incompleteValue]}>
            {totalCost}
          </Text>
        </View>
      </View>

      {isIncomplete && incompleteMessage && (
        <View style={styles.incompleteBox}>
          <Text style={styles.incompleteNote}>ℹ️ {incompleteMessage}</Text>
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
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: themeTokens.colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricItem: {
    flex: 1,
    minWidth: '45%',
  },
  fullWidth: {
    minWidth: '100%',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  metricLabel: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  metricValueLarge: {
    fontSize: 20,
    fontWeight: '800',
    color: themeTokens.colors.text,
  },
  incompleteValue: {
    color: themeTokens.colors.textMuted,
  },
  incompleteBox: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: themeTokens.borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  incompleteNote: {
    fontSize: 11,
    color: colors.warning,
    lineHeight: 16,
  },
});
