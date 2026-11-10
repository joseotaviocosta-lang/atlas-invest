import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunityRadarSection } from '../../apps/atlas-app/src/features/portfolio/components/OpportunityRadarSection';
import { OpportunityAnalysisModal } from '../../apps/atlas-app/src/features/portfolio/components/OpportunityAnalysisModal';
import type { OpportunityRadarResponseDto, OpportunityRadarItemDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('PROJECT ATLAS — APP-16F: Daily Opportunity Radar (Frontend Components)', () => {
  let queryClient: QueryClient;
  const portfolioId = '00000000-0000-4000-8000-000000000002';

  const mockItem1: OpportunityRadarItemDto = {
    ticker: 'ITUB4',
    name: 'Itaú Unibanco PN',
    assetId: 'asset-itub4',
    assetType: 'STOCK',
    currentPrice: '36.50',
    dailyChangePercent: 0.85,
    portfolioWeight: 4.8,
    portfolioQuantity: '120',
    marketValue: '4380.00',
    score: 86,
    confidence: 'HIGH',
    components: {
      portfolioFit: 92,
      valuation: 85,
      momentum: 82,
      priceOpportunity: 88,
      news: 80,
      outlook: 90,
    },
    positives: [
      'Valuation atrativo com múltiplos descontados em relação ao histórico',
      'Margem para novo aporte sem ultrapassar teto de concentração na carteira',
      'ROE elevado e rentabilidade consistente',
    ],
    risks: [
      'Volatilidade de curto prazo decorrente do cenário de juros',
    ],
    news: [
      {
        id: 'news-1',
        headline: 'Itaú reporta lucro líquido recorde no trimestre',
        source: 'Valor Econômico',
        publishedAt: '2026-11-09T14:30:00.000Z',
        canonicalUrl: 'https://valor.globo.com/itub4',
        sentiment: 'POSITIVE',
        relevance: 0.9,
      },
    ],
    dataFreshness: 'FRESH',
    updatedAt: '2026-11-10T09:00:00.000Z',
  };

  const mockItem2: OpportunityRadarItemDto = {
    ticker: 'HGLG11',
    name: 'CSHG Logística FII',
    assetId: 'asset-hglg11',
    assetType: 'FII',
    currentPrice: '162.40',
    dailyChangePercent: -0.25,
    portfolioWeight: 6.2,
    portfolioQuantity: '50',
    marketValue: '8120.00',
    score: 81,
    confidence: 'HIGH',
    components: {
      portfolioFit: 88,
      valuation: 80,
      momentum: 75,
      priceOpportunity: 78,
      news: 70,
      outlook: 85,
    },
    positives: [
      'P/VP favorável próximo ou abaixo da média histórica do fundo',
      'Dividend Yield atrativo com previsibilidade de rendimentos mensais',
    ],
    risks: [
      'Risco de vacância física ou inadimplência pontual em galpões específicos',
    ],
    news: [],
    dataFreshness: 'FRESH',
    updatedAt: '2026-11-10T09:00:00.000Z',
  };

  const mockRadarResponse: OpportunityRadarResponseDto = {
    portfolioId,
    analysisDate: '2026-11-10',
    updatedAt: '2026-11-10T09:00:00.000Z',
    modelVersion: 'opportunity-v1',
    totalEligible: 36,
    totalRanked: 2,
    items: [mockItem1, mockItem2],
    disclaimer: 'Radar meramente informativo...',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders section header, badges, cards, metrics, and disclaimer', () => {
    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: mockRadarResponse,
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Section title & badges
    expect(html).toContain('Oportunidades de Hoje');
    expect(html).toContain('TOP 2');
    expect(html).toContain('Ativos da sua carteira que merecem atenção');

    // Cards content
    expect(html).toContain('ITUB4');
    expect(html).toContain('Itaú Unibanco PN');
    expect(html).toContain('HGLG11');
    expect(html).toContain('CSHG Logística FII');

    // Scores & Ranks
    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('86');
    expect(html).toContain('81');

    // Key metrics
    expect(html).toContain('36,50');
    expect(html).toContain('+0.85%');
    expect(html).toContain('4,80%');
    expect(html).toContain('120');

    // Favorable points & risks
    expect(html).toContain('Valuation atrativo');
    expect(html).toContain('P/VP favorável');
    expect(html).toContain('Volatilidade de curto prazo');
    expect(html).toContain('Risco de vacância física');

    // Action button
    expect(html).toContain('Ver análise completa →');

    // Disclaimer
    expect(html).toContain('Radar Informativo:');
    expect(html).toContain('Não constitui recomendação de investimento');

    // STRICT INVARIANT: ZERO BUY BUTTON
    expect(html).not.toMatch(/<button[^>]*>.*Comprar.*<\/button>/i);
    expect(html).not.toMatch(/<button[^>]*>.*Executar Ordem.*<\/button>/i);
  });

  it('renders loading state when radar is fetching without cached data', () => {
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('Calculando ranking do Radar de Oportunidades');
  });

  it('renders empty state when no items meet criteria', () => {
    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        items: [],
        totalRanked: 0,
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('Nenhum ativo da carteira atingiu a pontuação mínima');
  });

  it('renders OpportunityAnalysisModal with complete score breakdown and zero buy button', () => {
    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={() => {}}
        item={mockItem1}
      />
    );

    expect(html).toContain('Análise de Oportunidade: ITUB4');
    expect(html).toContain('Opportunity Score');
    expect(html).toContain('86');
    expect(html).toContain('Alta Convicção');

    // Score components
    expect(html).toContain('Capacidade na Carteira (Portfolio Fit)');
    expect(html).toContain('Valuation &amp; Fundamentos');
    expect(html).toContain('Tendência &amp; Momentum');
    expect(html).toContain('Oportunidade de Preço');
    expect(html).toContain('Notícias &amp; Fatos Relevantes');

    // Positives and risks
    expect(html).toContain('Valuation atrativo com múltiplos descontados');
    expect(html).toContain('Volatilidade de curto prazo decorrente do cenário de juros');

    // News
    expect(html).toContain('Notícias Consideradas');
    expect(html).toContain('Itaú reporta lucro líquido recorde no trimestre');
    expect(html).toContain('Valor Econômico');

    // Close button only
    expect(html).toContain('Fechar');
    expect(html).not.toMatch(/<button[^>]*>.*Comprar.*<\/button>/i);
    expect(html).not.toMatch(/<button[^>]*>.*Confirmar Compra.*<\/button>/i);
  });

  // APP-16G-R3: UI consistency when news score is null (—)
  it('renders OpportunityAnalysisModal with honest fallback when news score is null and news list is empty', () => {
    const itemWithoutNews = {
      ...mockItem1,
      ticker: 'FESA4',
      name: 'Ferbasa PN',
      components: {
        ...mockItem1.components,
        news: null,
      },
      news: [],
    };

    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={() => {}}
        item={itemWithoutNews}
      />
    );

    // Score component displays dash —
    expect(html).toContain('Notícias &amp; Fatos Relevantes');
    expect(html).toContain('—');

    // Section does NOT say "Notícias Consideradas"
    expect(html).not.toContain('Notícias Consideradas');

    // Displays clear honest message
    expect(html).toContain('Nenhuma notícia recente considerada nesta análise.');
  });

  // APP-16H: Top 5 FIIs Opportunity Radar UI
  it('APP-16H: renders segment control tabs with proper accessibility attributes', () => {
    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [mockItem2],
        fiiCoveragePercent: 75,
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Tablist exists
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Visualizações do Radar de Oportunidades"');

    // Both tabs exist
    expect(html).toContain('data-testid="radar-tab-general"');
    expect(html).toContain('data-testid="radar-tab-fii"');
    expect(html).toContain('Top 5 Geral');
    expect(html).toContain('Top 5 FIIs');

    // Default tab is Top 5 Geral
    expect(html).toContain('id="tab-radar-general" aria-selected="true"');
    expect(html).toContain('id="tab-radar-fii" aria-selected="false"');

    // Tabpanel exists with matching aria
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="panel-radar-content"');
  });

  it('APP-16H: displays cotas for FII items and un. for stock items', () => {
    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        items: [mockItem1, mockItem2],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Stock displays un.
    expect(html).toContain('120 un.');
    // FII displays cotas
    expect(html).toContain('50 cotas');
  });
});
