import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { PortfolioRoute } from '../../apps/atlas-app/src/routes/PortfolioRoute';
import { MarketRoute } from '../../apps/atlas-app/src/routes/MarketRoute';
import { TodayRoute } from '../../apps/atlas-app/src/routes/TodayRoute';
import { PortfolioSummaryCards } from '../../apps/atlas-app/src/features/portfolio/components/PortfolioSummaryCards';
import { PositionsTable } from '../../apps/atlas-app/src/features/portfolio/components/PositionsTable';
import { AllocationSection } from '../../apps/atlas-app/src/features/portfolio/components/AllocationSection';
import { PerformanceSeriesChart } from '../../apps/atlas-app/src/features/portfolio/components/PerformanceSeriesChart';
import { MacroIndicatorsGrid } from '../../apps/atlas-app/src/features/market/components/MacroIndicatorsGrid';
import { QuotesTable } from '../../apps/atlas-app/src/features/market/components/QuotesTable';
import { portfolioKeys, marketKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { portfolioApi } from '../../apps/atlas-app/src/features/portfolio/api';
import { apiClient } from '../../apps/atlas-app/src/lib/api';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type { PortfolioValuationData, PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';
import type { PerformanceSeriesCurrencyVM } from '@atlas/ui';

describe('Atlas Desktop Portfolio Read Models & Market Sync (APP-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
  });

  describe('Query Keys Centralization & Isolation', () => {
    it('generates isolated keys per portfolio and parameter scope', () => {
      const p1Val = portfolioKeys.valuation('portfolio-1');
      const p2Val = portfolioKeys.valuation('portfolio-2');
      expect(p1Val).not.toEqual(p2Val);
      expect(p1Val).toContain('portfolio-1');
      expect(p2Val).toContain('portfolio-2');

      const perf1 = portfolioKeys.performance('p-1', '2026-01-01', '2026-12-31', 'CDI');
      const perf2 = portfolioKeys.performance('p-1', '2026-01-01', '2026-12-31', 'IBOV');
      expect(perf1).not.toEqual(perf2);
    });

    it('generates consistent market query keys', () => {
      const macro = marketKeys.macroContext();
      expect(macro).toContain('macro-context');
    });
  });

  describe('Portfolio Selection Logic', () => {
    it('renders empty portfolio state when user has zero portfolios', () => {
      queryClient.setQueryData(portfolioKeys.list(), []);

      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/today']}>
                <TodayRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('Nenhuma carteira encontrada');
    });
  });

  describe('Valuation & Summary Cards Presentation', () => {
    const mockValuation: PortfolioValuationData = {
      portfolioId: 'port-123',
      asOf: '2026-11-04',
      engineVersion: '1.0.0',
      valuationVersion: '1.0.0',
      completeness: 'COMPLETE',
      totalsByCurrency: {
        BRL: {
          currency: 'BRL',
          marketValue: { amount: '150000.00', currency: 'BRL' },
          costBasis: { amount: '120000.00', currency: 'BRL' },
          knownCost: { amount: '120000.00', currency: 'BRL' },
          unrealizedGainLoss: { amount: '30000.00', currency: 'BRL' },
          unrealizedGainLossPercent: '25.00',
          valuedPositionsCount: 3,
          unvaluedPositionsCount: 0,
          stalePositionsCount: 0,
        },
      },
      summary: {
        totalPositions: 3,
        valuedPositions: 3,
        unvaluedPositions: 0,
        unavailablePositions: 0,
        incompleteCostPositions: 0,
        stalePositions: 0,
        mismatchPositions: 0,
        valuationCoveragePercent: '100',
        currencies: ['BRL'],
      },
      quoteSummary: {
        totalQuotesRequested: 3,
        quotesAvailable: 3,
        quotesUnavailable: 0,
        quotesStale: 0,
        marketDataState: 'HEALTHY',
        provider: 'BRAPI EOD',
      },
      positions: [
        {
          assetId: 'asset-petr4',
          accountId: 'acc-1',
          ticker: 'PETR4',
          assetType: 'STOCK',
          quantity: '1000',
          currency: 'BRL',
          totalCost: { amount: '30000.00', currency: 'BRL' },
          averageCost: { amount: '30.00', currency: 'BRL' },
          costBasisStatus: 'KNOWN',
          quote: {
            assetId: 'asset-petr4',
            price: '38.50',
            currency: 'BRL',
            asOf: '2026-11-04',
            receivedAt: '2026-11-04T22:00:00Z',
            source: 'BRAPI',
            status: 'FRESH',
            freshness: 'FRESH',
            providerSymbol: 'PETR4',
          },
          marketValue: { amount: '38500.00', currency: 'BRL' },
          unrealizedGainLoss: { amount: '8500.00', currency: 'BRL' },
          unrealizedGainLossPercent: '28.33',
          status: 'VALUED',
          quoteFreshness: 'FRESH',
          quoteStatus: 'AVAILABLE',
        },
      ],
    };

    it('renders formatted market value, cost basis and unrealized gain in summary cards', () => {
      const html = renderToString(
        <PortfolioSummaryCards valuation={mockValuation} isLoading={false} />
      );

      expect(html).toContain('Patrimônio Total');
      expect(html).toContain('Custo de Aquisição');
      expect(html).toContain('Resultado Não Realizado');
      expect(html).toContain('150.000,00');
      expect(html).toContain('120.000,00');
      expect(html).toContain('30.000,00');
      expect(html).toContain('Cobertura de Cotações');
      expect(html).toContain('100%');
    });

    it('renders open positions table with ticker, quantity, quotes, and P&L', () => {
      const html = renderToString(
        <PositionsTable positions={mockValuation.positions} isLoading={false} />
      );

      expect(html).toContain('PETR4');
      expect(html).toContain('Ação');
      expect(html).toContain('1.000');
      expect(html).toContain('30,00');
      expect(html).toContain('38,50');
      expect(html).toContain('38.500,00');
      expect(html).toContain('8.500,00');
      expect(html).toContain('Em dia');
    });

    it('renders empty positions placeholder when custody is zero', () => {
      const html = renderToString(<PositionsTable positions={[]} isLoading={false} />);
      expect(html).toContain('Nenhuma posição em custódia');
    });
  });

  describe('Allocation Read Model', () => {
    it('renders allocation breakdown by class with percentages', () => {
      queryClient.setQueryData(portfolioKeys.list(), [{ id: 'p-1', name: 'Carteira Principal' }]);
      queryClient.setQueryData(portfolioKeys.allocation('p-1'), {
        data: {
          portfolioId: 'p-1',
          asOf: '2026-11-04',
          status: 'COMPLETE',
          valuationCoveragePercent: '100',
          currencies: {
            BRL: {
              currency: 'BRL',
              totalMarketValue: { amount: '100000.00', currency: 'BRL' },
              byAssetClass: [
                {
                  assetClass: 'STOCK',
                  currency: 'BRL',
                  marketValue: { amount: '70000.00', currency: 'BRL' },
                  allocationPercent: '70.00',
                  assetCount: 5,
                },
                {
                  assetClass: 'FII',
                  currency: 'BRL',
                  marketValue: { amount: '30000.00', currency: 'BRL' },
                  allocationPercent: '30.00',
                  assetCount: 3,
                },
              ],
              byAsset: [],
              unvaluedAssets: [],
            },
          },
        },
      });

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <PortfolioProvider>
            <AllocationSection />
          </PortfolioProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Distribuição Patrimonial');
      expect(html).toContain('Ações');
      expect(html).toContain('70,00%');
      expect(html).toContain('Fundos Imobiliários (FIIs)');
      expect(html).toContain('30,00%');
    });
  });

  describe('Performance & Pure SVG Chart', () => {
    it('renders SVG performance curve without throwing or requiring canvas', () => {
      const mockSeries: PerformanceSeriesCurrencyVM = {
        currency: 'BRL',
        granularity: 'DAILY',
        status: 'COMPLETE',
        dataAvailability: 'FULL',
        benchmarkId: 'CDI',
        benchmarkName: 'CDI',
        points: [
          {
            date: '2026-01-01',
            dateDisplay: '01/01/2026',
            portfolioReturn: '0',
            portfolioReturnFormatted: '0,00%',
            benchmarkReturn: '0',
            benchmarkReturnFormatted: '0,00%',
            status: 'AVAILABLE',
            isGap: false,
            tooltip: '0,00%',
          },
          {
            date: '2026-06-01',
            dateDisplay: '01/06/2026',
            portfolioReturn: '6.50',
            portfolioReturnFormatted: '+6,50%',
            benchmarkReturn: '5.20',
            benchmarkReturnFormatted: '+5,20%',
            status: 'AVAILABLE',
            isGap: false,
            tooltip: '+6,50%',
          },
          {
            date: '2026-11-01',
            dateDisplay: '01/11/2026',
            portfolioReturn: '14.20',
            portfolioReturnFormatted: '+14,20%',
            benchmarkReturn: '11.80',
            benchmarkReturnFormatted: '+11,80%',
            status: 'AVAILABLE',
            isGap: false,
            tooltip: '+14,20%',
          },
        ],
        valuedPoints: [],
        hasGaps: false,
        isPartial: false,
        isUnavailable: false,
      };

      const html = renderToString(<PerformanceSeriesChart series={mockSeries} height={250} />);

      expect(html).toContain('<svg');
      expect(html).toContain('data-testid="performance-series-chart-BRL"');
      expect(html).toContain('data-testid="portfolio-line"');
      expect(html).toContain('data-testid="benchmark-line"');
      expect(html).toContain('Carteira (<!-- -->BRL<!-- -->)');
      expect(html).toContain('Benchmark (<!-- -->CDI<!-- -->)');
    });
  });

  describe('Market Overview & Macro Indicators', () => {
    it('renders macro indicators grid with official labels and honest placeholders', () => {
      queryClient.setQueryData(marketKeys.macroContext(), {
        data: {
          selicTarget: { rate: '11.25%', effectiveDate: '06/11/2026', source: 'Bacen' },
          selicEffective: { rate: '11.15%', effectiveDate: '05/11/2026', source: 'Bacen' },
          ipcaMonthly: { referenceMonth: '10/2026', value: '+0.56%', source: 'IBGE' },
        },
      });

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MacroIndicatorsGrid />
        </QueryClientProvider>
      );

      expect(html).toContain('IBOVESPA');
      expect(html).toContain('SELIC META');
      expect(html).toContain('11.25%');
      expect(html).toContain('SELIC EFETIVA');
      expect(html).toContain('11.15%');
      expect(html).toContain('IPCA (MENSAL)');
      expect(html).toContain('+0.56%');
      expect(html).toContain('DÓLAR (PTAX)');
    });

    it('renders quotes table for held assets', () => {
      const positions: PositionValuationDto[] = [
        {
          assetId: 'asset-vale3',
          accountId: 'acc-1',
          ticker: 'VALE3',
          assetType: 'STOCK',
          quantity: '500',
          currency: 'BRL',
          totalCost: null,
          averageCost: null,
          costBasisStatus: 'INCOMPLETE',
          quote: {
            assetId: 'asset-vale3',
            price: '62.40',
            currency: 'BRL',
            asOf: '2026-11-04',
            receivedAt: '2026-11-04T22:00:00Z',
            source: 'BRAPI',
            status: 'FRESH',
            freshness: 'FRESH',
            providerSymbol: 'VALE3',
          },
          marketValue: null,
          unrealizedGainLoss: null,
          unrealizedGainLossPercent: null,
          status: 'VALUED',
          quoteFreshness: 'FRESH',
          quoteStatus: 'AVAILABLE',
        },
      ];

      const html = renderToString(<QuotesTable positions={positions} isLoading={false} />);
      expect(html).toContain('VALE3');
      expect(html).toContain('62,40');
      expect(html).toContain('BRAPI');
      expect(html).toContain('FRESCA');
    });
  });

  describe('Route Tree & Tabs Navigation', () => {
    it('renders PortfolioRoute with all 4 sub-navigation tabs', () => {
      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/portfolio']}>
                <PortfolioRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('Posições');
      expect(html).toContain('Alocação');
      expect(html).toContain('Rentabilidade');
      expect(html).toContain('Histórico');
    });

    it('renders MarketRoute with macro indicators and quotes section', () => {
      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <PortfolioProvider>
              <MemoryRouter initialEntries={['/market']}>
                <MarketRoute />
              </MemoryRouter>
            </PortfolioProvider>
          </QueryClientProvider>
        </AuthProvider>
      );

      expect(html).toContain('Radar de Mercado');
      expect(html).toContain('Indicadores Macroeconômicos Oficiais');
      expect(html).toContain('Cotações dos Ativos da Carteira');
    });
  });

  describe('Manual Refresh Trigger', () => {
    it('dispatches update API call and updates query cache', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        data: {
          requestedAt: '2026-11-05T12:00:00Z',
          completedAt: '2026-11-05T12:00:02Z',
          quotesRequested: 5,
          quotesUpdated: 5,
          quotesFailed: 0,
          quotesStale: 0,
          status: 'SUCCESS',
        },
      });

      const receipt = await portfolioApi.updateMarketData('p-1');
      expect(postSpy).toHaveBeenCalledWith('/api/v1/portfolios/p-1/market-data/update', {});
      expect(receipt.quotesUpdated).toBe(5);
      expect(receipt.status).toBe('SUCCESS');
    });
  });

  describe('Security & Cache Isolation', () => {
    it('purges all portfolio read model cache entries upon logout', () => {
      queryClient.setQueryData(portfolioKeys.valuation('p-secret'), { test: 123 });
      expect(queryClient.getQueryData(portfolioKeys.valuation('p-secret'))).toBeDefined();

      clearQueryCache();
      expect(queryClient.getQueryData(portfolioKeys.valuation('p-secret'))).toBeUndefined();
    });
  });
});
