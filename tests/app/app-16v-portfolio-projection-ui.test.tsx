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
        cautions: [],
        dataGaps: [],
        recentChanges: [],
      },
    ],
    allEvaluatedCount: 1,
    contributionContext: {
      plannedAmount: null,
      currency: 'BRL',
      source: 'NONE',
      simulationNote: null,
    },
    dataQuality: {
      label: 'BOA',
      sufficientCount: 1,
      incompleteCount: 0,
      totalAssets: 1,
      priceCoveragePercent: 100,
      fundamentalsCoveragePercent: 100,
      newsCoveragePercent: 100,
    },
    ...overrides,
  };
}

describe('APP-16V UI: Portfolio Projection After Contribution', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders DecisionBriefSection with simulation and scenario comparison entry points', () => {
    queryClient.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Simular distribuição');
    expect(html).toContain('Comparar cenários');
    expect(html).toContain('data-testid="decision-brief-compare-button"');
    expect(html).toContain('data-testid="decision-brief-simulate-button"');

    // Audit against all disallowed transactional words
    expect(html).not.toMatch(/\bComprar\b/i);
    expect(html).not.toMatch(/\bCompre agora\b/i);
    expect(html).not.toMatch(/\bExecutar ordem\b/i);
    expect(html).not.toMatch(/\bEnviar ordem\b/i);
    expect(html).not.toMatch(/\bBoleta\b/i);
    expect(html).not.toMatch(/\bVenda agora\b/i);

    // Audit against all disallowed suitability words
    expect(html).not.toMatch(/\bPerfil conservador\b/i);
    expect(html).not.toMatch(/\bPerfil arrojado\b/i);
    expect(html).not.toMatch(/\bMelhor cenário\b/i);
    expect(html).not.toMatch(/\bCenário recomendado\b/i);
  });
});
