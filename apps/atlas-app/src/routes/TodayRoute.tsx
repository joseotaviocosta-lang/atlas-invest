import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import { PortfolioSummaryCards } from '../features/portfolio/components/PortfolioSummaryCards';
import { PositionsTable } from '../features/portfolio/components/PositionsTable';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { MacroIndicatorsGrid } from '../features/market/components/MacroIndicatorsGrid';
import { Card, EmptyState, Badge, Button, PullToRefresh, OfflineBanner } from '../components/ui';
import { colors, formatDate, spacing } from '@atlas/ui';
import { useAuth } from '../providers/AuthProvider';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { LocalCache, LocalCacheKeys } from '../lib/local-cache';
import { getRuntimeConfig } from '../config/runtime';
import { exportDiagnostics } from '../lib/diagnostics';
import type { PortfolioValuationData } from '../features/portfolio/types';

export const TodayRoute: React.FC = () => {
  const { user } = useAuth();
  const config = getRuntimeConfig();
  const {
    selectedPortfolio,
    selectedPortfolioId,
    portfolios,
    isLoadingPortfolios,
    isErrorPortfolios,
    refetchPortfolios,
  } = usePortfolio();
  const { isOnline, triggerManualSync } = useAppLifecycle();
  const { data: valuationRes, isLoading: isLoadingValuation, isStale: queryIsStale, refetch } =
    usePortfolioValuation(selectedPortfolioId);

  const valuation = valuationRes?.data ?? null;

  // Fast Startup / Offline read: retrieve last known good snapshot if available
  const cachedValuation = React.useMemo(() => {
    if (user?.id && selectedPortfolioId) {
      const res = LocalCache.getResource<PortfolioValuationData>(user.id, 'portfolio_valuation', selectedPortfolioId);
      if (res?.data) return res.data;
    }
    const legacy = LocalCache.get<PortfolioValuationData>(LocalCacheKeys.PORTFOLIO_VALUATION);
    return legacy?.data ?? null;
  }, [user?.id, selectedPortfolioId]);

  const effectiveValuation = valuation ?? cachedValuation;
  const isStale = queryIsStale || (effectiveValuation?.quoteSummary?.quotesStale ?? 0) > 0;

  // Cache valuation snapshot for offline fast startup
  useEffect(() => {
    if (valuation) {
      if (user?.id && selectedPortfolioId) {
        LocalCache.setResource(user.id, 'portfolio_valuation', valuation, {
          portfolioId: selectedPortfolioId,
        });
      }
      LocalCache.set(LocalCacheKeys.PORTFOLIO_VALUATION, valuation, { userId: user?.id });
      LocalCache.set(LocalCacheKeys.LAST_SYNC_TIMESTAMP, Date.now(), { userId: user?.id });
    }
  }, [valuation, user?.id, selectedPortfolioId]);

  const positions = effectiveValuation?.positions ?? [];
  const topPositions = positions.slice(0, 5);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Investidor';
  const asOfFormatted = effectiveValuation?.asOf ? formatDate(effectiveValuation.asOf) : null;

  const handlePullRefresh = async () => {
    if (isOnline) {
      await refetch();
      await triggerManualSync();
    }
  };

  // PARTE T: Startup Failure when backend data service is unavailable
  if (isErrorPortfolios && !effectiveValuation) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }} data-testid="startup-failure-view">
        <Card>
          <div style={{ textAlign: 'center', padding: `${spacing.xl}px ${spacing.md}px` }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: `${colors.negative}15`,
                color: colors.negative,
                marginBottom: `${spacing.md}px`,
                fontSize: '24px',
              }}
            >
              ⚠
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary, margin: `0 0 ${spacing.xs}px 0` }}>
              O Atlas não conseguiu iniciar o serviço de dados.
            </h2>
            <p style={{ margin: `0 auto ${spacing.md}px auto`, fontSize: '0.875rem', color: colors.textSecondary, maxWidth: '540px', lineHeight: 1.5 }}>
              Não foi possível estabelecer comunicação com o serviço de dados ({config.dataBackendLabel}).
              Verifique a conectividade com o backend ou tente novamente.
            </p>
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" onClick={() => refetchPortfolios()} data-testid="retry-backend-btn">
                Tentar novamente
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await exportDiagnostics({ isAuthenticated: true, hasActivePortfolio: false });
                }}
                data-testid="export-diagnostics-btn"
              >
                Exportar Diagnóstico
              </Button>
            </div>
            <div style={{ marginTop: `${spacing.md}px`, fontSize: '0.75rem', color: colors.textSecondary }}>
              Status do serviço: {isOnline ? 'Online (Falha de resposta da API)' : 'Dispositivo desconectado (Offline)'}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!isLoadingPortfolios && portfolios.length === 0) {
    if (!isOnline && !effectiveValuation) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <Card>
            <EmptyState
              title="Sem dados disponíveis offline"
              description="Conecte-se à internet para sincronizar suas carteiras e posições com o servidor Atlas."
            />
          </Card>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Card>
          <EmptyState
            title="Nenhuma carteira encontrada"
            description="Você ainda não possui carteiras cadastradas. Crie uma carteira para começar a acompanhar seu patrimônio."
          />
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Offline Warning Banner */}
        <OfflineBanner isOffline={!isOnline} lastSyncFormatted={asOfFormatted} />

        {/* PARTE R: Startup Loading Banner when preparing local data service */}
        {isLoadingPortfolios && !effectiveValuation && (
          <div style={{ marginBottom: `${spacing.md}px` }} data-testid="startup-loading-view">
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: `2px solid ${colors.surfaceElevated}`,
                    borderTopColor: colors.accent,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  Iniciando Atlas... Preparando serviço de dados local ({config.dataBackendLabel})
                </span>
              </div>
            </Card>
          </div>
        )}

        {/* Header with Greeting & Action */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 4px 0',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.02em',
              }}
            >
              Olá, {firstName}!
            </h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
              Resumo executivo da carteira <strong>{selectedPortfolio?.name || 'Principal'}</strong>
              {asOfFormatted && ` • Cotações até ${asOfFormatted}`}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isOnline && (
              <Badge variant="warning">
                <span style={{ marginRight: '4px' }}>📡</span> Offline
              </Badge>
            )}
            {isStale && (
              <Badge variant="warning">
                <span style={{ marginRight: '4px' }}>⚠️</span> Cotações D-1
              </Badge>
            )}
            <ManualRefreshButton variant="primary" />
          </div>
        </div>

        {/* Summary KPI Cards */}
        <PortfolioSummaryCards valuation={effectiveValuation} isLoading={isLoadingValuation && !effectiveValuation} />

        {/* Macro Indicators Bar */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
              Contexto Macroeconômico Oficial
            </h3>
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
              Bacen / Copom / IBGE
            </span>
          </div>
          <MacroIndicatorsGrid />
        </div>

        {/* Main Asset Snapshot Section */}
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
                Principais Posições em Custódia
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary }}>
                Visualizando os maiores ativos por volume financeiro
              </p>
            </div>

            <Link to="/portfolio" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm" style={{ minHeight: '44px' }}>
                Ver Carteira Completa ({positions.length}) →
              </Button>
            </Link>
          </div>

          <PositionsTable
            positions={topPositions}
            isLoading={isLoadingValuation && !effectiveValuation}
            totalMarketValue={
              effectiveValuation?.totalsByCurrency?.BRL?.marketValue?.amount ||
              effectiveValuation?.totalsByCurrency?.[Object.keys(effectiveValuation?.totalsByCurrency ?? {})[0] || '']?.marketValue?.amount
            }
          />
        </div>
      </div>
    </PullToRefresh>
  );
};
