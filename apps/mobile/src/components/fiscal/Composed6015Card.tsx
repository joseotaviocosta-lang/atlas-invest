import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  themeTokens,
  mapToComposed6015ViewModel,
  mapToTaxPaymentEligibilityViewModel,
  composed6015CategoryLabel,
  type RawTaxPaymentSummary,
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

/**
 * Mobile read-only composed 6015 summary (Phase 4G.2C).
 *
 * Renders the server-composed 6015 amount (FII + ordinary equity + day trade)
 * and the 4E minimum/carry view. Never aggregates components or computes tax.
 */
export function Composed6015Card({
  summary,
}: {
  summary: RawTaxPaymentSummary | null | undefined;
}) {
  const composition = useMemo(
    () => mapToComposed6015ViewModel(summary?.composition ?? null),
    [summary],
  );
  const eligibility = useMemo(
    () => mapToTaxPaymentEligibilityViewModel(summary ?? null),
    [summary],
  );

  if (!composition) return null;

  return (
    <Card>
      <Text style={styles.title}>Composição 6015</Text>
      <Row label="Código de receita" value={composition.revenueCode} />
      <Text style={[styles.status, { color: composition.statusColor }]}>
        {composition.statusLabel}
      </Text>

      {composition.isBlocked ? (
        <Text style={styles.warning}>{composition.blockedReasonLabel}</Text>
      ) : (
        <>
          {composition.components.map((component) => (
            <Row
              key={component.category}
              label={composed6015CategoryLabel(component.category)}
              value={component.amountFormatted}
            />
          ))}
          <Row label="Total do mês" value={composition.totalFormatted} />
          {eligibility && (
            <>
              <Row label="Saldo anterior" value={eligibility.carryForwardFormatted} />
              <Row
                label="Valor a pagar"
                value={eligibility.isPayable ? eligibility.totalPayableFormatted : '—'}
              />
              <Row label="Vencimento" value={eligibility.dueDateFormatted} />
              <Row label="Situação" value={eligibility.statusLabel} />
            </>
          )}
          {eligibility?.isDeferred && (
            <Text style={styles.warning}>
              Valor abaixo do mínimo: não há DARF a pagar nesta competência.
            </Text>
          )}
        </>
      )}
      <Text style={styles.meta}>
        O pagamento é consolidado por código de receita; a emissão do DARF é feita na seção de
        obrigações.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
  },
  label: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  value: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  warning: {
    color: themeTokens.colors.warning ?? themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 8,
  },
});
