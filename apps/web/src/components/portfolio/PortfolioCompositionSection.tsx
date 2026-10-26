'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeCompositionLimitation,
  formatScenarioBp,
  formatScenarioMoney,
  scenarioCategoryLabel,
} from '@atlas/ui';

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

export function compositionQueryKey(portfolioId: string) {
  return ['portfolio-composition', portfolioId];
}

const DIMENSION_LABELS: Record<string, string> = {
  ASSET: 'Ativos',
  ASSET_CLASS: 'Classe',
  CURRENCY: 'Moeda',
  EXCHANGE: 'Bolsa',
};

function dimensionLabel(code: string): string {
  if (code === 'ASSET') return 'Ativo';
  if (code === 'ASSET_CLASS') return 'Classe';
  if (code === 'CURRENCY') return 'Moeda';
  return 'Bolsa';
}

function bucketLabel(code: string, bucket: { key: string; label: string }): string {
  if (code === 'ASSET_CLASS') return scenarioCategoryLabel(bucket.label);
  return bucket.label;
}

/**
 * Phase 5R-C — portfolio composition (read-only).
 *
 * Canonical asset/class/currency/exchange breakdowns over one known
 * denominator, with coverage and concentration facts. Facts only:
 * explicit numbers, neutral labels, full visibility of gaps.
 */
export function PortfolioCompositionSection({ portfolioId }: { portfolioId: string | null }) {
  const authReady = useAuthReady();
  const [dimension, setDimension] = useState<'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE'>(
    'ASSET_CLASS',
  );

  const compositionQuery = useQuery({
    queryKey: compositionQueryKey(portfolioId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<{ data: CompositionData }>(
        `/api/v1/portfolios/${portfolioId}/composition`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== null,
    staleTime: 30_000,
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
    <div
      id="composition"
      style={{
        marginTop: `${spacing.base}px`,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: `${spacing.base}px`,
      }}
      data-testid="portfolio-composition"
    >
      <SectionHeader
        title="Composição da carteira"
        description="Distribuição por classe, ativo, moeda e bolsa — apenas com dados canônicos."
      />
      {compositionQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : compositionQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar a composição"
          message="Tente novamente."
          onRetry={() => compositionQuery.refetch()}
        />
      ) : !data ? (
        <EmptyState
          title="Sem dados de composição"
          description="Crie posições na carteira para ver a composição."
        />
      ) : (
        <>
          {data.availableDimensions.length > 0 ? (
            <div
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}
              role="group"
              aria-label="Dimensão da composição"
            >
              {data.availableDimensions.map((code) => (
                <Button
                  key={code}
                  variant={dimension === code ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setDimension(code)}
                  style={{ minHeight: 44 }}
                  aria-label={`Ver composição por ${DIMENSION_LABELS[code] ?? code}`}
                  aria-pressed={dimension === code}
                  data-testid={`composition-dimension-${code}`}
                >
                  {DIMENSION_LABELS[code] ?? code}
                </Button>
              ))}
            </div>
          ) : null}
          {data.coverage.partialCoverage ? (
            <p
              style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
              data-testid="composition-coverage-warning"
            >
              A composição considera {data.coverage.valuationCoveragePercent}% do valor conhecido da
              carteira.
            </p>
          ) : null}
          {activeDimension && activeDimension.buckets.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}
                data-testid={`composition-table-${activeDimension.code}`}
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                    <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                      {dimensionLabel(activeDimension.code)}
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Valor
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Peso
                    </th>
                    <th
                      scope="col"
                      style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}
                    >
                      Posições
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeDimension.buckets.map((row) => (
                    <tr
                      key={row.key}
                      style={{ borderTop: `1px solid ${colors.border}` }}
                      data-testid={`composition-row-${activeDimension.code}-${row.key}`}
                    >
                      <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>
                        {bucketLabel(activeDimension.code, row)}
                        {row.key === 'UNCLASSIFIED' ? ' (sem classificação)' : ''}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {formatScenarioMoney(row.marketValue.amount, row.marketValue.currency)}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {row.weightBp === null ? '—' : formatScenarioBp(row.weightBp)}
                      </td>
                      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                        {row.positionCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {data.topPositions.length > 0 ? (
            <div style={{ marginTop: 8 }} data-testid="composition-top-positions">
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
                Maiores posições
              </h4>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {data.topPositions.map((row) => (
                  <li
                    key={row.assetId}
                    style={{ fontSize: '0.8125rem' }}
                    data-testid={`composition-top-${row.assetId}`}
                  >
                    {row.rank}. {row.ticker ?? row.assetId} ·{' '}
                    {formatScenarioMoney(row.marketValue.amount, row.marketValue.currency)}
                    {row.weightBp !== null ? ` · ${formatScenarioBp(row.weightBp)}` : ''}{' '}
                    <Link
                      href={`/portfolio/assets/${row.assetId}${portfolioId ? `?portfolioId=${portfolioId}` : ''}`}
                      aria-label={`Ver posição ${row.ticker ?? row.assetId}`}
                    >
                      Ver posição
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(data.concentrationFacts.largestPosition ??
          data.concentrationFacts.largestAssetClass) ? (
            <div style={{ marginTop: 8 }} data-testid="composition-concentration-facts">
              {data.concentrationFacts.largestPosition?.weightBp != null ? (
                <p
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}
                >
                  Maior posição:{' '}
                  {data.concentrationFacts.largestPosition.ticker ??
                    data.concentrationFacts.largestPosition.assetId}{' '}
                  ({formatScenarioBp(data.concentrationFacts.largestPosition.weightBp)}).
                </p>
              ) : null}
              {data.concentrationFacts.largestAssetClass?.weightBp != null ? (
                <p
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}
                >
                  Maior classe:{' '}
                  {scenarioCategoryLabel(data.concentrationFacts.largestAssetClass.key)} (
                  {formatScenarioBp(data.concentrationFacts.largestAssetClass.weightBp)}).
                </p>
              ) : null}
            </div>
          ) : null}
          {data.unvaluedPositions.length > 0 ? (
            <div style={{ marginTop: 8 }} data-testid="composition-unvalued">
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
                Sem cotação
              </h4>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {data.unvaluedPositions.map((row) => (
                  <li
                    key={row.assetId}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    {row.ticker ?? row.assetId} · {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.limitations.map((limitation) => (
            <p
              key={limitation}
              style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0 0' }}
              data-testid={`composition-limitation-${limitation}`}
            >
              {describeCompositionLimitation(limitation)}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
