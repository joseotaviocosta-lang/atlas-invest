import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  formatCurrency,
  formatPercentage,
  formatQuantity,
  formatDatePtBr,
  describePositionLimitation,
  describePositionTransactionType,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface IntelligenceMoney {
  amount: string;
  currency: string;
}

interface IntelligenceData {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  asset: {
    id: string;
    ticker: string | null;
    name: string | null;
    type: string | null;
    currency: string | null;
  } | null;
  position: {
    quantity: string;
    currency: string;
    costBasisStatus: 'KNOWN' | 'INCOMPLETE';
    totalCost: IntelligenceMoney | null;
    averageCost: IntelligenceMoney | null;
    isOpen: boolean;
  };
  valuation: {
    status: string;
    price: { amount: string; currency: string; asOf: string } | null;
    marketValue: IntelligenceMoney | null;
    unrealizedGainLoss: IntelligenceMoney | null;
    unrealizedGainLossPercent: string | null;
    quoteFreshness: string | null;
    quoteStatus: string | null;
  };
  allocation: {
    weightPercent: string | null;
    weightDenominator: IntelligenceMoney | null;
    translatedWeightPercent: string | null;
    reportingMarketValue: IntelligenceMoney | null;
    reportingCurrency: string | null;
    coveragePercent: string;
    partialCoverage: boolean;
  };
  performance: null;
  income: {
    totalsByCurrency: Array<{
      currency: string;
      dividends: string;
      jcp: string;
      fiiIncome: string;
      total: string;
    }>;
    recent: Array<{
      transactionId: string;
      tradeDate: string;
      type: string;
      amount: string;
      currency: string;
    }>;
  };
  realizedDisposals: Array<{
    transactionId: string;
    tradeDate: string;
    quantity: string;
    grossProceeds: IntelligenceMoney;
    sellingCosts: IntelligenceMoney;
    netProceeds: IntelligenceMoney;
    costBasisRemoved: IntelligenceMoney | null;
    realizedGainLoss: IntelligenceMoney | null;
    realizedReturnPercentage: string | null;
    status: string;
  }>;
  recentActivity: Array<{
    transactionId: string;
    tradeDate: string;
    type: string;
    quantity: string | null;
    unitPrice: string | null;
    amount: string | null;
    currency: string;
  }>;
  dataQuality: {
    valuationStatus: string;
    priceAsOf: string | null;
    quoteFreshness: string | null;
    quoteStatus: string | null;
    valuationCoveragePercent: string;
    partialCoverage: boolean;
  };
  limitations: string[];
}

const VALUATION_STATUS_LABELS: Record<string, string> = {
  VALUED: 'Avaliada',
  QUOTE_UNAVAILABLE: 'Preço indisponível',
  QUOTE_STALE: 'Preço desatualizado',
  COST_INCOMPLETE: 'Custo incompleto',
  CURRENCY_MISMATCH: 'Moeda incompatível',
  UNSUPPORTED_ASSET: 'Ativo não suportado',
};

function signedMoney(value: IntelligenceMoney | null): string {
  if (!value) return '—';
  const negative = value.amount.trim().startsWith('-');
  const abs = negative ? value.amount.trim().slice(1) : value.amount;
  return `${negative ? '-' : '+'}${formatCurrency(abs, value.currency)}`;
}

export interface MobilePositionIntelligenceSectionProps {
  portfolioId: string;
  assetId: string;
}

/**
 * Phase 5R-A (mobile) — position intelligence, read-only.
 *
 * Quantity/costs, valuation, weight, income, realized disposals and
 * recent activity from the same endpoint as web. Facts only with explicit
 * signs and text, never color alone.
 */
export function MobilePositionIntelligenceSection({
  portfolioId,
  assetId,
}: MobilePositionIntelligenceSectionProps) {
  const intelligenceQuery = useQuery({
    queryKey: ['position-intelligence', portfolioId, assetId],
    queryFn: async () => {
      const res = await portfoliosApi.getPositionIntelligence(portfolioId, assetId);
      return res.data as IntelligenceData;
    },
    enabled: Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  if (intelligenceQuery.isLoading) {
    return (
      <View testID="position-intelligence-loading">
        <Text style={styles.muted}>Carregando inteligência da posição…</Text>
      </View>
    );
  }
  if (intelligenceQuery.isError || !intelligenceQuery.data) {
    return null;
  }
  const data = intelligenceQuery.data;

  return (
    <View testID="position-intelligence">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>VALOR E PARTICIPAÇÃO</Text>
        <Text style={styles.value} testID="position-market-value">
          {data.valuation.marketValue
            ? formatCurrency(data.valuation.marketValue.amount, data.valuation.marketValue.currency)
            : 'Indisponível'}
        </Text>
        <Text style={styles.muted}>
          {data.valuation.price
            ? `Último preço disponível: ${formatCurrency(data.valuation.price.amount, data.valuation.price.currency)} em ${formatDatePtBr(data.valuation.price.asOf)}${data.valuation.status === 'QUOTE_STALE' ? ' (desatualizado)' : ''}.`
            : 'Preço indisponível para esta posição.'}
        </Text>
        <Text style={styles.muted}>
          {data.allocation.weightPercent !== null
            ? `${formatPercentage(data.allocation.weightPercent)} ${data.allocation.partialCoverage ? 'do valor conhecido da carteira' : 'da carteira'}.`
            : 'Participação indisponível sem valor avaliado.'}
        </Text>
        <Text style={styles.muted} testID="position-unrealized">
          Resultado não realizado:{' '}
          {data.valuation.unrealizedGainLoss
            ? `${signedMoney(data.valuation.unrealizedGainLoss)} (${formatPercentage(data.valuation.unrealizedGainLossPercent, { showSign: true })})`
            : '—'}
        </Text>
        {data.marketDataAsOf ? (
          <Text style={styles.muted}>
            Dados de mercado até {formatDatePtBr(data.marketDataAsOf)}.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>VENDAS REALIZADAS</Text>
        {data.realizedDisposals.length > 0 ? (
          <View>
            {data.realizedDisposals.map((disposal) => (
              <View key={disposal.transactionId} style={styles.row}>
                <Text style={styles.body}>
                  {formatDatePtBr(disposal.tradeDate)} · {formatQuantity(disposal.quantity)} cotas ·{' '}
                  {formatCurrency(disposal.netProceeds.amount, disposal.netProceeds.currency)} ·
                  Resultado:{' '}
                  {disposal.realizedGainLoss ? signedMoney(disposal.realizedGainLoss) : '—'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Nenhuma venda registrada para esta posição.</Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>RENDA RECEBIDA</Text>
        {data.income.totalsByCurrency.length > 0 ? (
          <View>
            {data.income.totalsByCurrency.map((row) => (
              <Text
                key={row.currency}
                style={styles.body}
                testID={`position-income-total-${row.currency}`}
              >
                Total {formatCurrency(row.total, row.currency)} · Dividendos{' '}
                {formatCurrency(row.dividends, row.currency)} · JCP{' '}
                {formatCurrency(row.jcp, row.currency)} · FII{' '}
                {formatCurrency(row.fiiIncome, row.currency)}.
              </Text>
            ))}
            {data.income.recent.map((event) => (
              <Text key={event.transactionId} style={styles.muted}>
                {formatDatePtBr(event.tradeDate)} · {describePositionTransactionType(event.type)} ·{' '}
                {formatCurrency(event.amount, event.currency)}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>
            Nenhum rendimento registrado para esta posição no histórico.
          </Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>ATIVIDADE RECENTE</Text>
        {data.recentActivity.length > 0 ? (
          <View>
            {data.recentActivity.map((row) => (
              <Text
                key={row.transactionId}
                style={styles.body}
                testID={`position-activity-${row.transactionId}`}
              >
                {formatDatePtBr(row.tradeDate)} · {describePositionTransactionType(row.type)}
                {row.quantity ? ` · ${formatQuantity(row.quantity)}` : ''}
                {row.unitPrice ? ` @ ${formatCurrency(row.unitPrice, row.currency)}` : ''}
                {row.amount ? ` · ${formatCurrency(row.amount, row.currency)}` : ''}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Nenhuma movimentação encontrada para esta posição.</Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>DADOS E LIMITAÇÕES</Text>
        <Text style={styles.muted}>
          Estado da avaliação:{' '}
          {VALUATION_STATUS_LABELS[data.valuation.status] ?? data.valuation.status} · Quantidade:{' '}
          {formatQuantity(data.position.quantity)} · Custo:{' '}
          {data.position.costBasisStatus === 'KNOWN' ? 'conhecido' : 'desconhecido'}.
        </Text>
        {data.limitations.map((limitation) => (
          <Text key={limitation} style={styles.muted} testID={`position-limitation-${limitation}`}>
            {describePositionLimitation(limitation)}
          </Text>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  body: {
    fontSize: 14,
    color: themeTokens.colors.text,
    marginTop: 2,
  },
  muted: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  row: {
    paddingVertical: 4,
  },
  note: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    marginTop: 8,
  },
});

export type { IntelligenceData as MobilePositionIntelligenceData };
