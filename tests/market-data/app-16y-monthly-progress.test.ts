import { describe, it, expect } from 'vitest';
import {
  buildPortfolioMonthlyProgressTimeline,
  MonthlyProgressGoalInput,
  MonthlyProgressPlanInput,
  MonthlyProgressTransactionLinkInput,
  MonthlyProgressTransactionInput,
  parseDecimalStringToCents,
} from '../../packages/market-data/src/opportunity-radar/contribution-tracking';
import { OPPORTUNITY_MODEL_VERSION } from '../../packages/market-data/src/opportunity-radar/types';

describe('APP-16Y: Monthly Portfolio Progress & Goal History (Pure Engine)', () => {
  const portfolioId = 'port-123';

  it('Critical Test 1: Goals versioned across competencies (Jan-Jun=1000, Jul-Aug=1500)', () => {
    const goals: MonthlyProgressGoalInput[] = [
      {
        id: 'goal-1',
        amount: '1000.00',
        currency: 'BRL',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-07-01',
      },
      {
        id: 'goal-2',
        amount: '1500.00',
        currency: 'BRL',
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-08',
      goals,
    });

    expect(timeline.months).toHaveLength(8);
    // Jan-Jun: 1000.00
    for (let i = 0; i < 6; i++) {
      expect(timeline.months[i]!.goal?.amount).toBe('1000.00');
      expect(timeline.months[i]!.goal?.sourceId).toBe('goal-1');
    }
    // Jul-Aug: 1500.00
    for (let i = 6; i < 8; i++) {
      expect(timeline.months[i]!.goal?.amount).toBe('1500.00');
      expect(timeline.months[i]!.goal?.sourceId).toBe('goal-2');
    }
  });

  it('Critical Test 2: Multiple plans in the same month are both preserved without ambiguity', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-1',
        portfolioId,
        name: 'Plano Aporte A',
        plannedDate: '2026-11-05',
        status: 'COMPLETED',
        items: [{ category: 'STOCK', amount: '1200.00' }],
      },
      {
        id: 'plan-2',
        portfolioId,
        name: 'Plano Aporte B',
        plannedDate: '2026-11-20',
        status: 'PLANNED',
        items: [{ category: 'FII', amount: '800.00' }],
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
    });

    expect(timeline.months).toHaveLength(1);
    const nov = timeline.months[0]!;
    expect(nov.monthStatus).toBe('MULTIPLE_PLANS');
    expect(nov.plans).toHaveLength(2);
    expect(nov.plans[0]!.id).toBe('plan-1');
    expect(nov.plans[0]!.plannedCents).toBe(120000);
    expect(nov.plans[1]!.id).toBe('plan-2');
    expect(nov.plans[1]!.plannedCents).toBe(80000);
    expect(nov.totalPlannedCents).toBe(200000);
    expect(nov.totalPlannedAmount).toBe('2000.00');
    expect(nov.completedPlanCount).toBe(1);
    expect(nov.openPlanCount).toBe(1);
  });

  it('Critical Test 3: Plan with confirmed 700 and candidate 200 keeps them separated (never 900)', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-1',
        portfolioId,
        name: 'Plano Novembro',
        plannedDate: '2026-11-05',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-conf',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-06',
        amount: '700.00',
      },
      {
        id: 'tx-cand',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-07',
        amount: '200.00',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      {
        planId: 'plan-1',
        transactionId: 'tx-conf',
        status: 'CONFIRMED',
      },
      {
        planId: 'plan-1',
        transactionId: 'tx-cand',
        status: 'CANDIDATE',
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      links,
      transactions,
    });

    const nov = timeline.months[0]!;
    expect(nov.totalConfirmedCents).toBe(70000);
    expect(nov.totalConfirmedAmount).toBe('700.00');
    expect(nov.totalCandidateCents).toBe(20000);
    expect(nov.totalCandidateAmount).toBe('200.00');
    expect(nov.plans[0]!.confirmedCents).toBe(70000);
    expect(nov.plans[0]!.candidateCents).toBe(20000);
    expect(nov.plans[0]!.completionPercent).toBe(70);
  });

  it('Critical Test 4: Unlinked BUY transaction enters purchaseActivity but NOT confirmed', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-1',
        portfolioId,
        name: 'Plano Novembro',
        plannedDate: '2026-11-05',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-unlinked',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '500.00',
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      transactions,
    });

    const nov = timeline.months[0]!;
    expect(nov.purchaseActivityCents).toBe(50000);
    expect(nov.purchaseActivityAmount).toBe('500.00');
    expect(nov.purchaseTransactionCount).toBe(1);
    expect(nov.totalConfirmedCents).toBe(0);
    expect(nov.totalConfirmedAmount).toBe('0.00');
  });

  it('Critical Test 5: SELL transaction does not count towards purchaseActivity', () => {
    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-buy',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '300.00',
      },
      {
        id: 'tx-sell',
        portfolioId,
        type: 'SELL',
        tradeDate: '2026-11-15',
        amount: '400.00',
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      transactions,
    });

    const nov = timeline.months[0]!;
    expect(nov.purchaseActivityCents).toBe(30000);
    expect(nov.purchaseTransactionCount).toBe(1);
    expect(nov.sellActivityCents).toBe(40000);
    expect(nov.sellTransactionCount).toBe(1);
  });

  it('Critical Test 6: Transaction confirmed in plan does not cause double counting in month aggregate', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-1',
        portfolioId,
        name: 'Plano 1',
        plannedDate: '2026-11-05',
        status: 'COMPLETED',
        items: [{ category: 'STOCK', amount: '500.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-shared',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '500.00',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-1', transactionId: 'tx-shared', status: 'CONFIRMED' },
      { planId: 'plan-1', transactionId: 'tx-shared', status: 'CONFIRMED' }, // duplicate link entry defensive test
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      links,
      transactions,
    });

    expect(timeline.months[0]!.totalConfirmedCents).toBe(50000);
    expect(timeline.summary.totalConfirmedCents).toBe(50000);
  });

  it('Critical Test 7: Completed plan at 60% shows status=COMPLETED and completionPercent=60', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-close-60',
        portfolioId,
        name: 'Aporte Outubro',
        plannedDate: '2026-10-01',
        status: 'COMPLETED',
        completedAt: '2026-10-31T20:00:00Z',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-1',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-10-15',
        amount: '600.00',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-close-60', transactionId: 'tx-1', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-10',
      toMonth: '2026-10',
      plans,
      links,
      transactions,
    });

    const oct = timeline.months[0]!;
    expect(oct.plans[0]!.status).toBe('COMPLETED');
    expect(oct.plans[0]!.completedAt).toBe('2026-10-31T20:00:00Z');
    expect(oct.plans[0]!.completionPercent).toBe(60);
    expect(oct.monthStatus).toBe('PLAN_COMPLETED');
  });

  it('Critical Test 8: Empty month without activity is preserved in timeline (continuity)', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-06',
      toMonth: '2026-06',
    });

    expect(timeline.months).toHaveLength(1);
    const jun = timeline.months[0]!;
    expect(jun.competence).toBe('2026-06');
    expect(jun.goal).toBeNull();
    expect(jun.plans).toHaveLength(0);
    expect(jun.purchaseActivityCents).toBe(0);
    expect(jun.totalConfirmedCents).toBe(0);
    expect(jun.monthStatus).toBe('NO_GOAL');
  });

  it('Critical Test 9: Historical valuation is marked UNAVAILABLE and no fake historical equity series exists', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-03',
    });

    expect(timeline.historyCapabilities.valuationHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.allocationHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.targetHistory).toBe('UNAVAILABLE');
    expect(timeline.historyCapabilities.contributionPlanHistory).toBe('AVAILABLE');
    expect(timeline.historyCapabilities.contributionGoalHistory).toBe('AVAILABLE');
    expect(timeline.safeCopy.historicalValuationNote).toContain('não possui valuation histórico suficiente');
    for (const m of timeline.months) {
      expect(m.dataQuality.valuationHistoryAvailable).toBe(false);
      expect((m as any).historicalEquity).toBeUndefined();
    }
  });

  it('Critical Test 10: Current valuation state is isolated in currentPortfolioState', () => {
    const currentPortfolioState = {
      valuationQuality: 'VALUED_POSITIONS_ONLY' as const,
      totalEquity: '54200.00',
      totalPositions: 4,
      valuedPositions: 3,
      currentPositions: [
        { assetId: 'a1', ticker: 'PETR4', weightPercent: 40 },
        { assetId: 'a2', ticker: 'VALE3', weightPercent: 60 },
      ],
    };

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-03',
      currentPortfolioState,
    });

    expect(timeline.currentPortfolioState).toEqual(currentPortfolioState);
    // Historical months never contain current totalEquity
    for (const m of timeline.months) {
      expect((m as any).totalEquity).toBeUndefined();
    }
  });

  it('Critical Test 11: Historical target is marked UNAVAILABLE with safe copy note', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-03',
    });

    expect(timeline.historyCapabilities.targetHistory).toBe('UNAVAILABLE');
    expect(timeline.safeCopy.historicalTargetNote).toContain('não possuem versionamento histórico');
  });

  it('Critical Test 12: Range 12 months generates strictly oldest to newest', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2025-12',
      toMonth: '2026-11',
    });

    expect(timeline.months).toHaveLength(12);
    expect(timeline.months[0]!.competence).toBe('2025-12');
    expect(timeline.months[11]!.competence).toBe('2026-11');
    for (let i = 1; i < 12; i++) {
      expect(timeline.months[i]!.competence > timeline.months[i - 1]!.competence).toBe(true);
    }
  });

  it('Critical Test 13: Range > 60 months or from > to throws error', () => {
    expect(() =>
      buildPortfolioMonthlyProgressTimeline({
        portfolioId,
        fromMonth: '2026-12',
        toMonth: '2026-01',
      }),
    ).toThrow(/fromMonth.*cannot be after toMonth/);

    expect(() =>
      buildPortfolioMonthlyProgressTimeline({
        portfolioId,
        fromMonth: '2020-01',
        toMonth: '2026-01', // 73 months
      }),
    ).toThrow(/exceeds maximum limit of 60 months/);
  });

  it('Critical Test 15: Money conservation across all months in summary', () => {
    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-1', portfolioId, type: 'BUY', tradeDate: '2026-01-10', amount: '100.50' },
      { id: 'tx-2', portfolioId, type: 'BUY', tradeDate: '2026-02-10', amount: '200.25' },
    ];
    const plans: MonthlyProgressPlanInput[] = [
      { id: 'p-1', portfolioId, name: 'P1', plannedDate: '2026-01-01', status: 'COMPLETED', items: [{ amount: '100.50' }] },
      { id: 'p-2', portfolioId, name: 'P2', plannedDate: '2026-02-01', status: 'COMPLETED', items: [{ amount: '200.25' }] },
    ];
    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'p-1', transactionId: 'tx-1', status: 'CONFIRMED' },
      { planId: 'p-2', transactionId: 'tx-2', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-02',
      plans,
      links,
      transactions,
    });

    expect(timeline.summary.totalConfirmedCents).toBe(30075);
    expect(timeline.summary.totalConfirmedAmount).toBe('300.75');
    expect(timeline.summary.totalPurchaseActivityCents).toBe(30075);
    expect(timeline.summary.totalPurchaseActivityAmount).toBe('300.75');
  });

  it('Critical Test 16: Same input produces 100% deterministic output 100 times', () => {
    const params = {
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-06',
      goals: [
        { id: 'g1', amount: '1000.00', currency: 'BRL', effectiveFrom: '2026-01-01', effectiveTo: null },
      ],
      plans: [
        { id: 'p1', portfolioId, name: 'Plan 1', plannedDate: '2026-03-01', status: 'PLANNED', items: [{ amount: '500.00' }] },
      ],
      transactions: [
        { id: 'tx1', portfolioId, type: 'BUY', tradeDate: '2026-03-05', amount: '500.00' },
      ],
      links: [
        { planId: 'p1', transactionId: 'tx1', status: 'CONFIRMED' },
      ],
    };

    const first = JSON.stringify(buildPortfolioMonthlyProgressTimeline(params));
    for (let i = 0; i < 100; i++) {
      const current = JSON.stringify(buildPortfolioMonthlyProgressTimeline(params));
      expect(current).toBe(first);
    }
  });

  it('Model version is OPPORTUNITY_MODEL_VERSION (opportunity-v2.3.1)', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
    });
    expect(timeline.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(timeline.modelVersion).toBe('opportunity-v2.3.1');
  });
});
