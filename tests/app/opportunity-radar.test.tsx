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
    modelVersion: 'opportunity-v2.2',
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

  it('APP-16I: renders FII dividend calendar info on card when available', () => {
    const fiiWithDividend: OpportunityRadarItemDto = {
      ...mockItem2,
      dividendCalendar: {
        ticker: 'HGLG11',
        recordDate: '2026-11-14',
        exDate: '2026-11-17',
        paymentDate: '2026-11-25',
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 4,
        daysUntilPayment: 15,
        sameMonthReinvestmentCandidate: true,
      },
    };

    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        items: [fiiWithDividend],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('data-testid="fii-dividend-calendar-HGLG11"');
    expect(html).toContain('Data-com:');
    expect(html).toContain('14/11');
    expect(html).toContain('Pagamento:');
    expect(html).toContain('25/11');
    expect(html).toContain('1.10');
    expect(html).toContain('Reinvestimento');
  });

  it('APP-16I: OpportunityAnalysisModal renders dedicated FII dividend calendar section with entitlement and reinvestment', () => {
    const fiiWithDividend: OpportunityRadarItemDto = {
      ...mockItem2,
      components: {
        ...mockItem2.components,
        dividendCalendarFit: 95,
      },
      dividendCalendar: {
        ticker: 'HGLG11',
        recordDate: '2026-11-14',
        exDate: '2026-11-17',
        paymentDate: '2026-11-25',
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 4,
        daysUntilPayment: 15,
        sameMonthReinvestmentCandidate: true,
      },
    };

    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={vi.fn()}
        item={fiiWithDividend}
      />
    );

    expect(html).toContain('data-testid="modal-fii-dividend-calendar-section"');
    expect(html).toContain('Calendário de Proventos &amp; Reinvestimento');
    expect(html).toContain('Dentro do período com direito');
    expect(html).toContain('Potencial de Rotação');
    expect(html).toContain('opportunity-v2.2');
  });

  it('14. renders available cash reinvestment badge and data-ex in modal (APP-16I-R1)', () => {
    const fiiWithAvailableCash: OpportunityRadarItemDto = {
      ...mockItem2,
      dividendCalendar: {
        ticker: 'KNRI11',
        recordDate: '2026-11-18',
        exDate: '2026-11-19',
        paymentDate: '2026-11-28',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 8,
        daysUntilPayment: 18,
        sameMonthReinvestmentCandidate: true,
        reinvestmentSourceTicker: 'HGLG11',
        reinvestmentChainType: 'AVAILABLE_CASH_CHAIN',
        cashAvailableNow: true,
        futureCashExpected: false,
      },
    };

    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={vi.fn()}
        item={fiiWithAvailableCash}
      />
    );

    expect(html).toContain('Caixa já disponível: provento recebido de HGLG11');
    expect(html).toContain('19/11/2026'); // Ex-date formatted DD/MM/YYYY
  });

  it('15. renders planned future reinvestment badge and non-informed data-ex in modal (APP-16I-R1)', () => {
    const fiiWithFutureCash: OpportunityRadarItemDto = {
      ...mockItem2,
      dividendCalendar: {
        ticker: 'XPLG11',
        recordDate: '2026-11-20',
        exDate: null,
        paymentDate: '2026-11-30',
        amountPerShare: 0.78,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 10,
        daysUntilPayment: 20,
        sameMonthReinvestmentCandidate: true,
        reinvestmentSourceTicker: 'BTLG11',
        reinvestmentChainType: 'PLANNED_FUTURE_CHAIN',
        cashAvailableNow: false,
        futureCashExpected: true,
      },
    };

    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={vi.fn()}
        item={fiiWithFutureCash}
      />
    );

    expect(html).toContain('Cadeia futura planejada: provento previsto de BTLG11');
    expect(html).toContain('Não informada'); // Ex-date non informed
  });

  // APP-16I-R3: Strategy Visibility & Calendar Diagnostics
  it('PARTE Y & AG: renders strategy toggle when tab is fii, hides it on general tab', () => {
    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [mockItem2],
      },
    });

    // General Tab: Toggle is NOT rendered
    const generalHtml = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="general" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(generalHtml).not.toContain('data-testid="toggle-dividend-strategy-btn"');

    // FII Tab: Toggle IS rendered
    const fiiHtml = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="fii" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(fiiHtml).toContain('data-testid="toggle-dividend-strategy-btn"');
    expect(fiiHtml).toContain('Estratégia de Proventos: Ativa');
  });

  it('PARTE Z: renders explicit compact state on card when eventStatus is UNKNOWN', () => {
    const fiiUnknown: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'MXRF11',
      dividendCalendar: {
        ticker: 'MXRF11',
        recordDate: null,
        exDate: null,
        paymentDate: null,
        amountPerShare: null,
        eventStatus: 'UNKNOWN',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'UNKNOWN',
        daysUntilRecordDate: null,
        daysUntilPayment: null,
      },
    };

    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [fiiUnknown],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="fii" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('data-testid="fii-dividend-calendar-MXRF11"');
    expect(html).toContain('Calendário: sem evento anunciado');
    expect(html).toContain('Nenhum próximo evento anunciado disponível');
  });

  it('PARTE AA & M: renders valid calendar with data-com, payment, and calendar fit badge', () => {
    const fiiValid: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'BRCR11',
      components: {
        ...mockItem2.components,
        dividendCalendarFit: 85,
      },
      dividendCalendar: {
        ticker: 'BRCR11',
        recordDate: '2026-11-15',
        exDate: '2026-11-16',
        paymentDate: '2026-11-25',
        amountPerShare: 0.55,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 5,
        daysUntilPayment: 15,
      },
    };

    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [fiiValid],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="fii" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('data-testid="fii-dividend-calendar-BRCR11"');
    expect(html).toContain('Data-com: 15/11');
    expect(html).toContain('Pagamento: 25/11');
    expect(html).toContain('R$ 0.55/cota');
    expect(html).toContain('data-testid="calendar-fit-badge-BRCR11"');
    expect(html).toContain('Calendário: 85/100');
  });

  it('PARTE AB & AC: renders available cash and planned future badges on cards', () => {
    const fiiAvailable: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'KNRI11',
      dividendCalendar: {
        ticker: 'KNRI11',
        recordDate: '2026-11-18',
        paymentDate: '2026-11-28',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 8,
        daysUntilPayment: 18,
        cashAvailableNow: true,
        futureCashExpected: false,
      },
    };

    const fiiFuture: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'KCRE11',
      dividendCalendar: {
        ticker: 'KCRE11',
        recordDate: '2026-11-20',
        paymentDate: '2026-11-30',
        amountPerShare: 0.95,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 10,
        daysUntilPayment: 20,
        cashAvailableNow: false,
        futureCashExpected: true,
      },
    };

    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [fiiAvailable, fiiFuture],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="fii" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('♻ Caixa de provento recente');
    expect(html).toContain('🗓 Próxima rotação planejada');
  });

  it('PARTE N: renders discrete notice when strategy is active but no FII has valid events', () => {
    const fiiWithoutEvents: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'MALL11',
      dividendCalendar: {
        ticker: 'MALL11',
        recordDate: null,
        paymentDate: null,
        amountPerShare: null,
        eventStatus: 'UNKNOWN',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'UNKNOWN',
        daysUntilRecordDate: null,
        daysUntilPayment: null,
      },
    };

    queryClient.setQueryData(['opportunity-radar', portfolioId], {
      data: {
        ...mockRadarResponse,
        fiiItems: [fiiWithoutEvents],
      },
    });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunityRadarSection portfolioId={portfolioId} initialTab="fii" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(html).toContain('data-testid="strategy-no-events-notice"');
    expect(html).toContain('Estratégia ativa, mas nenhum calendário anunciado foi encontrado para os FIIs analisados.');
  });

  it('PARTE L & S: modal shows Calendário de Proventos component with dash and subtitle when data missing, plus Fonte', () => {
    const fiiMissingCalendar: OpportunityRadarItemDto = {
      ...mockItem2,
      ticker: 'HGLG11',
      components: {
        ...mockItem2.components,
        dividendCalendarFit: null,
      },
      dividendCalendar: {
        ticker: 'HGLG11',
        recordDate: null,
        paymentDate: null,
        amountPerShare: null,
        eventStatus: 'UNKNOWN',
        source: 'BRAPI_DIVIDENDS',
        eligibilityStatus: 'UNKNOWN',
        daysUntilRecordDate: null,
        daysUntilPayment: null,
      },
    };

    const html = renderToString(
      <OpportunityAnalysisModal
        isOpen={true}
        onClose={vi.fn()}
        item={fiiMissingCalendar}
      />
    );

    expect(html).toContain('Calendário de Proventos');
    expect(html).toContain('Sem evento anunciado elegível no momento.');
    expect(html).toContain('Fonte: BRAPI_DIVIDENDS');
  });
});
