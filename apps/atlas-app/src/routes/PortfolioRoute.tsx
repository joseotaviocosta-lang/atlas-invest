import React, { useState } from 'react';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import { PortfolioSummaryCards } from '../features/portfolio/components/PortfolioSummaryCards';
import { PositionsTable } from '../features/portfolio/components/PositionsTable';
import { AllocationSection } from '../features/portfolio/components/AllocationSection';
import { PerformanceSection } from '../features/portfolio/components/PerformanceSection';
import { HistorySection } from '../features/portfolio/components/HistorySection';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { Card, EmptyState, Badge } from '../components/ui';
import { colors, borderRadius } from '@atlas/ui';

type PortfolioTab = 'positions' | 'allocation' | 'performance' | 'history';

export const PortfolioRoute: React.FC = () => {
  const { selectedPortfolio, selectedPortfolioId, portfolios, isLoadingPortfolios } = usePortfolio();
  const { data: valuationRes, isLoading: isLoadingValuation, isStale } =
    usePortfolioValuation(selectedPortfolioId);
  const [activeTab, setActiveTab] = useState<PortfolioTab>('positions');

  const valuation = valuationRes?.data ?? null;
  const positions = valuation?.positions ?? [];

  if (!isLoadingPortfolios && portfolios.length === 0) {
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
          {isStale && (
            <Badge variant="warning">
              <span style={{ marginRight: '4px' }}>⚠️</span> Cotações D-1
            </Badge>
          )}
          <ManualRefreshButton variant="primary" />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: '24px',
          paddingBottom: '4px',
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
                padding: '10px 18px',
                fontSize: '0.875rem',
                fontWeight: 600,
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
          <PortfolioSummaryCards valuation={valuation} isLoading={isLoadingValuation} />
          <PositionsTable positions={positions} isLoading={isLoadingValuation} />
        </div>
      )}

      {activeTab === 'allocation' && <AllocationSection />}

      {activeTab === 'performance' && <PerformanceSection />}

      {activeTab === 'history' && <HistorySection />}
    </div>
  );
};
