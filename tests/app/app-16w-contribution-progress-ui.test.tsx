import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DecisionBriefSection } from '../../apps/atlas-app/src/features/portfolio/components/DecisionBriefSection';
import {
  decisionBriefQueryKey,
  contributionProgressQueryKey,
} from '../../apps/atlas-app/src/features/portfolio/useDecisionBrief';
import type {
  PortfolioDailyDecisionBriefDto,
  ContributionPlanProgressDto,
} from '../../apps/atlas-app/src/features/portfolio/types';

const portfolioId = '00000000-0000-4000-8000-000000000002';

function makeBrief(overrides: Partial<PortfolioDailyDecisionBriefDto> = {}): PortfolioDailyDecisionBriefDto {
  return {
    portfolioId,
    asOf: '2026-11-13',
    generatedAt: '2026-11-13T12:00:00.000Z',
    modelVersion: 'opportunity-v2.3.1',
    comparisonBasis: 'INITIAL_BASELINE',
    summary: ['3 ativos priorizados para estudo hoje.'],
    topPriorities: [
      {
        rank: 1,
        assetId: 'a1',
        ticker: 'BRAP4',
        name: 'Bradespar PN',
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

function makeProgress(overrides: Partial<ContributionPlanProgressDto> = {}): ContributionPlanProgressDto {
  return {
    portfolioId,
    currency: 'BRL',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    asOf: '2026-11-13T12:00:00.000Z',
    plan: {
      portfolioId,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      plannedCents: 200000,
      plannedAmount: '2000.00',
      currency: 'BRL',
      source: 'SAVED_GOAL',
      baselineMode: 'LIVE_SIMULATION',
      baselineStable: false,
      allocations: [
        {
          assetId: 'a1',
          ticker: 'BRAP4',
          name: 'Bradespar PN',
          assetType: 'STOCK',
          plannedCents: 80000,
          plannedAmount: '800.00',
          plannedPercent: 40.0,
        },
        {
          assetId: 'a2',
          ticker: 'ITSA4',
          name: 'Itaúsa PN',
          assetType: 'STOCK',
          plannedCents: 70000,
          plannedAmount: '700.00',
          plannedPercent: 35.0,
        },
      ],
    },
    overall: {
      plannedCents: 200000,
      actualCents: 135000,
      remainingCents: 65000,
      overPlanCents: 0,
      completionPercent: 67.5,
      cappedCompletionPercent: 67.5,
      plannedAmount: '2000.00',
      actualAmount: '1350.00',
      remainingAmount: '650.00',
      overPlanAmount: '0.00',
      status: 'PARTIAL',
    },
    assets: [
      {
        assetId: 'a1',
        ticker: 'BRAP4',
        name: 'Bradespar PN',
        assetType: 'STOCK',
        plannedCents: 80000,
        actualCents: 60000,
        remainingCents: 20000,
        overPlanCents: 0,
        completionPercent: 75.0,
        cappedCompletionPercent: 75.0,
        status: 'PARTIAL',
        tradeCount: 1,
      },
      {
        assetId: 'a2',
        ticker: 'ITSA4',
        name: 'Itaúsa PN',
        assetType: 'STOCK',
        plannedCents: 70000,
        actualCents: 70000,
        remainingCents: 0,
        overPlanCents: 0,
        completionPercent: 100.0,
        cappedCompletionPercent: 100.0,
        status: 'COMPLETE',
        tradeCount: 1,
      },
    ],
    unplannedAssets: [
      {
        assetId: 'a3',
        ticker: 'VALE3',
        name: 'Vale ON',
        assetType: 'STOCK',
        plannedCents: 0,
        actualCents: 5000,
        remainingCents: 0,
        overPlanCents: 5000,
        completionPercent: 0,
        cappedCompletionPercent: 0,
        status: 'UNPLANNED',
        tradeCount: 1,
      },
    ],
    deviations: [],
    largestDeviations: [
      'BRAP4 recebeu R$ 200.00 abaixo do planejado.',
      'VALE3 teve compra de R$ 50.00 fora do plano original.',
    ],
    observedTransactions: [],
    structuralProgress: {
      hasTargetContext: true,
      attributionDisclaimer: 'Variações de peso decorrem de múltiplos fatores de mercado.',
    },
    dataQuality: {
      valuationQuality: 'FULL_PORTFOLIO',
      totalPositions: 2,
      valuedPositions: 2,
      incompletePositions: 0,
      isPartialValuation: false,
      trackedPurchaseCount: 3,
      excludedSellCount: 0,
      excludedOutOfPeriodCount: 0,
    },
    warnings: [],
    assumptions: [],
    sourceTransparencyNote: 'Baseado em 3 compras registradas no ledger.',
    cashSourceLimitationNote: 'O Atlas identificou compras no período, mas não distingue com precisão a origem do caixa.',
    modelVersion: 'opportunity-v2.3.1',
    ...overrides,
  };
}

describe('APP-16W UI: Contribution Plan Progress Tracking', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders ContributionProgressCard with summary metrics, planned vs actual table, and safe language', () => {
    queryClient.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());
    queryClient.setQueryData(contributionProgressQueryKey(portfolioId), makeProgress());

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Acompanhamento do aporte');
    expect(html).toContain('data-testid="contribution-progress-tracking-card"');
    expect(html).toContain('67.5');
    expect(html).toContain('2000.00');
    expect(html).toContain('1350.00');
    expect(html).toContain('650.00');

    // Rows
    expect(html).toContain('data-testid="tracking-asset-row-BRAP4"');
    expect(html).toContain('data-testid="tracking-asset-row-ITSA4"');
    expect(html).toContain('data-testid="tracking-unplanned-row-VALE3"');
    expect(html).toContain('Fora do plano');
    expect(html).toContain('Concluído');
    expect(html).toContain('Parcial');

    // Source transparency & disclaimer
    expect(html).toContain('Baseado em 3 compras registradas no ledger.');
    expect(html).toContain('não distingue com precisão a origem do caixa');

    // Disallowed language checks
    expect(html).not.toMatch(/\bComprar agora\b/i);
    expect(html).not.toMatch(/\bExecutar ordem\b/i);
    expect(html).not.toMatch(/\bEnviar ordem\b/i);
    expect(html).not.toMatch(/\bFalhou em investir\b/i);
    expect(html).not.toMatch(/\bDecisão errada\b/i);
  });

  it('renders Persisted Plan badge and planned date when plan.source is PERSISTED_PLAN', () => {
    const persistedProgress = makeProgress({
      plan: {
        portfolioId,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        plannedCents: 200000,
        plannedAmount: '2000.00',
        currency: 'BRL',
        source: 'PERSISTED_PLAN',
        baselineMode: 'PERSISTED_PLAN',
        baselineStable: true,
        plannedDate: '2026-11-01',
        allocations: [],
      },
      sourceTransparencyNote: 'Plano salvo em 2026-11-01. Base histórica estável.',
    });

    queryClient.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());
    queryClient.setQueryData(contributionProgressQueryKey(portfolioId), persistedProgress);

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Plano salvo');
    expect(html).toContain('Base planejada em');
    expect(html).toContain('2026-11-01');
    expect(html).toContain('Base histórica estável');
    expect(html).not.toContain('A distribuição planejada é recalculada');
  });

  it('renders Live Simulation warning when baselineStable is false', () => {
    const liveProgress = makeProgress({
      plan: {
        portfolioId,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        plannedCents: 200000,
        plannedAmount: '2000.00',
        currency: 'BRL',
        source: 'SAVED_GOAL',
        baselineMode: 'LIVE_SIMULATION',
        baselineStable: false,
        allocations: [],
      },
      sourceTransparencyNote: 'Simulação atual baseada na meta mensal.',
    });

    queryClient.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());
    queryClient.setQueryData(contributionProgressQueryKey(portfolioId), liveProgress);

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Meta salva');
    expect(html).toContain('A distribuição planejada é recalculada com os dados atuais e pode mudar ao longo do tempo.');
  });

  it('renders Plan Selection Required selector when 409 ambiguity state occurs', () => {
    const error = new Error('Mais de um plano de aporte existe para esta competência.') as any;
    error.code = 'CONTRIBUTION_PLAN.SELECTION_REQUIRED';
    error.statusCode = 409;
    error.status = 409;
    error.details = {
      period: '2026-11',
      candidates: [
        {
          id: 'plan-1',
          name: 'Plano A — Novembro',
          plannedDate: '2026-11-05',
          status: 'PLANNED',
          currency: 'BRL',
          totalPlannedAmount: '1200.00',
          createdAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'plan-2',
          name: 'Plano B — Novembro Extra',
          plannedDate: '2026-11-15',
          status: 'COMPLETED',
          currency: 'BRL',
          totalPlannedAmount: '1500.00',
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      ],
    };

    const key = contributionProgressQueryKey(portfolioId, undefined, undefined, undefined);

    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    client.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());
    client.setQueryData(key, {
      _selectionRequired: true,
      _selectionPeriod: '2026-11',
      _candidates: [
        {
          id: 'plan-1',
          name: 'Plano A — Novembro',
          plannedDate: '2026-11-05',
          status: 'PLANNED',
          currency: 'BRL',
          totalPlannedAmount: '1200.00',
          createdAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'plan-2',
          name: 'Plano B — Novembro Extra',
          plannedDate: '2026-11-15',
          status: 'COMPLETED',
          currency: 'BRL',
          totalPlannedAmount: '1500.00',
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      ],
    });

    const html = renderToString(
      <QueryClientProvider client={client}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Selecione qual plano deseja acompanhar');
    expect(html).toContain('Há mais de um plano salvo para este mês. Escolha qual deles deseja acompanhar.');
    expect(html).toContain('Plano A — Novembro');
    expect(html).toContain('1200.00');
    expect(html).toContain('Plano B — Novembro Extra');
    expect(html).toContain('1500.00');
    expect(html).toContain('Concluído');
    expect(html).toContain('Planejado');
  });

  it('Critical Test APP-16X: renders monthly review button when viewing a persisted plan', () => {
    const portfolioId = '11111111-1111-4111-8111-111111111111';
    const planId = 'plan-uuid-123';

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    client.setQueryData(decisionBriefQueryKey(portfolioId), makeBrief());

    const progressWithPersistedPlan = {
      ...makeProgress(),
      plan: {
        ...makeProgress().plan,
        id: planId,
        source: 'PERSISTED_PLAN',
        baselineMode: 'PERSISTED_PLAN' as const,
        baselineStable: true,
        plannedDate: '2026-11-05',
      },
    };

    client.setQueryData(
      contributionProgressQueryKey(portfolioId, undefined, undefined, undefined),
      progressWithPersistedPlan,
    );

    const html = renderToString(
      <QueryClientProvider client={client}>
        <DecisionBriefSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Revisão mensal do plano ↗');
  });
});
