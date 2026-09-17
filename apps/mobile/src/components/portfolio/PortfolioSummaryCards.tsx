import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens } from '@atlas/ui';
import { KnownCostCardItem, RealizedResultCardItem, IncomeReceivedCardItem } from '@atlas/ui';
import { Card } from '../ui/Card';

export interface PortfolioSummaryCardsProps {
  openPositionsCount: number;
  knownTotalCost: readonly KnownCostCardItem[];
  realizedResult: readonly RealizedResultCardItem[];
  incomeReceived: readonly IncomeReceivedCardItem[];
}

export function PortfolioSummaryCards({
  openPositionsCount,
  knownTotalCost,
  realizedResult,
  incomeReceived,
}: PortfolioSummaryCardsProps) {
  const isCostIncomplete = knownTotalCost.some((c) => c.hasIncompletePositions);

  return (
    <View style={styles.container}>
      {/* 1. Posições Abertas */}
      <Card style={styles.card}>
        <Text style={styles.label}>Posições abertas</Text>
        <Text style={styles.mainValue}>{openPositionsCount}</Text>
        <Text style={styles.subText}>
          {openPositionsCount === 1
            ? '1 ativo em custódia'
            : `${openPositionsCount} ativos em custódia`}
        </Text>
      </Card>

      {/* 2. Custo Total Conhecido */}
      <Card style={styles.card}>
        <Text style={styles.label}>
          {isCostIncomplete ? 'Custo total conhecido' : 'Custo total'}
        </Text>
        {knownTotalCost.map((cost) => (
          <View key={cost.currency} style={styles.currencyRow}>
            <Text style={styles.mainValue}>{cost.formattedAmount}</Text>
            <Text style={styles.currencyCode}>{cost.currency}</Text>
          </View>
        ))}
        <Text style={styles.subText}>Capital alocado pelo custo</Text>
      </Card>

      {/* 3. Resultado Realizado */}
      <Card style={styles.card}>
        <Text style={styles.label}>Resultado realizado</Text>
        {realizedResult.length === 0 ? (
          <Text style={[styles.mainValue, { color: themeTokens.colors.textMuted }]}>—</Text>
        ) : (
          realizedResult.map((res) => {
            const amountColor = res.isPositive
              ? themeTokens.colors.success
              : res.isNegative
                ? themeTokens.colors.danger
                : themeTokens.colors.text;

            return (
              <View key={res.currency} style={styles.currencyRow}>
                <Text style={[styles.mainValue, { color: amountColor }]}>
                  {res.formattedAmount}
                </Text>
                {res.formattedPercentage && (
                  <Text style={[styles.percentage, { color: amountColor }]}>
                    {res.formattedPercentage}
                  </Text>
                )}
              </View>
            );
          })
        )}
        <Text style={styles.subText}>Lucro/prejuízo em vendas encerradas</Text>
      </Card>

      {/* 4. Rendimentos Recebidos */}
      <Card style={styles.card}>
        <Text style={styles.label}>Rendimentos recebidos</Text>
        {incomeReceived.length === 0 ? (
          <Text style={[styles.mainValue, { color: themeTokens.colors.textMuted }]}>—</Text>
        ) : (
          incomeReceived.map((inc) => (
            <View key={inc.currency}>
              <View style={styles.currencyRow}>
                <Text style={[styles.mainValue, { color: themeTokens.colors.success }]}>
                  {inc.formattedAmount}
                </Text>
                <Text style={styles.currencyCode}>{inc.currency}</Text>
              </View>
              <Text style={styles.subText}>
                Div: {inc.breakdown.dividends} • JCP: {inc.breakdown.jcp}
              </Text>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: themeTokens.spacing.sm,
    marginBottom: themeTokens.spacing.md,
  },
  card: {
    padding: themeTokens.spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: themeTokens.colors.textMuted,
    marginBottom: 4,
  },
  mainValue: {
    fontSize: 20,
    fontWeight: '700',
    color: themeTokens.colors.text,
    letterSpacing: -0.3,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  currencyCode: {
    fontSize: 12,
    fontWeight: '600',
    color: themeTokens.colors.textMuted,
  },
  percentage: {
    fontSize: 12,
    fontWeight: '700',
  },
  subText: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    marginTop: 4,
  },
});
