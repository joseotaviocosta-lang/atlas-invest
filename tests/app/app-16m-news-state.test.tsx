import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DailyNewsDigestSection } from '../../apps/atlas-app/src/features/portfolio/components/DailyNewsDigestSection';
import { PortfolioNewsInbox } from '../../apps/atlas-app/src/features/portfolio/components/PortfolioNewsInbox';
import { applyOptimisticSeenToCache } from '../../apps/atlas-app/src/features/portfolio/newsStateUtils';
import type { PortfolioNewsInboxResponseDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('PROJECT ATLAS — APP-16M: Portfolio News Novelty State UI', () => {
  let queryClient: QueryClient;
  const portfolioId = '00000000-0000-4000-8000-000000000002';

  const controlledResponse: PortfolioNewsInboxResponseDto = {
    events: [
      {
        id: 'evt_high_new',
        canonicalEventId: 'evt_high_new',
        headline: 'PETROBRAS (PETR4): Fato Relevante — Novo plano estratégico de US$ 100 bi',
        summary: 'Plano aprovado pelo conselho com foco em E&P.',
        publishedAt: '2026-11-11T10:00:00.000Z',
        importance: 5,
        sentiment: 'POSITIVE',
        sentimentScore: 0.85,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'FACT_RELEVANT',
        assets: ['PETR4'],
        primaryTickers: ['PETR4'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc1' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'HIGH',
        materialityScore: 82,
        materialityReason: 'Fato relevante estratégico aprovado em conselho',
        state: 'NEW',
        isNew: true,
        isUpdated: false,
        isSeen: false,
      },
      {
        id: 'evt_updated_official',
        canonicalEventId: 'evt_updated_official',
        headline: 'VALE (VALE3): Fato Relevante — Acordo operacional atualizado via CVM',
        summary: 'Confirmação oficial CVM anexada ao evento.',
        publishedAt: '2026-11-11T09:30:00.000Z',
        importance: 4,
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'FACT_RELEVANT',
        assets: ['VALE3'],
        primaryTickers: ['VALE3'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc2' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'HIGH',
        materialityScore: 78,
        materialityReason: 'Confirmação regulatória recebida',
        state: 'UPDATED',
        isNew: false,
        isUpdated: true,
        isSeen: false,
        updateReasons: ['OFFICIAL_SOURCE_ADDED'],
      },
      {
        id: 'evt_low_new',
        canonicalEventId: 'evt_low_new',
        headline: 'WEGE3 divulga agenda de conferência',
        summary: 'Evento institucional programado.',
        publishedAt: '2026-11-11T09:00:00.000Z',
        importance: 2,
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        sentimentMethod: 'LEXICAL_RULE',
        eventType: 'OTHER',
        assets: ['WEGE3'],
        primaryTickers: ['WEGE3'],
        secondaryTickers: [],
        sources: [{ name: 'InfoMoney', url: 'https://infomoney.com.br/wege' }],
        provider: 'GOOGLE_NEWS',
        sourceType: 'TRUSTED_FINANCIAL_MEDIA',
        official: false,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'LOW',
        materialityScore: 25,
        materialityReason: 'Agenda institucional',
        state: 'NEW',
        isNew: true,
        isUpdated: false,
        isSeen: false,
      },
      {
        id: 'evt_seen',
        canonicalEventId: 'evt_seen',
        headline: 'HGLG11: Relatório gerencial mensal já consultado',
        summary: 'Documento consultado anteriormente.',
        publishedAt: '2026-11-10T18:00:00.000Z',
        importance: 2,
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'MANAGEMENT_REPORT',
        assets: ['HGLG11'],
        primaryTickers: ['HGLG11'],
        secondaryTickers: [],
        sources: [{ name: 'B3', url: 'https://fnet.bmfbovespa.com.br/doc3' }],
        provider: 'B3',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'VERY_RECENT',
        decayWeight: 0.9,
        materiality: 'MEDIUM',
        materialityScore: 45,
        materialityReason: 'Relatório gerencial mensal',
        state: 'SEEN',
        isNew: false,
        isUpdated: false,
        isSeen: true,
        lastSeenByUserAt: '2026-11-11T08:00:00.000Z',
      },
    ],
    totalEvents: 4,
    byAssetCount: { PETR4: 1, VALE3: 1, WEGE3: 1, HGLG11: 1 },
    newsState: {
      initialized: true,
      initializedAt: '2026-11-10T10:00:00.000Z',
      lastRefreshedAt: '2026-11-11T10:05:00.000Z',
      newEventsCount: 2,
      newMaterialEventsCount: 1,
      updatedEventsCount: 1,
      seenEventsCount: 1,
    },
    digest: {
      date: '2026-11-11',
      totalEvents: 4,
      materialEventsCount: 3,
      attentionEventsCount: 2,
      criticalCount: 0,
      highCount: 2,
      mediumCount: 1,
      routineCount: 0,
      affectedAssetsCount: 4,
      affectedAssets: ['HGLG11', 'PETR4', 'VALE3', 'WEGE3'],
      newEventsCount: 2,
      newMaterialEventsCount: 1,
      updatedEventsCount: 1,
      seenEventsCount: 1,
      items: [
        {
          id: 'digest_evt_high_new',
          canonicalEventId: 'evt_high_new',
          ticker: 'PETR4',
          assets: ['PETR4'],
          headline: 'PETROBRAS (PETR4): Fato Relevante — Novo plano estratégico de US$ 100 bi',
          summary: 'Plano aprovado pelo conselho com foco em E&P.',
          eventType: 'FACT_RELEVANT',
          materiality: 'HIGH',
          materialityScore: 82,
          materialityReason: 'Fato relevante estratégico aprovado em conselho',
          sentiment: 'POSITIVE',
          sentimentScore: 0.85,
          official: true,
          publishedAt: '2026-11-11T10:00:00.000Z',
          sourceName: 'CVM',
          canonicalUrl: 'https://rad.cvm.gov.br/doc1',
          sourcesCount: 1,
          sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc1' }],
          radarImpact: 'POSITIVE',
          state: 'NEW',
          isNew: true,
          isUpdated: false,
          isSeen: false,
        },
        {
          id: 'digest_evt_updated_official',
          canonicalEventId: 'evt_updated_official',
          ticker: 'VALE3',
          assets: ['VALE3'],
          headline: 'VALE (VALE3): Fato Relevante — Acordo operacional atualizado via CVM',
          summary: 'Confirmação oficial CVM anexada ao evento.',
          eventType: 'FACT_RELEVANT',
          materiality: 'HIGH',
          materialityScore: 78,
          materialityReason: 'Confirmação regulatória recebida',
          sentiment: 'NEUTRAL',
          sentimentScore: 0,
          official: true,
          publishedAt: '2026-11-11T09:30:00.000Z',
          sourceName: 'CVM',
          canonicalUrl: 'https://rad.cvm.gov.br/doc2',
          sourcesCount: 1,
          sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc2' }],
          radarImpact: 'NEUTRAL',
          state: 'UPDATED',
          isNew: false,
          isUpdated: true,
          isSeen: false,
          updateReasons: ['OFFICIAL_SOURCE_ADDED'],
        },
        {
          id: 'digest_evt_seen',
          canonicalEventId: 'evt_seen',
          ticker: 'HGLG11',
          assets: ['HGLG11'],
          headline: 'HGLG11: Relatório gerencial mensal já consultado',
          summary: 'Documento consultado anteriormente.',
          eventType: 'MANAGEMENT_REPORT',
          materiality: 'MEDIUM',
          materialityScore: 45,
          materialityReason: 'Relatório gerencial mensal',
          sentiment: 'NEUTRAL',
          sentimentScore: 0,
          official: true,
          publishedAt: '2026-11-10T18:00:00.000Z',
          sourceName: 'B3',
          canonicalUrl: 'https://fnet.bmfbovespa.com.br/doc3',
          sourcesCount: 1,
          sources: [{ name: 'B3', url: 'https://fnet.bmfbovespa.com.br/doc3' }],
          radarImpact: 'NEUTRAL',
          state: 'SEEN',
          isNew: false,
          isUpdated: false,
          isSeen: true,
        },
      ],
    },
    metrics: {
      breakingCount: 3,
      recentCount: 4,
      officialCount: 3,
      highImportanceCount: 2,
      materialCount: 2,
      criticalCount: 0,
      highCount: 2,
      mediumCount: 1,
      routineCount: 0,
      newEventsCount: 2,
      newMaterialEventsCount: 1,
      updatedEventsCount: 1,
      seenEventsCount: 1,
      totalAuditedAssets: 36,
      assetsWithNews: 4,
      assetsWithoutNews: 32,
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
    asOf: '2026-11-11T10:05:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  it('renders DailyNewsDigestSection with novelty counts, NOVO/ATUALIZADO/VISTO badges, update reason, and mark-seen action', () => {
    queryClient.setQueryData(['portfolio-news', portfolioId], { data: controlledResponse });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('2 novidades (1 de alta relevância) • 1 atualizado');
    expect(html).toContain('NOVO');
    expect(html).toContain('ATUALIZADO');
    expect(html).toContain('VISTO');
    expect(html).toContain('Confirmação oficial (CVM / B3) adicionada');
    expect(html).toContain('Marcar novidades como vistas');
    expect(html).toContain('Marcar como visto');
  });

  it('renders calm summary when newCount=0 and updatedCount=0', () => {
    const calmData: PortfolioNewsInboxResponseDto = {
      ...controlledResponse,
      newsState: {
        ...controlledResponse.newsState!,
        newEventsCount: 0,
        newMaterialEventsCount: 0,
        updatedEventsCount: 0,
      },
      digest: {
        ...controlledResponse.digest!,
        newEventsCount: 0,
        newMaterialEventsCount: 0,
        updatedEventsCount: 0,
      },
      metrics: {
        ...controlledResponse.metrics,
        newEventsCount: 0,
        newMaterialEventsCount: 0,
        updatedEventsCount: 0,
      },
    };
    queryClient.setQueryData(['portfolio-news', portfolioId], { data: calmData });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Nenhuma novidade relevante desde sua última consulta');
    expect(html).not.toContain('Marcar novidades como vistas');
  });

  it('renders PortfolioNewsInbox with Novos (2) and Atualizados (1) tabs and state badges', () => {
    queryClient.setQueryData(['portfolio-news', portfolioId], { data: controlledResponse });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PortfolioNewsInbox portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Novos (2)');
    expect(html).toContain('Atualizados (1)');
    expect(html).toContain('NOVO');
    expect(html).toContain('ATUALIZADO');
    expect(html).toContain('VISTO');
  });

  it('optimistically updates cache cleanly when user marks a single event or all news as seen', () => {
    const afterOne = applyOptimisticSeenToCache(
      { data: controlledResponse },
      { canonicalEventIds: ['evt_high_new'], seenAt: '2026-11-11T10:15:00.000Z' },
    );

    expect(afterOne?.data.newsState?.newEventsCount).toBe(1);
    expect(afterOne?.data.newsState?.newMaterialEventsCount).toBe(0);
    expect(afterOne?.data.events.find((e) => e.canonicalEventId === 'evt_high_new')?.state).toBe('SEEN');
    expect(afterOne?.data.digest?.items.find((i) => i.canonicalEventId === 'evt_high_new')?.state).toBe('SEEN');

    const afterAll = applyOptimisticSeenToCache(afterOne, {
      markAllNew: true,
      seenAt: '2026-11-11T10:16:00.000Z',
    });
    expect(afterAll?.data.newsState?.newEventsCount).toBe(0);
    expect(afterAll?.data.newsState?.updatedEventsCount).toBe(0);
    expect(afterAll?.data.events.every((e) => e.state === 'SEEN')).toBe(true);
  });
});
