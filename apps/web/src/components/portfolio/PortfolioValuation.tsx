'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Card, Skeleton, Badge, EmptyState, ErrorState } from '@/components/ui';
import { formatCurrency, formatPercentage } from '@atlas/ui';

interface ValuationMoneyJSON {
  amount: string;
  currency: string;
}

interface ValuationResponse {
  data: {
    portfolioId: string;
    positions: Array<{
      assetId: string;
      ticker: string | null;
      quantity: string;
      marketValue: ValuationMoneyJSON | null;
      unrealizedGainLoss: ValuationMoneyJSON | null;
      unrealizedGainLossPercent: string | null;
      status: string;
      quoteFreshness: string | null;
    }>;
    totalsByCurrency: Record<
      string,
      {
        marketValue: ValuationMoneyJSON;
        knownCost: ValuationMoneyJSON;
        unrealizedGainLoss: ValuationMoneyJSON | null;
        unrealizedGainLossPercent: string | null;
      }
    >;
    completeness: string;
    summary: { totalPositions: number; valuedPositions: number; unavailablePositions: number };
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
  const { data, isLoading, isError, error, refetch } = useQuery<ValuationResponse>({
    queryKey: portfolioId ? valuationQueryKey(portfolioId) : ['portfolio-valuation', 'none'],
    queryFn: () => apiClient.get<ValuationResponse>(`/api/v1/portfolios/${portfolioId}/valuation`),
    enabled: !!portfolioId && !isHistorical,
    staleTime: 30_000,
  });

  if (isHistorical) {
    return null;
  }

  if (!portfolioId) return null;

  if (isLoading) {
    return (
      <Card>
        <Skeleton style={{ height: 80 }} />
      </Card>
    );
  }

  if (isError) {
    const apiErr = error as ApiError;
    if (apiErr.statusCode === 404) return null;
    return (
      <Card>
        <ErrorState
          message="Não foi possível atualizar valores de mercado."
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const valuation = data?.data;
  if (!valuation) return null;

  const totalsEntries = Object.entries(valuation.totalsByCurrency);
  if (totalsEntries.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Sem cotação disponível"
          description="Nenhuma posição possui cotação atual."
        />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {valuation.completeness !== 'COMPLETE' && (
        <Card style={{ background: '#FFF7ED', borderColor: '#FDBA74' }}>
          <div style={{ fontSize: 13, color: '#9A3412' }}>
            Valuation parcial: {valuation.summary.valuedPositions} de{' '}
            {valuation.summary.totalPositions} posições com cotação.
            {valuation.completeness === 'PARTIAL_QUOTES' && ' Algumas posições sem cotação.'}
            {valuation.completeness === 'PARTIAL_COST' && ' Alguns custos incompletos.'}
          </div>
        </Card>
      )}
      {totalsEntries.map(([currency, totals]) => (
        <Card key={currency} data-testid={`valuation-${currency}`}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <strong>{currency}</strong>
            {valuation.completeness !== 'COMPLETE' && <Badge variant="warning">Parcial</Badge>}
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Valor de mercado</span>
              <span data-testid={`market-value-${currency}`}>
                {formatCurrency(totals.marketValue.amount, totals.marketValue.currency)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Custo total conhecido</span>
              <span>{formatCurrency(totals.knownCost.amount, totals.knownCost.currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Resultado não realizado</span>
              <span data-testid={`unrealized-${currency}`}>
                {totals.unrealizedGainLoss
                  ? formatCurrency(
                      totals.unrealizedGainLoss.amount,
                      totals.unrealizedGainLoss.currency,
                    )
                  : '—'}
                {totals.unrealizedGainLossPercent
                  ? ` (${formatPercentage(totals.unrealizedGainLossPercent)})`
                  : ''}
              </span>
            </div>
          </div>
        </Card>
      ))}
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
    return <Badge variant="neutral">Cotação indisponível</Badge>;
  }
  if (status === 'COST_INCOMPLETE') {
    return <Badge variant="warning">Custo incompleto</Badge>;
  }
  if (status === 'CURRENCY_MISMATCH') {
    return <Badge variant="danger">Moeda divergente</Badge>;
  }
  if (freshness === 'STALE' || status === 'QUOTE_STALE') {
    return <Badge variant="warning">Cotação desatualizada</Badge>;
  }
  return null;
}
