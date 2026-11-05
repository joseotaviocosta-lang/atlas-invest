import React from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import { PortfolioSummaryCards } from '../features/portfolio/components/PortfolioSummaryCards';
import { PositionsTable } from '../features/portfolio/components/PositionsTable';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { MacroIndicatorsGrid } from '../features/market/components/MacroIndicatorsGrid';
import { Card, EmptyState, Badge, Button } from '../components/ui';
import { colors, formatDate } from '@atlas/ui';
import { useAuth } from '../providers/AuthProvider';

export const TodayRoute: React.FC = () => {
  const { user } = useAuth();
  const { selectedPortfolio, selectedPortfolioId, portfolios, isLoadingPortfolios } = usePortfolio();
  const { data: valuationRes, isLoading: isLoadingValuation, isStale } =
    usePortfolioValuation(selectedPortfolioId);

  const valuation = valuationRes?.data ?? null;
  const positions = valuation?.positions ?? [];
  const topPositions = positions.slice(0, 5);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Investidor';
  const asOfFormatted = valuation?.asOf ? formatDate(valuation.asOf) : null;

  if (!isLoadingPortfolios && portfolios.length === 0) {
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
          {isStale && (
            <Badge variant="warning">
              <span style={{ marginRight: '4px' }}>⚠️</span> Cotações D-1
            </Badge>
          )}
          <ManualRefreshButton variant="primary" />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <PortfolioSummaryCards valuation={valuation} isLoading={isLoadingValuation} />

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
            <Button variant="outline" size="sm">
              Ver Carteira Completa ({positions.length}) →
            </Button>
          </Link>
        </div>

        <PositionsTable
          positions={topPositions}
          isLoading={isLoadingValuation}
        />
      </div>
    </div>
  );
};
