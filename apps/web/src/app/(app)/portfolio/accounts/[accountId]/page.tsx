'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  colors,
  spacing,
  borderRadius,
  buildAccountDetailViewModel,
  PortfolioStateDto,
  resolveTemporalContext,
  getTodayCivilDateString,
  accountStateQueryKey,
  appendAsOf,
} from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import { Card, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { Badge } from '@/components/ui/Badge';
import { PortfolioHistoricalBanner } from '@/components/portfolio';

interface PortfolioDto {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  status: string;
}

interface AccountDto {
  id: string;
  portfolioId: string;
  institutionId: string;
  name: string;
  currency: string;
  status: string;
}

interface InstitutionDto {
  id: string;
  name: string;
}

interface AssetDto {
  id: string;
  ticker: string;
  name: string;
}

function AccountDetailContent() {
  const params = useParams<{ accountId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = params.accountId;
  const portfolioIdParam = searchParams.get('portfolioId');

  // Temporal context (Fase 2F): historical snapshots come from server replay.
  const today = React.useMemo(() => getTodayCivilDateString(), []);
  const temporal = React.useMemo(
    () => resolveTemporalContext({ rawAsOf: searchParams.get('asOf'), today }),
    [searchParams, today],
  );
  const isHistorical = temporal.mode === 'HISTORICAL';

  const clearAsOf = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('asOf');
    const qs = next.toString();
    router.replace(`/portfolio/accounts/${accountId}${qs ? `?${qs}` : ''}`);
  };

  const { data: portfolios = [], isLoading: isPortfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data;
    },
    staleTime: 60_000,
  });

  const activePortfolioId = portfolioIdParam || portfolios[0]?.id || '';

  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
  } = useQuery({
    queryKey: accountStateQueryKey(activePortfolioId, accountId ?? '', temporal.asOf),
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const endpoint = temporal.asOf
        ? `/api/v1/portfolios/${activePortfolioId}/state?asOf=${temporal.asOf}`
        : `/api/v1/portfolios/${activePortfolioId}/state`;
      const res = await apiClient.get<{ data: PortfolioStateDto }>(endpoint);
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 30_000,
  });

  const { data: accountsData = [] } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return [];
      const res = await apiClient.get<{ data: AccountDto[] }>(
        `/api/v1/portfolios/${activePortfolioId}/accounts`,
      );
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60_000,
  });

  const { data: institutionsData = [] } = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: InstitutionDto[] }>('/api/v1/institutions');
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const { data: assetsData = [] } = useQuery({
    queryKey: ['assets-catalog'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: AssetDto[] }>('/api/v1/assets');
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const detailViewModel = React.useMemo(() => {
    if (!stateData || !accountId) return null;
    return buildAccountDetailViewModel({
      portfolioId: activePortfolioId,
      accountId,
      state: stateData,
      accountsMeta: accountsData,
      institutionsMeta: institutionsData,
      assetsMeta: assetsData,
    });
  }, [stateData, accountId, activePortfolioId, accountsData, institutionsData, assetsData]);

  const isLoading = isPortfoliosLoading || (isStateLoading && !stateData);

  if (isLoading) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Skeleton width="180px" height="24px" />
        <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
      </div>
    );
  }

  if (isStateError && !stateData) {
    const isOffline =
      stateError instanceof ApiError && (stateError.isOffline || stateError.code === 'OFFLINE');
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <ErrorState
            title={isOffline ? 'Sem conexão' : 'Falha ao carregar conta'}
            message={
              isOffline
                ? 'Verifique sua conexão com a internet e tente novamente.'
                : 'Ocorreu um erro ao consultar os dados da conta.'
            }
            onRetry={() => refetchState()}
          />
        </Card>
      </div>
    );
  }

  // Wrong-portfolio/deep-link safety: hide details instead of leaking data.
  if (detailViewModel && !detailViewModel.found) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <nav aria-label="Breadcrumb" style={{ marginBottom: `${spacing.md}px` }}>
          <Link
            href={`/portfolio/accounts${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`}
            style={{
              color: colors.accent,
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            ← Contas
          </Link>
        </nav>
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <EmptyState
            title="Conta não encontrada"
            description="Esta conta não pertence à carteira selecionada ou não existe mais."
          />
        </Card>
      </div>
    );
  }

  const historyHref = appendAsOf(
    `/portfolio/history?portfolioId=${activePortfolioId}&accountId=${accountId}`,
    temporal.asOf,
  );
  const incomeHref = appendAsOf(
    `/portfolio/income?portfolioId=${activePortfolioId}&accountId=${accountId}`,
    temporal.asOf,
  );
  const cashFlowHref = appendAsOf(
    `/portfolio/cash-flow?portfolioId=${activePortfolioId}&accountId=${accountId}`,
    temporal.asOf,
  );

  return (
    <div
      style={{ maxWidth: '1000px', margin: '0 auto', padding: `${spacing.xl}px ${spacing.base}px` }}
    >
      {isHistorical && temporal.bannerLabel && (
        <PortfolioHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
      )}
      <nav aria-label="Breadcrumb" style={{ marginBottom: `${spacing.md}px` }}>
        <Link
          href={appendAsOf(
            `/portfolio/accounts${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`,
            temporal.asOf,
          )}
          style={{
            color: colors.accent,
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
          }}
        >
          ← Contas
        </Link>
      </nav>

      <div style={{ marginBottom: `${spacing.lg}px` }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: colors.textPrimary,
            margin: '0 0 4px 0',
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={detailViewModel?.accountName ?? undefined}
        >
          {detailViewModel?.accountName ?? 'Conta'}
        </h1>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          {detailViewModel?.institutionName ?? 'Instituição não informada'}
          {detailViewModel?.currency ? ` • ${detailViewModel.currency}` : ''}
          {detailViewModel?.statusLabel ? ` • ${detailViewModel.statusLabel}` : ''}
        </p>
        {detailViewModel?.hasIncompleteCost && (
          <div style={{ marginTop: `${spacing.sm}px` }}>
            <Badge variant="warning">Custo incompleto</Badge>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          flexWrap: 'wrap',
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <Link href={historyHref} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '0.875rem', color: colors.accent, fontWeight: 600 }}>
            Ver histórico →
          </span>
        </Link>
        <Link href={incomeHref} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '0.875rem', color: colors.accent, fontWeight: 600 }}>
            Ver rendimentos →
          </span>
        </Link>
        <Link href={cashFlowHref} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '0.875rem', color: colors.accent, fontWeight: 600 }}>
            Ver fluxos →
          </span>
        </Link>
      </div>

      {!detailViewModel || detailViewModel.isEmpty ? (
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <EmptyState
            title={isHistorical ? 'Nenhuma posição nesta data' : 'Nenhuma posição aberta'}
            description={
              isHistorical && temporal.displayDate
                ? `Esta conta não possuía posições abertas em ${temporal.displayDate}. Isso não significa que a conta seja inválida.`
                : 'Esta conta não possui posições de ativos em custódia no momento.'
            }
          />
        </Card>
      ) : (
        <Card
          style={{
            padding: 0,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 2fr) 1fr 1fr 1fr',
              padding: `${spacing.sm}px ${spacing.base}px`,
              backgroundColor: colors.surfaceElevated,
              borderBottom: `1px solid ${colors.border}`,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <div>Ativo</div>
            <div style={{ textAlign: 'right' }}>Quantidade</div>
            <div style={{ textAlign: 'right' }}>Preço médio</div>
            <div style={{ textAlign: 'right' }}>Custo total</div>
          </div>
          <div>
            {detailViewModel.positions.map((pos, index) => (
              <div
                key={pos.assetId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(140px, 2fr) 1fr 1fr 1fr',
                  padding: `${spacing.base}px`,
                  borderBottom:
                    index < detailViewModel.positions.length - 1
                      ? `1px solid ${colors.border}`
                      : 'none',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {pos.canNavigateToAsset && pos.assetId ? (
                    <Link
                      href={`/portfolio/assets/${pos.assetId}?portfolioId=${activePortfolioId}`}
                      style={{ color: colors.accent, textDecoration: 'none', fontWeight: 700 }}
                    >
                      {pos.assetTicker}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 700, color: colors.textPrimary }}>
                      {pos.assetTicker}
                    </span>
                  )}
                  {pos.assetName && pos.assetName !== pos.assetTicker && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: colors.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pos.assetName}
                    </div>
                  )}
                  {pos.isCostBasisIncomplete && (
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant="warning">Custo incompleto</Badge>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>
                  {pos.quantity}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    color: pos.isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                  }}
                >
                  {pos.averageCost}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: pos.isCostBasisIncomplete ? colors.textMuted : colors.textPrimary,
                  }}
                >
                  {pos.totalCost}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AccountDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: `${spacing.xl}px ${spacing.base}px`,
          }}
        >
          <Skeleton width="180px" height="24px" />
        </div>
      }
    >
      <AccountDetailContent />
    </React.Suspense>
  );
}
