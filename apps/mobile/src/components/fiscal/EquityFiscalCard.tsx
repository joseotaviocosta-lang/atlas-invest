import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  themeTokens,
  mapToEquityFiscalViewModel,
  type RawEquityMonthlyFiscal,
  type EquityCategoryVM,
} from '@atlas/ui';
import { Card } from '../ui';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function CategoryCard({
  title,
  category,
  showMatchedQuantity,
}: {
  title: string;
  category: EquityCategoryVM;
  showMatchedQuantity: boolean;
}) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <Row label="Situação da isenção" value={category.exemptionLabel} />
      <Row label="Vendas no mês" value={category.grossSalesFormatted} />
      {showMatchedQuantity && category.matchedQuantityFormatted && (
        <Row label="Quantidade em day trade" value={category.matchedQuantityFormatted} />
      )}
      <Row label="Resultado do mês" value={category.currentResultFormatted} />
      <Row label="Prejuízo acumulado inicial" value={category.openingLossFormatted} />
      <Row label="Prejuízo acumulado final" value={category.closingLossFormatted} />
      <Row label="Base tributável antes de IRRF" value={category.taxableBaseBeforeRateFormatted} />
    </Card>
  );
}

/**
 * Mobile read-only equity monthly fiscal surface (Phase 4G.2A.1c, ADR-295).
 * Renders server-computed values only; never computes tax, losses or exemption.
 */
export function EquityFiscalCard({
  equity,
}: {
  equity: RawEquityMonthlyFiscal | null | undefined;
}) {
  const vm = useMemo(() => mapToEquityFiscalViewModel(equity ?? null), [equity]);
  if (!vm) return null;

  return (
    <>
      <Card>
        <Text style={styles.sectionTitle}>Ações</Text>
        {vm.blocked ? (
          <>
            <Text style={styles.blocked}>Dados insuficientes para concluir</Text>
            <Text style={styles.meta}>{vm.blockedReasonLabel}</Text>
          </>
        ) : !vm.hasActivity ? (
          <Text style={styles.meta}>Sem operações de ações nesta competência.</Text>
        ) : (
          <>
            <Text style={styles.statusLabel}>Compensação futura: {vm.election.statusLabel}</Text>
            {vm.election.required && (
              <Text style={styles.meta}>Finalize esta decisão na versão web.</Text>
            )}
          </>
        )}
      </Card>

      {!vm.blocked && vm.hasActivity && (
        <>
          <CategoryCard
            title="Ações — Operações comuns"
            category={vm.normal}
            showMatchedQuantity={false}
          />
          <CategoryCard
            title="Ações — Day trade"
            category={vm.dayTrade}
            showMatchedQuantity={true}
          />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  title: {
    color: themeTokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  label: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    flexShrink: 1,
  },
  value: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusLabel: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  blocked: {
    color: themeTokens.colors.warning ?? themeTokens.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
