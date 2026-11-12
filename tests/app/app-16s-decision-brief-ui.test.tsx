import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DecisionBriefSection } from '../../apps/atlas-app/src/features/portfolio/components/DecisionBriefSection';
import { decisionBriefQueryKey } from '../../apps/atlas-app/src/features/portfolio/useDecisionBrief';
import type { PortfolioDailyDecisionBriefDto } from '../../apps/atlas-app/src/features/portfolio/types';

const portfolioId = '00000000-0000-4000-8000-000000000002';

function makeBrief(overrides: Partial<PortfolioDailyDecisionBriefDto> = {}): PortfolioDailyDecisionBriefDto {
  return {
    portfolioId,
    asOf: '2026-11-12',
    generatedAt: '2026-11-12T12:00:00.000Z',
    modelVersion: 'opportunity-v2.3.1',
    comparisonBasis: 'INITIAL_BASELINE',
    summary: ['3 ativos priorizados para estudo hoje.'],
    topPriorities: [
      {
        rank: 1,
        assetId: 'a1',
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        assetType: 'STOCK',
        opportunityScore: 84,
        confidence: 'HIGH',
        decisionTier: 'HIGH_PRIORITY',
        whyNow: ['Múltiplos abaixo da média histórica'],
        cautions: ['Cotação EOD defasada — validar preço atual antes de decidir.'],
        dataGaps: ['Sem meta de alocação configurada'],
        recentChanges: [],
      },
      {
        rank: 2,
        assetId: 'a2',
        ticker: 'MXRF11',
        name: 'Maxi Renda FII',
        assetType: 'FII',
        opportunityScore: 76,
        confidence: 'MEDIUM',
        decisionTier: 'REVIEW',
        whyNow: ['Data-com próxima no calendário'],
        cautions: [],
        dataGaps: [],
        recentChanges: [],
      },
      {
        rank: 3,
        assetId: 'a3',
        ticker: 'WEGE3',
        name: 'WEG ON',
        assetType: 'STOCK',
        opportunityScore: 68,
        confidence: 'MEDIUM',
        decisionTier: 'WATCH',
        whyNow: ['Qualidade operacional consistente'],
        cautions: [],
        dataGaps: [],
        recentChanges: [],
      },
    ],
    allEvaluatedCount: 36,
    fiiRotation: {
      hasRecentPaidCash: true,
      estimatedRecentCashTotal: 250.5,
      sourceTickers: ['HGLG11'],
      targetTicker: 'MXRF11',
      targetRecordDate: '2026-11-14',
      targetPaymentDate: '2026-11-22',
      summaryText: 'Proventos estimados recentes de HGLG11 podem apoiar estudo de MXRF11.',
    },
    recentMaterialChanges: [
      {
        ticker: 'BBAS3',
        type: 'NEW_MATERIAL_NEWS',
        label: 'Fato Relevante publicado na CVM',
        isOfficial: true,
        source: 'CVM',
        canonicalUrl: 'https://fnet.bmfbovespa.com.br/doc',
      },
    ],
    contributionContext: {
      plannedAmount: null,
      currency: 'BRL',
      source: 'NONE',
      simulationNote: null,
    },
    dataQuality: {
      label: 'PARCIAL',
      sufficientCount: 28,
      incompleteCount: 8,
      totalAssets: 36,
      priceCoveragePercent: 100,
      fundamentalsCoveragePercent: 78,
      newsCoveragePercent: 100,
    },
    ...overrides,
  };
}

describe('APP-16S UI: DecisionBriefSection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders Top 3 cards, cautions, FII estimated rotation, recent changes, and zero buy/sell CTA words', () => {
    queryClient.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Decisão de aporte');
    expect(html).toContain('BBAS3');
    expect(html).toContain('MXRF11');
    expect(html).toContain('WEGE3');
    expect(html).toContain('Prioridade para análise');
    expect(html).toContain('Merece revisão');
    expect(html).toContain('proventos estimados');
    expect(html).toContain('Ver detalhes');
    expect(html).toContain('Ver análise completa');

    // Non-transactional copy invariant
    expect(html).not.toMatch(/\bComprar\b/i);
    expect(html).not.toMatch(/\bVenda agora\b/i);
  });

  it('renders empty state gracefully when portfolio has 0 eligible assets', () => {
    queryClient.setQueryData(
      decisionBriefQueryKey(portfolioId),
      makeBrief({
        topPriorities: [],
        allEvaluatedCount: 0,
        fiiRotation: undefined,
        recentMaterialChanges: [],
        dataQuality: {
          label: 'LIMITADA',
          sufficientCount: 0,
          incompleteCount: 0,
          totalAssets: 0,
          priceCoveragePercent: 0,
          fundamentalsCoveragePercent: 0,
          newsCoveragePercent: 0,
        },
      }),
    );

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Nenhum ativo elegível encontrado');
  });
});
