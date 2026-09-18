import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, colors, AssetRealizedDisposalItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface MobileRealizedSectionProps {
  disposals: readonly AssetRealizedDisposalItem[];
}

export function MobileRealizedSection({ disposals }: MobileRealizedSectionProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionHeading}>RESULTADO REALIZADO</Text>
          <Text style={styles.subtitle}>Alienações encerradas deste ativo</Text>
        </View>
        <Text style={styles.countBadge}>
          {disposals.length} {disposals.length === 1 ? 'venda' : 'vendas'}
        </Text>
      </View>

      {disposals.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma alienação realizada para este ativo.</Text>
      ) : (
        <View style={styles.list}>
          {disposals.map((disp, index) => {
            const isLast = index === disposals.length - 1;
            const gainColor = disp.isPositive
              ? themeTokens.colors.success
              : disp.isNegative
                ? themeTokens.colors.danger
                : themeTokens.colors.text;

            return (
              <View key={disp.transactionId} style={[styles.item, isLast && styles.noBorder]}>
                <View style={styles.topRow}>
                  <View style={styles.dateAccountGroup}>
                    <Text style={styles.dateText}>{disp.formattedTradeDate}</Text>
                    <Text style={styles.accountText}>• {disp.accountName}</Text>
                  </View>
                  <Text style={[styles.gainLossText, { color: gainColor }]}>
                    {disp.realizedGainLoss}
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailText}>Qtd: {disp.quantity}</Text>
                  <Text style={styles.detailText}>Bruto: {disp.grossProceeds}</Text>
                  <Text style={styles.detailText}>Líquido: {disp.netProceeds}</Text>
                </View>

                {disp.status === 'INCOMPLETE' && (
                  <View style={styles.incompleteBadge}>
                    <Text style={styles.incompleteText}>Custo de aquisição incompleto</Text>
                  </View>
                )}
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
  dateAccountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  accountText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
  },
  gainLossText: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailText: {
    fontSize: 12,
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
  incompleteText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
});
