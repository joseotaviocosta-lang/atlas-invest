'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Card, Skeleton, Badge, ErrorState } from '@/components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';

export interface ValuationMoneyJSON {
  amount: string;
  currency: string;
}

export interface PositionValuationDto {
  assetId: string;
  accountId: string | null;
  ticker?: string | null;
  assetType?: string | null;
  quantity: string;
  currency: string;
  totalCost: ValuationMoneyJSON | null;
  averageCost: ValuationMoneyJSON | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  quote: {
    assetId: string;
    price: string;
    currency: string;
    asOf: string;
    receivedAt: string;
    source: string;
    status: string;
    freshness: string;
    providerSymbol: string;
  } | null;
  marketValue: ValuationMoneyJSON | null;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  status: string;
  quoteFreshness: string | null;
  quoteStatus: string | null;
}

export interface CurrencyValuationTotalsDto {
  currency: string;
  marketValue: ValuationMoneyJSON;
  costBasis: ValuationMoneyJSON;
  knownCost: ValuationMoneyJSON;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  valuedPositionsCount: number;
  unvaluedPositionsCount: number;
  stalePositionsCount: number;
}

export interface PortfolioValuationResponse {
  data: {
    portfolioId: string;
    asOf: string | null;
    engineVersion: string;
    valuationVersion: string;
    positions: PositionValuationDto[];
    totalsByCurrency: Record<string, CurrencyValuationTotalsDto>;
    completeness: string;
    summary: {
      totalPositions: number;
      valuedPositions: number;
      unvaluedPositions: number;
      unavailablePositions: number;
      incompleteCostPositions: number;
      stalePositions: number;
      mismatchPositions: number;
      valuationCoveragePercent: string;
      currencies: string[];
    };
    quoteSummary: {
      totalQuotesRequested: number;
      quotesAvailable: number;
      quotesUnavailable: number;
      quotesStale: number;
    };
  };
}

export function valuationQueryKey(portfolioId: string) {
  return ['portfolio-valuation', portfolioId] as const;
}

export function PortfolioValuationSection({
  portfolioId,
  isHistorical,
}: {
  portfolioId: string | null;
  isHistorical: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<PortfolioValuationResponse>({
    queryKey: portfolioId ? valuationQueryKey(portfolioId) : ['portfolio-valuation', 'none'],
    queryFn: () =>
      apiClient.get<PortfolioValuationResponse>(`/api/v1/portfolios/${portfolioId}/valuation`),
    enabled: !!portfolioId && !isHistorical,
    staleTime: 30_000,
  });

  if (isHistorical || !portfolioId) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: `${spacing.base}px`,
          marginBottom: `${spacing.xl}px`,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} style={{ padding: `${spacing.base}px`, minHeight: '110px' }}>
            <Skeleton width="50%" height="0.875rem" style={{ marginBottom: '0.75rem' }} />
            <Skeleton width="75%" height="1.5rem" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    const apiErr = error as ApiError;
    if (apiErr.statusCode === 404) return null;
    return (
      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.xl}px` }}>
        <ErrorState
          title="Falha ao carregar valor de mercado"
          message="Não foi possível obter a avaliação a mercado desta carteira."
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const valuation = data?.data;
  if (!valuation) return null;

  const currencyBuckets = Object.values(valuation.totalsByCurrency);
  if (currencyBuckets.length === 0) {
    return null;
  }

  const isPartial =
    valuation.completeness !== 'COMPLETE' && valuation.summary.unvaluedPositions > 0;
  const isStale = valuation.summary.stalePositions > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.base}px`,
        marginBottom: `${spacing.xl}px`,
      }}
    >
      {/* 1. Partial Valuation Warning Disclosure (§8) */}
      {isPartial && (
        <Card
          data-testid="valuation-partial-warning"
          style={{
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
            border: '1px solid #D97706',
            padding: `${spacing.base}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div>
              <strong style={{ color: '#D97706', fontSize: '0.9375rem' }}>
                Valuation Parcial ({valuation.summary.valuationCoveragePercent}% Cobertura)
              </strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: colors.textPrimary }}>
                Parte da carteira ainda não possui cotação disponível. Os totais de mercado
                consideram apenas os ativos com preço conhecido.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 2. Stale Quote Warning Disclosure (§9) */}
      {isStale && (
        <Card
          data-testid="valuation-stale-warning"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: `1px solid ${colors.accent}`,
            padding: `${spacing.base}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
            <div>
              <strong style={{ color: colors.accent, fontSize: '0.9375rem' }}>
                Cotações Desatualizadas Detectadas
              </strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: colors.textPrimary }}>
                {valuation.summary.stalePositions}{' '}
                {valuation.summary.stalePositions === 1 ? 'posição utiliza' : 'posições utilizam'}{' '}
                cotação de pregões anteriores ao mais recente.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Valuation Cards Per Currency (§4, §5, §6, §7) */}
      {currencyBuckets.map((bucket) => {
        const unrealized = bucket.unrealizedGainLoss;
        const unrealizedPct = bucket.unrealizedGainLossPercent;
        const isNegative = unrealized?.amount.startsWith('-');
        const isPositive = unrealized && !isNegative && unrealized.amount !== '0';
        const unrealizedColor = isPositive
          ? colors.positive
          : isNegative
            ? colors.negative
            : colors.textPrimary;

        return (
          <div key={bucket.currency} data-testid={`valuation-bucket-${bucket.currency}`}>
            {currencyBuckets.length > 1 && (
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: colors.textPrimary }}>
                Posição em {bucket.currency}
              </h4>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: `${spacing.base}px`,
              }}
            >
              {/* Card 1: Custo de Aquisição (Known Cost Basis) */}
              <div
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                  padding: `${spacing.base}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span
                  style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}
                >
                  Custo em custódia
                </span>
                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {formatCurrency(bucket.knownCost.amount, bucket.knownCost.currency)}
                </span>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Total histórico investido nas posições
                </span>
              </div>

              {/* Card 2: Valor de Mercado */}
              <div
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                  padding: `${spacing.base}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}
                  >
                    Valor de mercado
                  </span>
                  {valuation.completeness !== 'COMPLETE' && (
                    <Badge variant="warning">Parcial</Badge>
                  )}
                </div>
                <span
                  data-testid={`market-value-${bucket.currency}`}
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {formatCurrency(bucket.marketValue.amount, bucket.marketValue.currency)}
                </span>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Cotação a mercado consolidada
                </span>
              </div>

              {/* Card 3: Resultado Não Realizado */}
              <div
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                  padding: `${spacing.base}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span
                  style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}
                >
                  Resultado não realizado
                </span>
                {unrealized ? (
                  <div>
                    <span
                      data-testid={`unrealized-${bucket.currency}`}
                      style={{
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        color: unrealizedColor,
                        letterSpacing: '-0.3px',
                      }}
                    >
                      {formatCurrency(unrealized.amount, unrealized.currency)}
                    </span>
                    {unrealizedPct && (
                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: unrealizedColor,
                          marginLeft: '8px',
                        }}
                      >
                        ({formatPercentage(unrealizedPct, { showSign: true })})
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.textMuted }}>
                    Custo não disponível
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  Variação não realizada sobre o custo
                </span>
              </div>

              {/* Card 4: Cobertura de Cotação */}
              <div
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                  padding: `${spacing.base}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{ fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary }}
                  >
                    Cobertura de cotação
                  </span>
                  <Badge
                    variant={
                      valuation.summary.valuationCoveragePercent === '100' ? 'positive' : 'warning'
                    }
                  >
                    {valuation.summary.valuationCoveragePercent}%
                  </Badge>
                </div>
                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {bucket.valuedPositionsCount} de{' '}
                  {bucket.valuedPositionsCount + bucket.unvaluedPositionsCount}
                </span>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  {bucket.unvaluedPositionsCount > 0
                    ? `${bucket.unvaluedPositionsCount} posições sem cotação`
                    : 'Todos os ativos precificados'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PositionValuationBadge({
  status,
  freshness,
}: {
  status: string;
  freshness: string | null;
}) {
  if (status === 'QUOTE_UNAVAILABLE') {
    return <Badge variant="neutral">Sem cotação</Badge>;
  }
  if (status === 'COST_INCOMPLETE') {
    return <Badge variant="warning">Custo incompleto</Badge>;
  }
  if (status === 'CURRENCY_MISMATCH') {
    return <Badge variant="danger">Moeda incompatível</Badge>;
  }
  if (freshness === 'STALE' || status === 'QUOTE_STALE') {
    return <Badge variant="warning">Desatualizada</Badge>;
  }
  if (freshness === 'FRESH' || status === 'VALUED') {
    return <Badge variant="positive">Atualizada</Badge>;
  }
  return null;
}

export interface IngestionReceiptDto {
  requestedAssets: number;
  resolvedAssets: number;
  skippedAssets: number;
  quotesFetched: number;
  quotesInserted: number;
  quotesUnchanged: number;
  quotesRevised: number;
  authRequiredAssets: string[];
  missingAssets: string[];
  rateLimitedAssets: string[];
  providerErrors: string[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'EMPTY_UNIVERSE';
}

export function formatUpdateReceiptFeedback(receipt: IngestionReceiptDto): {
  message: string;
  variant: 'positive' | 'warning' | 'negative';
} {
  const insertedCount = receipt.quotesInserted ?? 0;
  const revisedCount = receipt.quotesRevised ?? 0;
  const unchangedCount = receipt.quotesUnchanged ?? 0;
  const updatedCount = insertedCount + revisedCount;
  const resolvedCount = receipt.resolvedAssets ?? 0;
  const authCount = receipt.authRequiredAssets?.length ?? 0;
  const missingCount =
    (receipt.missingAssets?.length ?? 0) + (receipt.rateLimitedAssets?.length ?? 0);
  const totalNotUpdated = authCount + missingCount + (receipt.skippedAssets ?? 0);

  if (receipt.status === 'EMPTY_UNIVERSE' || (receipt.requestedAssets ?? 0) === 0) {
    return {
      message: 'Nenhum ativo com posição ou movimentação no período selecionado.',
      variant: 'warning',
    };
  }

  if (receipt.status === 'FAILED' || (updatedCount === 0 && unchangedCount === 0 && totalNotUpdated > 0)) {
    if (authCount > 0 && updatedCount === 0) {
      return {
        message: `Atualização requer autenticação de provedor para ${authCount} ${authCount === 1 ? 'ativo' : 'ativos'} (${receipt.authRequiredAssets.join(', ')}). Configure BRAPI_API_KEY.`,
        variant: 'warning',
      };
    }
    return {
      message: `Nenhuma cotação atualizada (${receipt.requestedAssets ?? 0} solicitadas, ${totalNotUpdated} indisponíveis).`,
      variant: 'warning',
    };
  }

  if (updatedCount === 0 && unchangedCount > 0) {
    return {
      message: `Cotações já atualizadas: ${unchangedCount} ${unchangedCount === 1 ? 'cotação mantida' : 'cotações mantidas'} para ${resolvedCount} ${resolvedCount === 1 ? 'ativo' : 'ativos'}.`,
      variant: 'positive',
    };
  }

  const parts: string[] = [];
  const successfulAssetCount = Math.max(0, resolvedCount - authCount - missingCount);
  const assetCountToDisplay = successfulAssetCount > 0 ? successfulAssetCount : (resolvedCount > 0 ? resolvedCount : updatedCount);
  const assetNoun = assetCountToDisplay === 1 ? 'ativo' : 'ativos';

  if (updatedCount > assetCountToDisplay) {
    // Multi-quote backfill case (e.g. historical range with multiple days)
    const quoteNoun = updatedCount === 1 ? 'cotação inserida' : 'cotações inseridas';
    parts.push(
      `Cotações atualizadas com sucesso: ${updatedCount} ${quoteNoun} para ${assetCountToDisplay} ${assetNoun}`,
    );
  } else {
    // Single quote per asset case (latest EOD quote update)
    parts.push(
      `Cotações atualizadas com sucesso: ${assetCountToDisplay} ${assetNoun}`,
    );
  }

  if (revisedCount > 0) {
    parts.push(`(${revisedCount} ${revisedCount === 1 ? 'revisão' : 'revisões'})`);
  }

  const diagnostics: string[] = [];
  if (authCount > 0) {
    diagnostics.push(`${authCount} requer token (${receipt.authRequiredAssets.join(', ')})`);
  }
  if (missingCount > 0) {
    diagnostics.push(`${missingCount} não localizados`);
  }

  if (diagnostics.length > 0) {
    return {
      message: `${parts.join(' ')}. Atenção: ${diagnostics.join(', ')}.`,
      variant: 'positive',
    };
  }

  return {
    message: `${parts.join(' ')}.`,
    variant: 'positive',
  };
}
