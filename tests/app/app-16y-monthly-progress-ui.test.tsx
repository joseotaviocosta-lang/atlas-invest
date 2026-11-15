import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MonthlyProgressTimelineSection } from '../../apps/atlas-app/src/features/portfolio/components/MonthlyProgressTimelineSection';
import { monthlyProgressQueryKey } from '../../apps/atlas-app/src/features/portfolio/useDecisionBrief';
import type { PortfolioMonthlyProgressTimelineDto } from '../../apps/atlas-app/src/features/portfolio/types';

const portfolioId = '33333333-3333-4333-8333-333333333333';

function makeMockTimeline(
  overrides: Partial<PortfolioMonthlyProgressTimelineDto> = {},
): PortfolioMonthlyProgressTimelineDto {
  return {
    portfolioId,
    fromMonth: '2026-01',
    toMonth: '2026-03',
    summary: {
      monthsCount: 3,
      goalsConfiguredMonths: 2,
      totalGoalCents: 300000,
      totalGoalAmount: '3000.00',
      totalPlannedCents: 200000,
      totalPlannedAmount: '2000.00',
      totalConfirmedCents: 150000,
      totalConfirmedAmount: '1500.00',
      totalPurchaseActivityCents: 180000,
      totalPurchaseActivityAmount: '1800.00',
      plansCreated: 2,
      plansCompleted: 1,
    },
    months: [
      {
        competence: '2026-01',
        goal: {
          amount: '1500.00',
          currency: 'BRL',
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          sourceId: 'goal-1',
        },
        plans: [
          {
            id: 'plan-1',
            name: 'Plano Janeiro Ações',
            plannedDate: '2026-01-05',
            status: 'COMPLETED',
            completedAt: '2026-01-10T12:00:00Z',
            plannedCents: 120000,
            plannedAmount: '1200.00',
            confirmedCents: 120000,
            confirmedAmount: '1200.00',
            candidateCents: 0,
            candidateAmount: '0.00',
            rejectedCents: 0,
            rejectedAmount: '0.00',
            completionPercent: 100,
            baselineStable: true,
          },
          {
            id: 'plan-2',
            name: 'Plano Janeiro FIIs',
            plannedDate: '2026-01-20',
            status: 'PLANNED',
            completedAt: null,
            plannedCents: 80000,
            plannedAmount: '800.00',
            confirmedCents: 30000,
            confirmedAmount: '300.00',
            candidateCents: 10000,
            candidateAmount: '100.00',
            rejectedCents: 0,
            rejectedAmount: '0.00',
            completionPercent: 37.5,
            baselineStable: true,
          },
        ],
        totalPlannedCents: 200000,
        totalPlannedAmount: '2000.00',
        totalConfirmedCents: 150000,
        totalConfirmedAmount: '1500.00',
        totalCandidateCents: 10000,
        totalCandidateAmount: '100.00',
        purchaseActivityCents: 180000,
        purchaseActivityAmount: '1800.00',
        purchaseTransactionCount: 3,
        sellActivityCents: 0,
        sellActivityAmount: '0.00',
        sellTransactionCount: 0,
        completedPlanCount: 1,
        openPlanCount: 1,
        monthStatus: 'MULTIPLE_PLANS',
        dataQuality: {
          ledgerAvailable: true,
          planHistoryAvailable: true,
          goalHistoryAvailable: true,
          valuationHistoryAvailable: false,
        },
        warnings: ['Valuation histórico não disponível para esta competência.'],
      },
      {
        competence: '2026-02',
        goal: null,
        plans: [],
        totalPlannedCents: 0,
        totalPlannedAmount: '0.00',
        totalConfirmedCents: 0,
        totalConfirmedAmount: '0.00',
        totalCandidateCents: 0,
        totalCandidateAmount: '0.00',
        purchaseActivityCents: 0,
        purchaseActivityAmount: '0.00',
        purchaseTransactionCount: 0,
        sellActivityCents: 0,
        sellActivityAmount: '0.00',
        sellTransactionCount: 0,
        completedPlanCount: 0,
        openPlanCount: 0,
        monthStatus: 'NO_GOAL',
        dataQuality: {
          ledgerAvailable: true,
          planHistoryAvailable: true,
          goalHistoryAvailable: true,
          valuationHistoryAvailable: false,
        },
        warnings: ['Valuation histórico não disponível para esta competência.'],
      },
      {
        competence: '2026-03',
        goal: {
          amount: '1500.00',
          currency: 'BRL',
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          sourceId: 'goal-1',
        },
        plans: [],
        totalPlannedCents: 0,
        totalPlannedAmount: '0.00',
        totalConfirmedCents: 0,
        totalConfirmedAmount: '0.00',
        totalCandidateCents: 0,
        totalCandidateAmount: '0.00',
        purchaseActivityCents: 50000,
        purchaseActivityAmount: '500.00',
        purchaseTransactionCount: 1,
        sellActivityCents: 0,
        sellActivityAmount: '0.00',
        sellTransactionCount: 0,
        completedPlanCount: 0,
        openPlanCount: 0,
        monthStatus: 'GOAL_ONLY',
        dataQuality: {
          ledgerAvailable: true,
          planHistoryAvailable: true,
          goalHistoryAvailable: true,
          valuationHistoryAvailable: false,
        },
        warnings: [
          'Compras registradas abaixo da meta mensal declarada.',
          'Valuation histórico não disponível para esta competência.',
        ],
      },
    ],
    currentPortfolioState: {
      valuationQuality: 'VALUED_POSITIONS_ONLY',
      totalEquity: '42500.00',
      totalPositions: 3,
      valuedPositions: 2,
      currentPositions: [
        { assetId: 'a1', ticker: 'PETR4', weightPercent: 60 },
        { assetId: 'a2', ticker: 'VALE3', weightPercent: 40 },
      ],
    },
    historyCapabilities: {
      valuationHistory: 'UNAVAILABLE',
      allocationHistory: 'UNAVAILABLE',
      targetHistory: 'UNAVAILABLE',
      contributionPlanHistory: 'AVAILABLE',
      contributionGoalHistory: 'AVAILABLE',
    },
    safeCopy: {
      historicalValuationNote:
        'O Atlas não possui valuation histórico suficiente para reconstruir com precisão o patrimônio ou peso da carteira neste mês.',
      historicalTargetNote:
        'Metas de alocação por categoria não possuem versionamento histórico no banco de dados e não são projetadas retroativamente.',
      cashSourceNote:
        'Compras registradas refletem operações executadas no ledger. A origem do caixa (novo aporte vs. saldo pré-existente) não é inferida.',
    },
    modelVersion: 'opportunity-v2.3.1',
    ...overrides,
  };
}

describe('APP-16Y: Monthly Progress Timeline UI Component', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('renders section header, KPI summary, and timeline cards', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Evolução mensal');
    expect(html).toContain('2026-01');
    expect(html).toContain('2026-03');
    expect(html).toContain('meses');
    expect(html).toContain('Meta configurada');
    expect(html).toContain('3000.00');
    expect(html).toContain('Total planejado');
    expect(html).toContain('2000.00');
    expect(html).toContain('Total confirmado');
    expect(html).toContain('1500.00');
    expect(html).toContain('Compras registradas');
    expect(html).toContain('1800.00');
  });

  it('preserves empty months without activity (honest continuity)', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Fevereiro/2026');
    expect(html).toContain('Sem meta');
  });

  it('renders multiple plans badge and count in month', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Múltiplos planos');
    expect(html).toContain('2 planos');
  });

  it('renders historical disclaimer with safe copy', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Integridade dos dados históricos');
    expect(html).toContain('não possui valuation histórico suficiente');
    expect(html).toContain('não possuem versionamento histórico no banco');
    expect(html).toContain('origem do caixa (novo aporte vs. saldo pré-existente) não é inferida');
  });

  it('renders current portfolio state in isolated present-state card', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Situação atual da carteira');
    expect(html).toContain('Estado presente (não retroativo)');
    expect(html).toContain('Patrimônio atual: R$');
    expect(html).toContain('42500.00');
    expect(html).toContain('PETR4');
    expect(html).toContain('60');
    expect(html).toContain('VALE3');
    expect(html).toContain('40');
  });

  it('APP-16Y-R1: renders candidate amounts clearly labeled as Possíveis correspondências', () => {
    client.setQueryData(monthlyProgressQueryKey(portfolioId), makeMockTimeline());

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    expect(html).toContain('Possíveis correspondências: R$');
    expect(html).toContain('100.00');
  });

  it('APP-16Y-R3: renders multi-currency values segregated without fake combined totals and includes multiCurrencyNote', () => {
    const multiCurrencyTimeline = makeMockTimeline({
      summary: {
        monthsCount: 1,
        goalsConfiguredMonths: 1,
        monetaryAggregateMode: 'MULTI_CURRENCY',
        monetaryCurrency: null,
        totalGoalCents: null,
        totalGoalAmount: null,
        totalPlannedCents: null,
        totalPlannedAmount: null,
        totalConfirmedCents: null,
        totalConfirmedAmount: null,
        totalPurchaseActivityCents: null,
        totalPurchaseActivityAmount: null,
        plansCreated: 2,
        plansCompleted: 2,
        totalGoalByCurrency: {
          BRL: { currency: 'BRL', cents: 100000, amount: '1000.00', transactionCount: 1 },
          USD: { currency: 'USD', cents: 50000, amount: '500.00', transactionCount: 1 },
        },
        totalConfirmedByCurrency: {
          BRL: { currency: 'BRL', cents: 80000, amount: '800.00', transactionCount: 1 },
          USD: { currency: 'USD', cents: 40000, amount: '400.00', transactionCount: 1 },
        },
        totalPurchaseActivityByCurrency: {
          BRL: { currency: 'BRL', cents: 90000, amount: '900.00', transactionCount: 1 },
          USD: { currency: 'USD', cents: 45000, amount: '450.00', transactionCount: 1 },
        },
      },
      months: [
        {
          competence: '2026-11',
          goal: {
            amount: '1000.00',
            currency: 'BRL',
            effectiveFrom: '2026-11-01',
            effectiveTo: null,
            sourceId: 'g-1',
          },
          plans: [
            {
              id: 'p-brl',
              name: 'Plano Brasil',
              plannedDate: '2026-11-05',
              currency: 'BRL',
              status: 'COMPLETED',
              plannedCents: 100000,
              plannedAmount: '1000.00',
              confirmedCents: 80000,
              confirmedAmount: '800.00',
              candidateCents: 0,
              candidateAmount: '0.00',
              rejectedCents: 0,
              rejectedAmount: '0.00',
              completionPercent: 80,
              baselineStable: true,
            },
            {
              id: 'p-usd',
              name: 'Plano Global',
              plannedDate: '2026-11-15',
              currency: 'USD',
              status: 'COMPLETED',
              plannedCents: 50000,
              plannedAmount: '500.00',
              confirmedCents: 40000,
              confirmedAmount: '400.00',
              candidateCents: 0,
              candidateAmount: '0.00',
              rejectedCents: 0,
              rejectedAmount: '0.00',
              completionPercent: 80,
              baselineStable: true,
            },
          ],
          monetaryAggregateMode: 'MULTI_CURRENCY',
          monetaryCurrency: null,
          totalPlannedCents: null,
          totalPlannedAmount: null,
          totalConfirmedCents: null,
          totalConfirmedAmount: null,
          totalCandidateCents: null,
          totalCandidateAmount: null,
          purchaseActivityCents: null,
          purchaseActivityAmount: null,
          purchaseTransactionCount: 2,
          sellActivityCents: 0,
          sellActivityAmount: '0.00',
          sellTransactionCount: 0,
          completedPlanCount: 2,
          openPlanCount: 0,
          monthStatus: 'MULTIPLE_PLANS',
          confirmedByCurrency: {
            BRL: { currency: 'BRL', cents: 80000, amount: '800.00', transactionCount: 1 },
            USD: { currency: 'USD', cents: 40000, amount: '400.00', transactionCount: 1 },
          },
          purchaseActivityByCurrency: {
            BRL: { currency: 'BRL', cents: 90000, amount: '900.00', transactionCount: 1 },
            USD: { currency: 'USD', cents: 45000, amount: '450.00', transactionCount: 1 },
          },
          dataQuality: {
            ledgerAvailable: true,
            planHistoryAvailable: true,
            goalHistoryAvailable: true,
            valuationHistoryAvailable: false,
          },
          warnings: [],
        },
      ],
      safeCopy: {
        historicalValuationNote: 'Valuation note',
        historicalTargetNote: 'Target note',
        cashSourceNote: 'Cash source note',
        multiCurrencyNote: 'Valores em moedas diferentes são apresentados separadamente. O Atlas não aplica conversão cambial histórica nesta visão.',
      },
    });

    client.setQueryData(monthlyProgressQueryKey(portfolioId), multiCurrencyTimeline);

    const html = renderToString(
      <QueryClientProvider client={client}>
        <MonthlyProgressTimelineSection portfolioId={portfolioId} />
      </QueryClientProvider>,
    );

    // Separated currencies in summary banner
    expect(html).toContain('R$ 800.00');
    expect(html).toContain('US$ 400.00');
    expect(html).toContain('R$ 900.00');
    expect(html).toContain('US$ 450.00');

    // Never renders a fake combined total like 1200 or 1350
    expect(html).not.toContain('R$ 1200.00');
    expect(html).not.toContain('R$ 1350.00');

    // Disclaimer includes safe copy
    expect(html).toContain('Valores em moedas diferentes são apresentados separadamente');
  });
});
