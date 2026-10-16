'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Card, Skeleton, Badge, EmptyState, ErrorState } from '@/components/ui';
import { colors, spacing, formatCurrency } from '@atlas/ui';

export interface AllocationItem {
  assetId: string;
  ticker?: string;
  assetType?: string;
  currency: string;
  marketValue: { amount: string; currency: string };
  allocationPercent: string;
  quoteFreshness: string | null;
}

export interface AssetClassAllocationItem {
  assetClass: string;
  currency: string;
  marketValue: { amount: string; currency: string };
  allocationPercent: string;
  assetCount: number;
}

export interface UnvaluedAssetItem {
  assetId: string;
  ticker?: string;
  assetType?: string;
  currency: string;
  reason: string;
}

export interface CurrencyAllocationBucket {
  currency: string;
  totalMarketValue: { amount: string; currency: string };
  byAsset: AllocationItem[];
  byAssetClass: AssetClassAllocationItem[];
  unvaluedAssets: UnvaluedAssetItem[];
}

export interface PortfolioAllocationResponse {
  data: {
    portfolioId: string;
    asOf: string | null;
    status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
    valuationCoveragePercent: string;
    currencies: Record<string, CurrencyAllocationBucket>;
  };
}

export function allocationQueryKey(portfolioId: string) {
  return ['portfolio-allocation', portfolioId] as const;
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FIIs)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  CRYPTO: 'Criptoativos',
  CASH: 'Caixa / Moeda',
  OTHER: 'Outros',
};

const UNVALUED_REASON_LABELS: Record<string, string> = {
  QUOTE_UNAVAILABLE: 'Sem cotação disponível',
  CURRENCY_MISMATCH: 'Moeda divergente da cotação',
  UNSUPPORTED_ASSET: 'Ativo não suportado',
  COST_INCOMPLETE: 'Custo incompleto',
};

export function PortfolioAllocationSection({
  portfolioId,
  isHistorical,
}: {
  portfolioId: string | null;
  isHistorical: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<PortfolioAllocationResponse>({
    queryKey: portfolioId ? allocationQueryKey(portfolioId) : ['portfolio-allocation', 'none'],
    queryFn: () =>
      apiClient.get<PortfolioAllocationResponse>(`/api/v1/portfolios/${portfolioId}/allocation`),
    enabled: !!portfolioId && !isHistorical,
    staleTime: 30_000,
  });

  if (isHistorical) {
    return (
      <Card style={{ padding: `${spacing.xl}px` }}>
        <EmptyState
          title="Alocação indisponível em modo histórico"
          description="A visualização de alocação patrimonial está disponível apenas para a posição atual da carteira."
        />
      </Card>
    );
  }

  if (!portfolioId) return null;

  if (isLoading) {
    return (
      <Card style={{ padding: `${spacing.base}px` }}>
        <Skeleton style={{ height: 180, width: '100%', borderRadius: 8 }} />
      </Card>
    );
  }

  if (isError) {
    const apiErr = error as ApiError;
    if (apiErr.statusCode === 404) return null;
    return (
      <Card style={{ padding: `${spacing.base}px` }}>
        <ErrorState
          title="Falha ao carregar alocação"
          message="Não foi possível calcular a distribuição patrimonial da carteira."
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const allocation = data?.data;
  if (!allocation || allocation.status === 'EMPTY') {
    return (
      <Card style={{ padding: `${spacing.xl}px` }}>
        <EmptyState
          title="Sua carteira ainda está vazia"
          description="Adicione operações com ativos para visualizar a distribuição patrimonial."
        />
      </Card>
    );
  }

  const currencyBuckets = Object.values(allocation.currencies);

  if (currencyBuckets.length === 0) {
    return (
      <Card style={{ padding: `${spacing.xl}px` }}>
        <EmptyState
          title="Sem dados de alocação"
          description="Nenhum ativo com cotação disponível para calcular percentuais."
        />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xl}px` }}>
      {/* Partial Allocation Warning Disclosure (§17) */}
      {allocation.status === 'PARTIAL' && (
        <Card
          data-testid="allocation-partial-warning"
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
                Alocação Parcial ({allocation.valuationCoveragePercent}% Cobertura)
              </strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: colors.textPrimary }}>
                Percentuais calculados apenas sobre os ativos com cotação disponível.
              </p>
            </div>
          </div>
        </Card>
      )}

      {currencyBuckets.map((bucket) => {
        const hasUnvalued = bucket.unvaluedAssets.length > 0;
        return (
          <div
            key={bucket.currency}
            data-testid={`allocation-bucket-${bucket.currency}`}
            style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}
          >
            {/* Currency Header if multi-currency */}
            {currencyBuckets.length > 1 && (
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', color: colors.textPrimary }}>
                  Alocação em {bucket.currency} (Total:{' '}
                  {formatCurrency(bucket.totalMarketValue.amount, bucket.totalMarketValue.currency)}
                  )
                </h3>
              </div>
            )}

            {/* Section A: Alocação por Classe de Ativo (§16) */}
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: `${spacing.md}px`,
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: colors.textPrimary }}>
                    Alocação por Classe de Ativo
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Distribuição percentual do valor de mercado por classe
                  </span>
                </div>
                <Badge variant="primary">{bucket.currency}</Badge>
              </div>

              {bucket.byAssetClass.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: '0.875rem', padding: '12px 0' }}>
                  Nenhum ativo valorizado nesta moeda.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
                  {bucket.byAssetClass.map((item) => {
                    const label = ASSET_CLASS_LABELS[item.assetClass] || item.assetClass;
                    const pctNum = parseFloat(item.allocationPercent) || 0;
                    return (
                      <div key={item.assetClass} data-testid={`alloc-class-${item.assetClass}`}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            marginBottom: '4px',
                            fontSize: '0.875rem',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                            {label} ({item.assetCount} {item.assetCount === 1 ? 'ativo' : 'ativos'})
                          </span>
                          <div style={{ display: 'flex', gap: `${spacing.md}px` }}>
                            <span style={{ color: colors.textSecondary }}>
                              {formatCurrency(item.marketValue.amount, item.marketValue.currency)}
                            </span>
                            <strong
                              style={{ color: colors.accent, minWidth: '55px', textAlign: 'right' }}
                            >
                              {item.allocationPercent}%
                            </strong>
                          </div>
                        </div>
                        {/* Accessible bar */}
                        <div
                          role="progressbar"
                          aria-valuenow={pctNum}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Percentual de ${label}`}
                          style={{
                            height: '8px',
                            width: '100%',
                            backgroundColor: colors.surfaceElevated,
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(pctNum, 100)}%`,
                              backgroundColor: colors.accent,
                              borderRadius: '4px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Section B: Alocação por Ativo (§15) */}
            <Card style={{ padding: `${spacing.base}px` }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: `${spacing.md}px`,
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: colors.textPrimary }}>
                    Alocação por Ativo
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    Peso individual de cada posição em custódia
                  </span>
                </div>
              </div>

              {bucket.byAsset.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: '0.875rem', padding: '12px 0' }}>
                  Nenhum ativo com cotação disponível.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
                  {bucket.byAsset.map((asset) => {
                    const pctNum = parseFloat(asset.allocationPercent) || 0;
                    return (
                      <div
                        key={asset.assetId}
                        data-testid={`alloc-asset-${asset.ticker || asset.assetId}`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            marginBottom: '4px',
                            fontSize: '0.875rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: colors.textPrimary, fontFamily: 'monospace' }}>
                              {asset.ticker || asset.assetId}
                            </strong>
                            {asset.assetType && (
                              <Badge variant="neutral">
                                {ASSET_CLASS_LABELS[asset.assetType] || asset.assetType}
                              </Badge>
                            )}
                            {asset.quoteFreshness === 'STALE' && (
                              <Badge variant="warning">Desatualizada</Badge>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: `${spacing.md}px` }}>
                            <span style={{ color: colors.textSecondary }}>
                              {formatCurrency(asset.marketValue.amount, asset.marketValue.currency)}
                            </span>
                            <strong
                              style={{ color: colors.accent, minWidth: '55px', textAlign: 'right' }}
                            >
                              {asset.allocationPercent}%
                            </strong>
                          </div>
                        </div>
                        {/* Accessible bar */}
                        <div
                          role="progressbar"
                          aria-valuenow={pctNum}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Percentual de ${asset.ticker || 'Ativo sem identificação'}`}
                          style={{
                            height: '8px',
                            width: '100%',
                            backgroundColor: colors.surfaceElevated,
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(pctNum, 100)}%`,
                              backgroundColor: colors.accent,
                              borderRadius: '4px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Section C: Ativos Sem Cotação (§18) */}
            {hasUnvalued && (
              <Card
                data-testid="unvalued-assets-card"
                style={{
                  padding: `${spacing.base}px`,
                  border: `1px dashed ${colors.border}`,
                  backgroundColor: colors.surfaceElevated,
                }}
              >
                <h4
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '0.9375rem',
                    color: colors.textSecondary,
                  }}
                >
                  Ativos sem cotação nesta moeda ({bucket.unvaluedAssets.length})
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.8125rem', color: colors.textMuted }}>
                  Estes ativos estão sob custódia, mas não participam do cálculo percentual por
                  falta de preço de mercado.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {bucket.unvaluedAssets.map((u) => (
                    <div
                      key={u.assetId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        borderBottom: `1px solid ${colors.border}`,
                        fontSize: '0.875rem',
                      }}
                    >
                      <strong style={{ color: colors.textPrimary, fontFamily: 'monospace' }}>
                        {u.ticker || 'Ativo sem identificação'}
                      </strong>
                      <Badge variant="neutral">
                        {UNVALUED_REASON_LABELS[u.reason] || u.reason}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
