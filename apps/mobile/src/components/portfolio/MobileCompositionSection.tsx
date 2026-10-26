import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  themeTokens,
  formatScenarioBp,
  formatScenarioMoney,
  scenarioCategoryLabel,
  describeCompositionLimitation,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface CompositionBucketView {
  key: string;
  label: string;
  marketValue: { amount: string; currency: string };
  weightBp: number | null;
  positionCount: number;
}

interface CompositionDimensionView {
  code: 'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE';
  currency: string | null;
  totalKnownValue: { amount: string; currency: string } | null;
  coveragePercent: string | null;
  buckets: CompositionBucketView[];
  unclassified: {
    marketValue: { amount: string; currency: string };
    weightBp: number | null;
    positionCount: number;
  } | null;
  positionCount: number;
}

interface CompositionData {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  basis: 'REPORTING_CURRENCY' | 'SINGLE_CURRENCY' | 'PER_CURRENCY';
  reportingCurrency: string | null;
  coverage: {
    valuationCoveragePercent: string;
    partialCoverage: boolean;
    knownCurrencies: string[];
    unvaluedCount: number;
  };
  availableDimensions: Array<'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE'>;
  dimensions: {
    byAsset: CompositionDimensionView | null;
    byAssetClass: CompositionDimensionView | null;
    byCurrency: CompositionDimensionView | null;
    byExchange: CompositionDimensionView | null;
  };
  topPositions: Array<{
    assetId: string;
    ticker: string | null;
    marketValue: { amount: string; currency: string };
    weightBp: number | null;
    rank: number;
  }>;
  concentrationFacts: {
    largestPosition: { assetId: string; ticker: string | null; weightBp: number | null } | null;
    largestAssetClass: { key: string; label: string; weightBp: number | null } | null;
    largestCurrency: { key: string; weightBp: number | null } | null;
    largestExchange: { key: string; weightBp: number | null } | null;
  };
  unvaluedPositions: Array<{
    assetId: string;
    ticker: string | null;
    currency: string;
    reason: string;
  }>;
  limitations: string[];
}

const DIMENSION_LABELS: Record<string, string> = {
  ASSET: 'Ativos',
  ASSET_CLASS: 'Classe',
  CURRENCY: 'Moeda',
  EXCHANGE: 'Bolsa',
};

function bucketLabel(code: string, bucket: { key: string; label: string }): string {
  if (code === 'ASSET_CLASS') return scenarioCategoryLabel(bucket.label);
  return bucket.label;
}

/**
 * Phase 5R-C (mobile) — portfolio composition, read-only.
 * Dimension selector, per-bucket table, coverage and concentration facts.
 * Table only; asset rows navigate to 5R-A detail.
 */
export function MobileCompositionSection({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [dimension, setDimension] = useState<'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE'>(
    'ASSET_CLASS',
  );

  const compositionQuery = useQuery({
    queryKey: ['portfolio-composition', portfolioId],
    queryFn: async () => {
      const res = await portfoliosApi.getPortfolioComposition(portfolioId);
      return res.data as CompositionData;
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  const data = compositionQuery.data ?? null;
  const activeDimension: CompositionDimensionView | null = data
    ? dimension === 'ASSET'
      ? data.dimensions.byAsset
      : dimension === 'ASSET_CLASS'
        ? data.dimensions.byAssetClass
        : dimension === 'CURRENCY'
          ? data.dimensions.byCurrency
          : data.dimensions.byExchange
    : null;

  return (
    <View testID="portfolio-composition">
      <Text style={styles.sectionHeading}>COMPOSIÇÃO DA CARTEIRA</Text>
      {compositionQuery.isLoading ? (
        <Text style={styles.muted}>Carregando composição…</Text>
      ) : compositionQuery.isError || !data ? (
        <Text style={styles.muted}>Não foi possível carregar a composição.</Text>
      ) : (
        <View>
          {data.availableDimensions.length > 0 ? (
            <View style={styles.selectorRow}>
              {data.availableDimensions.map((code) => (
                <Pressable
                  key={code}
                  onPress={() => setDimension(code)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver composição por ${DIMENSION_LABELS[code] ?? code}`}
                  accessibilityState={{ selected: dimension === code }}
                  testID={`composition-dimension-${code}`}
                >
                  <Text style={[styles.selector, dimension === code && styles.selectorActive]}>
                    {DIMENSION_LABELS[code] ?? code}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {data.coverage.partialCoverage ? (
            <Text style={styles.muted} testID="composition-coverage-warning">
              A composição considera {data.coverage.valuationCoveragePercent}% do valor conhecido da
              carteira.
            </Text>
          ) : null}
          {activeDimension && activeDimension.buckets.length > 0 ? (
            <Card style={styles.card}>
              <View testID={`composition-table-${activeDimension.code}`}>
                {activeDimension.buckets.map((row) => (
                  <View key={row.key} style={styles.row}>
                    <View style={styles.rowMain}>
                      <Text style={styles.category}>
                        {bucketLabel(activeDimension.code, row)}
                        {row.key === 'UNCLASSIFIED' ? ' (sem classificação)' : ''}
                      </Text>
                      <Text style={styles.muted}>
                        {formatScenarioMoney(row.marketValue.amount, row.marketValue.currency)} ·{' '}
                        {row.weightBp === null ? '—' : formatScenarioBp(row.weightBp)} ·{' '}
                        {row.positionCount} {row.positionCount === 1 ? 'posição' : 'posições'}
                      </Text>
                    </View>
                    {activeDimension.code === 'ASSET' && row.key !== 'UNCLASSIFIED' ? (
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/(app)/portfolio/${encodeURIComponent(row.key)}?portfolioId=${portfolioId}`,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Ver posição ${row.label}`}
                      >
                        <Text style={styles.link}>Ver</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
          {data.topPositions.length > 0 ? (
            <View testID="composition-top-positions">
              <Text style={styles.sectionHeading}>MAIORES POSIÇÕES</Text>
              {data.topPositions.map((row) => (
                <Text key={row.assetId} style={styles.body}>
                  {row.rank}. {row.ticker ?? row.assetId} ·{' '}
                  {formatScenarioMoney(row.marketValue.amount, row.marketValue.currency)}
                  {row.weightBp !== null ? ` · ${formatScenarioBp(row.weightBp)}` : ''}
                </Text>
              ))}
            </View>
          ) : null}
          {data.concentrationFacts.largestPosition?.weightBp != null ||
          data.concentrationFacts.largestAssetClass?.weightBp != null ? (
            <View testID="composition-concentration-facts">
              {data.concentrationFacts.largestPosition?.weightBp != null ? (
                <Text style={styles.muted}>
                  Maior posição:{' '}
                  {data.concentrationFacts.largestPosition.ticker ??
                    data.concentrationFacts.largestPosition.assetId}{' '}
                  ({formatScenarioBp(data.concentrationFacts.largestPosition.weightBp)}).
                </Text>
              ) : null}
              {data.concentrationFacts.largestAssetClass?.weightBp != null ? (
                <Text style={styles.muted}>
                  Maior classe:{' '}
                  {scenarioCategoryLabel(data.concentrationFacts.largestAssetClass.key)} (
                  {formatScenarioBp(data.concentrationFacts.largestAssetClass.weightBp)}).
                </Text>
              ) : null}
            </View>
          ) : null}
          {data.unvaluedPositions.length > 0 ? (
            <View testID="composition-unvalued">
              <Text style={styles.sectionHeading}>SEM COTAÇÃO</Text>
              {data.unvaluedPositions.map((row) => (
                <Text key={row.assetId} style={styles.muted}>
                  {row.ticker ?? row.assetId} · {row.reason}
                </Text>
              ))}
            </View>
          ) : null}
          {data.limitations.map((limitation) => (
            <Text
              key={limitation}
              style={styles.muted}
              testID={`composition-limitation-${limitation}`}
            >
              {describeCompositionLimitation(limitation)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginTop: 12,
    marginBottom: 4,
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
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  selector: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  selectorActive: {
    color: themeTokens.colors.text,
    fontWeight: '700',
  },
  card: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  rowMain: {
    flex: 1,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: themeTokens.colors.primary,
  },
});
