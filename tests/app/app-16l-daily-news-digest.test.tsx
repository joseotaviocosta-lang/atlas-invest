import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DailyNewsDigestSection } from '../../apps/atlas-app/src/features/portfolio/components/DailyNewsDigestSection';
import { PortfolioNewsInbox } from '../../apps/atlas-app/src/features/portfolio/components/PortfolioNewsInbox';
import type { PortfolioNewsInboxResponseDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('PROJECT ATLAS — APP-16L: Daily News Digest & Materiality (Frontend Components)', () => {
  let queryClient: QueryClient;
  const portfolioId = '00000000-0000-4000-8000-000000000002';

  const mockInboxResponse: PortfolioNewsInboxResponseDto = {
    events: [
      {
        id: 'e1',
        canonicalEventId: 'e1',
        headline: 'PETROBRAS (PETR4): Fato Relevante — Aprovação de Plano Estratégico',
        summary: 'Aprovação de investimentos de US$ 100 bi em exploração e refino.',
        publishedAt: '2026-11-11T10:00:00.000Z',
        importance: 5,
        sentiment: 'POSITIVE',
        sentimentScore: 0.8,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'FACT_RELEVANT',
        assets: ['PETR4'],
        primaryTickers: ['PETR4'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc1.pdf' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'HIGH',
        materialityScore: 80,
        materialityReason: 'Fato relevante oficial corporativo sobre negócios ou estratégia',
      },
      {
        id: 'e2',
        canonicalEventId: 'e2',
        headline: 'VALE (VALE3): Envio de informe periódico de rotina',
        summary: 'Envio regular de documentação periódica de governança.',
        publishedAt: '2026-11-11T09:00:00.000Z',
        importance: 1,
        sentiment: 'NEUTRAL',
        sentimentScore: 0.0,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'REGULATORY',
        assets: ['VALE3'],
        primaryTickers: ['VALE3'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc2.pdf' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'ROUTINE',
        materialityScore: 5,
        materialityReason: 'Documento regulatório periódico ou informe administrativo de rotina',
      },
    ],
    totalEvents: 2,
    byAssetCount: {
      PETR4: 1,
      VALE3: 1,
    },
    digest: {
      date: '2026-11-11',
      totalEvents: 2,
      materialEventsCount: 1,
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      routineCount: 1,
      affectedAssetsCount: 1,
      affectedAssets: ['PETR4'],
      items: [
        {
          id: 'digest_e1',
          canonicalEventId: 'e1',
          ticker: 'PETR4',
          assets: ['PETR4'],
          headline: 'PETROBRAS (PETR4): Fato Relevante — Aprovação de Plano Estratégico',
          summary: 'Aprovação de investimentos de US$ 100 bi em exploração e refino.',
          eventType: 'FACT_RELEVANT',
          materiality: 'HIGH',
          materialityScore: 80,
          materialityReason: 'Fato relevante oficial corporativo sobre negócios ou estratégia',
          sentiment: 'POSITIVE',
          sentimentScore: 0.8,
          official: true,
          publishedAt: '2026-11-11T10:00:00.000Z',
          sourceName: 'CVM',
          canonicalUrl: 'https://rad.cvm.gov.br/doc1.pdf',
          sourcesCount: 1,
          sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc1.pdf' }],
          radarImpact: 'POSITIVE',
        },
      ],
    },
    metrics: {
      breakingCount: 2,
      recentCount: 2,
      officialCount: 2,
      highImportanceCount: 1,
      materialCount: 1,
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      routineCount: 1,
      totalAuditedAssets: 36,
      assetsWithNews: 2,
      assetsWithoutNews: 34,
      officialCoverageCount: 36,
      providerStatus: {
        brapiNewsAvailable: false,
        brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
        officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
        cvmStatus: 'AVAILABLE',
        fnetStatus: 'AVAILABLE',
        fallbackActive: true,
        providersUsed: ['CVM / B3 Regulatório Oficial'],
      },
    },
    asOf: '2026-11-11T12:00:00.000Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  it('renders DailyNewsDigestSection with dynamic header, badges, explainability and actions', () => {
    queryClient.setQueryData(['portfolio-news', portfolioId], { data: mockInboxResponse });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('O que aconteceu com sua carteira');
    expect(html).toContain('36 ativos monitorados');
    expect(html).toContain('1 evento relevante merece atenção hoje');
    expect(html).toContain('PETR4');
    expect(html).toContain('Alta Relevância');
    expect(html).toContain('Fato Relevante');
    expect(html).toContain('CVM');
    expect(html).toContain('Por que importa:');
    expect(html).toContain('Impacto no Radar:');
    expect(html).toContain('Positivo');
    expect(html).toContain('Acessar documento oficial');
    expect(html).toContain('Ver todas as notícias (2)');
  });

  it('renders empty state when no material events exist for today', () => {
    const emptyDigestResponse: PortfolioNewsInboxResponseDto = {
      ...mockInboxResponse,
      digest: {
        date: '2026-11-11',
        totalEvents: 5,
        materialEventsCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        routineCount: 5,
        affectedAssetsCount: 0,
        affectedAssets: [],
        items: [],
      },
    };

    queryClient.setQueryData(['portfolio-news', portfolioId], { data: emptyDigestResponse });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Nenhum evento material identificado hoje');
    expect(html).toContain('Monitorando 36 ativos da sua carteira');
  });

  it('renders PortfolioNewsInbox with Relevantes and Rotina filter tabs', () => {
    queryClient.setQueryData(['portfolio-news', portfolioId], { data: mockInboxResponse });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PortfolioNewsInbox portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Notícias da Carteira');
    expect(html).toContain('Relevantes (1)');
    expect(html).toContain('Rotina (1)');
    expect(html).toContain('Oficiais (2)');
    expect(html).toContain('PETR4');
    expect(html).toContain('Alta');
    expect(html).toContain('Por que importa:');
  });
});
