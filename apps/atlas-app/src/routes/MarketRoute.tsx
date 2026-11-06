import React from 'react';
import { useAuth } from '../providers/AuthProvider';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import { MacroIndicatorsGrid } from '../features/market/components/MacroIndicatorsGrid';
import { QuotesTable } from '../features/market/components/QuotesTable';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { Badge, PullToRefresh, OfflineBanner } from '../components/ui';
import { colors, formatDate } from '@atlas/ui';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { LocalCache, LocalCacheKeys } from '../lib/local-cache';
import type { PortfolioValuationData } from '../features/portfolio/types';

export const MarketRoute: React.FC = () => {
  const { user } = useAuth();
  const { selectedPortfolioId } = usePortfolio();
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
  const positions = effectiveValuation?.positions ?? [];
  const quoteSummary = effectiveValuation?.quoteSummary;
  const asOfFormatted = effectiveValuation?.asOf ? formatDate(effectiveValuation.asOf) : null;

  const handlePullRefresh = async () => {
    if (isOnline) {
      await refetch();
      await triggerManualSync();
    }
  };

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Offline Warning Banner */}
        <OfflineBanner isOffline={!isOnline} lastSyncFormatted={asOfFormatted} />

        {/* Page Header */}
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
              Radar de Mercado
            </h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
              Indicadores macroeconômicos e cotações de fechamento (EOD) dos ativos custodiados
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

        {/* Macro Indicators */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, color: colors.textPrimary }}>
              Indicadores Macroeconômicos Oficiais
            </h3>
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
              Atualização diária / Bacen & IBGE
            </span>
          </div>
          <MacroIndicatorsGrid />
        </div>

        {/* Quotes Section */}
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
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.0625rem', fontWeight: 600, color: colors.textPrimary }}>
                Cotações dos Ativos da Carteira
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary }}>
                Provedor: {quoteSummary?.provider || 'BRAPI EOD'} • {asOfFormatted ? `Cotações de ${asOfFormatted}` : 'Aguardando sincronização'}
              </p>
            </div>

            <Badge variant={quoteSummary && quoteSummary.quotesAvailable < quoteSummary.totalQuotesRequested ? 'warning' : 'neutral'}>
              {quoteSummary ? `${quoteSummary.quotesAvailable} de ${quoteSummary.totalQuotesRequested} precificados` : 'Carregando...'}
            </Badge>
          </div>

          <QuotesTable positions={positions} isLoading={isLoadingValuation && !effectiveValuation} />
        </div>
      </div>
    </PullToRefresh>
  );
};
