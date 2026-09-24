import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { formatCurrency, formatPercentage, colors } from '@atlas/ui';

export function usePortfolioValuation(portfolioId: string | null, isHistorical: boolean) {
  return useQuery({
    queryKey: ['portfolio-valuation', portfolioId],
    queryFn: async () => {
      if (!portfolioId) return null;
      const res = await apiClient.get<{
        data: {
          totalsByCurrency: Record<
            string,
            {
              marketValue: { amount: string; currency: string };
              knownCost: { amount: string; currency: string };
              unrealizedGainLoss: { amount: string; currency: string } | null;
              unrealizedGainLossPercent: string | null;
            }
          >;
          completeness: string;
          summary: { totalPositions: number; valuedPositions: number };
        };
      }>(`/api/v1/portfolios/${portfolioId}/valuation`);
      return res.data;
    },
    enabled: !!portfolioId && !isHistorical,
    staleTime: 30000,
  });
}

export function MobileValuationSection({
  portfolioId,
  isHistorical,
}: {
  portfolioId: string | null;
  isHistorical: boolean;
}) {
  const { data, isLoading, isError } = usePortfolioValuation(portfolioId, isHistorical);

  if (isHistorical || !portfolioId) return null;

  if (isLoading) {
    return (
      <View
        style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16 }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16 }}
      >
        <Text style={{ color: colors.negative, fontSize: 13 }}>
          Não foi possível atualizar valores de mercado.
        </Text>
      </View>
    );
  }

  if (!data) return null;
  const totalsEntries = Object.entries(data.totalsByCurrency);
  if (totalsEntries.length === 0) return null;

  return (
    <View style={{ gap: 12, marginBottom: 16 }}>
      {data.completeness !== 'COMPLETE' && (
        <View
          style={{
            padding: 12,
            backgroundColor: '#FFF7ED',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#FDBA74',
          }}
        >
          <Text style={{ fontSize: 12, color: '#9A3412' }}>
            Valuation parcial: {data.summary.valuedPositions} de {data.summary.totalPositions}{' '}
            posições com cotação.
          </Text>
        </View>
      )}
      {totalsEntries.map(([currency, totals]) => (
        <View
          key={currency}
          style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12 }}
          testID={`valuation-${currency}`}
        >
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>{currency}</Text>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Valor de mercado</Text>
              <Text testID={`market-value-${currency}`} style={{ fontWeight: '600' }}>
                {formatCurrency(totals.marketValue.amount, totals.marketValue.currency)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                Custo total conhecido
              </Text>
              <Text>{formatCurrency(totals.knownCost.amount, totals.knownCost.currency)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                Resultado não realizado
              </Text>
              <Text testID={`unrealized-${currency}`}>
                {totals.unrealizedGainLoss
                  ? formatCurrency(
                      totals.unrealizedGainLoss.amount,
                      totals.unrealizedGainLoss.currency,
                    )
                  : '—'}
                {totals.unrealizedGainLossPercent
                  ? ` (${formatPercentage(totals.unrealizedGainLossPercent)})`
                  : ''}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
