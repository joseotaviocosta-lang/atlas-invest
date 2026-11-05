import React, { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import { PortfolioSummaryCards } from '../features/portfolio/components/PortfolioSummaryCards';
import { PositionsTable } from '../features/portfolio/components/PositionsTable';
import { AllocationSection } from '../features/portfolio/components/AllocationSection';
import { PerformanceSection } from '../features/portfolio/components/PerformanceSection';
import { HistorySection } from '../features/portfolio/components/HistorySection';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { Card, EmptyState, Badge, PullToRefresh, OfflineBanner } from '../components/ui';
import { colors, borderRadius, formatDate } from '@atlas/ui';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { LocalCache, LocalCacheKeys } from '../lib/local-cache';
import type { PortfolioValuationData } from '../features/portfolio/types';

type PortfolioTab = 'positions' | 'allocation' | 'performance' | 'history';

export const PortfolioRoute: React.FC = () => {
  const { user } = useAuth();
  const { selectedPortfolio, selectedPortfolioId, portfolios, isLoadingPortfolios } = usePortfolio();
  const { isOnline, triggerManualSync } = useAppLifecycle();
  const { data: valuationRes, isLoading: isLoadingValuation, isStale: queryIsStale, refetch } =
    usePortfolioValuation(selectedPortfolioId);
  const [activeTab, setActiveTab] = useState<PortfolioTab>('positions');

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
  const asOfFormatted = effectiveValuation?.asOf ? formatDate(effectiveValuation.asOf) : null;

  const totalMarketValue =
    effectiveValuation?.totalsByCurrency?.BRL?.marketValue?.amount ||
    effectiveValuation?.totalsByCurrency?.[Object.keys(effectiveValuation?.totalsByCurrency ?? {})[0] || '']?.marketValue?.amount;

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

  const handlePullRefresh = async () => {
    if (isOnline) {
      await refetch();
      await triggerManualSync();
    }
  };

  if (!isLoadingPortfolios && portfolios.length === 0) {
    if (!isOnline && !effectiveValuation) {
      return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Card>
            <EmptyState
              title="Sem dados disponíveis offline"
              description="Conecte-se à internet para sincronizar sua carteira com o servidor Atlas."
            />
          </Card>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Card>
          <EmptyState
            title="Nenhuma carteira ativa"
            description="Não foram encontradas carteiras cadastradas para este investidor."
          />
        </Card>
      </div>
    );
  }

  const tabs: Array<{ id: PortfolioTab; label: string; icon: string }> = [
    { id: 'positions', label: 'Posições', icon: '📋' },
    { id: 'allocation', label: 'Alocação', icon: '📊' },
    { id: 'performance', label: 'Rentabilidade', icon: '📈' },
    { id: 'history', label: 'Histórico', icon: '📑' },
  ];

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
            marginBottom: '20px',
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
              {selectedPortfolio?.name || 'Carteira de Investimentos'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
              Consolidação patrimonial, cotações oficiais e auditoria do livro-razão
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

        {/* Tabs Navigation (Horizontally scrollable on mobile touch screens) */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: `1px solid ${colors.border}`,
            marginBottom: '24px',
            paddingBottom: '4px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                data-testid={`portfolio-tab-${tab.id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  minHeight: '48px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: isActive ? colors.accent : colors.textSecondary,
                  backgroundColor: isActive ? `${colors.accent}15` : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
                  borderRadius: `${borderRadius.md}px ${borderRadius.md}px 0 0`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        {activeTab === 'positions' && (
          <div>
            <PortfolioSummaryCards valuation={effectiveValuation} isLoading={isLoadingValuation && !effectiveValuation} />
            <PositionsTable
              positions={positions}
              isLoading={isLoadingValuation && !effectiveValuation}
              totalMarketValue={totalMarketValue}
            />
          </div>
        )}

        {activeTab === 'allocation' && <AllocationSection />}

        {activeTab === 'performance' && <PerformanceSection />}

        {activeTab === 'history' && <HistorySection />}
      </div>
    </PullToRefresh>
  );
};
